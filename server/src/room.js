// GameRoom Durable Object (방마다 1개): 최대 4자리, 신호만 중계한다.
// - 게임 계산은 방장(1P) 폰이 한다. 서버는 게스트 입력 → 방장, 방장 상태 → 게스트로 전달만
// - 게임 상태는 저장하지 않는다. 방장 ID·시작 여부만 작은 표(meta)에 두고, 빈 방은 지운다
import { DurableObject } from 'cloudflare:workers';
import { LIMITS, json, errorJson } from './util.js';

// 방장이 게스트에게 그대로 넘기는 메시지 종류
const HOST_RELAY = new Set(['st', 'ev', 'pause', 'resume', 'start']);

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  }

  getMeta(k) {
    const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return r ? r.v : null;
  }

  setMeta(k, v) {
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 내부 전용: Lobby가 방을 만들 때 (Worker 입구는 /internal/을 전달하지 않음)
    if (url.pathname === '/internal/init') {
      if (this.getMeta('host')) return errorJson(409, 'room_exists', '이미 있는 방이에요.');
      const { hostId } = await request.json();
      this.setMeta('host', hostId);
      this.setMeta('started', '0');
      this.setMeta('created', Date.now());
      await this.ctx.storage.setAlarm(Date.now() + LIMITS.ROOM_EMPTY_TTL_MS);
      return json({ ok: true });
    }

    if (!this.getMeta('host')) return errorJson(404, 'room_not_found', '방을 찾을 수 없어요. 이미 끝났을 수 있어요.');
    if (request.headers.get('Upgrade') !== 'websocket') return errorJson(426, 'upgrade_required', 'WebSocket으로 연결해 주세요.');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot: 0, openedAt: Date.now() });
    await this.scheduleAlarm(Date.now() + LIMITS.AUTH_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ------------------------------------------------------------------ 메시지
  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    const att = ws.deserializeAttachment() || {};

    if (!att.slot) {
      if (message.length > LIMITS.BODY_MAX) return;
      await this.join(ws, att, message);
      return;
    }

    if (att.slot === 1) {
      // 방장: 스냅샷 등은 해석 최소화하고 그대로 전달
      if (message.length > LIMITS.HOST_MSG_MAX) return;
      const t = peekType(message);
      if (t === 'start') {
        if (this.getMeta('started') === '1') return;
        this.setMeta('started', '1');
      } else if (t === 'end') {
        this.setMeta('started', '0'); // 결과 화면 → 대기실에서 다시 시작 가능
        return;
      }
      if (HOST_RELAY.has(t)) this.broadcast(message, ws);
      return;
    }

    // 게스트: 입력만 방장에게. 자리 번호(s)는 서버가 붙임 (속이기 방지)
    if (message.length > LIMITS.BODY_MAX) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || msg.t !== 'in') return;
    const host = this.socketOf(1);
    if (host) safeSend(host, { ...msg, s: att.slot });
  }

  // 첫 메시지 {t:"auth", token} → Lobby에 물어 사용자 확인 → 자리 배정
  async join(ws, att, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { msg = null; }
    const user = msg && msg.t === 'auth' ? await this.whoami(msg.token) : null;
    if (!user) {
      safeSend(ws, { t: 'error', error: 'unauthorized' });
      ws.close(4001, 'unauthorized');
      return;
    }

    // 같은 사람이 다시 들어오면 예전 연결을 정리하고 같은 자리로
    let slot = 0;
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const a = other.deserializeAttachment();
      if (a && a.userId === user.userId && a.slot) {
        slot = a.slot;
        other.serializeAttachment({ ...a, slot: 0, replaced: true });
        try { other.close(4003, 'replaced'); } catch { /* 이미 닫힘 */ }
      }
    }

    if (!slot) {
      if (this.getMeta('started') === '1') {
        safeSend(ws, { t: 'error', error: 'started' });
        ws.close(4005, 'started');
        return;
      }
      const used = new Set(this.members().map((m) => m.slot));
      if (user.userId === this.getMeta('host')) {
        slot = 1;
      } else {
        for (let s = 2; s <= LIMITS.MAX_PLAYERS; s++) if (!used.has(s)) { slot = s; break; }
      }
      if (!slot || used.has(slot)) {
        safeSend(ws, { t: 'full' });
        ws.close(4004, 'full');
        return;
      }
    }

    ws.serializeAttachment({ slot, userId: user.userId, nickname: user.nickname, openedAt: att.openedAt });
    const members = this.members();
    safeSend(ws, { t: 'seat', slot, members, started: this.getMeta('started') === '1' });
    this.broadcast(JSON.stringify({ t: 'members', members }), ws);
  }

  async whoami(token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const res = await this.env.LOBBY.getByName('main').fetch('https://lobby.internal/internal/whoami', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.ok ? res.json() : null;
  }

  // ------------------------------------------------------------------ 나가기·정리
  async webSocketClose(ws) { this.leave(ws); }

  async webSocketError(ws) { this.leave(ws); }

  leave(ws) {
    const att = ws.deserializeAttachment();
    if (!att || !att.slot) return;
    ws.serializeAttachment({ ...att, slot: 0 });
    const left = this.ctx.getWebSockets().filter((s) => s !== ws && s.deserializeAttachment()?.slot);
    if (!left.length) {
      // 마지막 사람이 나가면 방 정리 (다시 들어올 수 없음)
      this.sql.exec('DELETE FROM meta');
      return;
    }
    if (att.slot === 1) {
      // 방장 넘기기는 1차에서 하지 않음 (4단계에서 30초 기다림 추가)
      this.broadcast(JSON.stringify({ t: 'hostleft' }), ws);
    } else {
      this.broadcast(JSON.stringify({ t: 'members', members: this.members(ws) }), ws);
    }
  }

  // 인증 안 한 연결(5초) 끊기, 아무도 안 들어온 방(10분) 정리
  async alarm() {
    const now = Date.now();
    let next = null;
    let anyone = false;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      if (att.slot) { anyone = true; continue; }
      if (att.replaced) continue;
      const due = att.openedAt + LIMITS.AUTH_TIMEOUT_MS;
      if (now >= due) { try { ws.close(4001, 'auth timeout'); } catch { /* 이미 닫힘 */ } } else if (next === null || due < next) next = due;
    }
    const created = Number(this.getMeta('created') || 0);
    if (!anyone && created) {
      const expire = created + LIMITS.ROOM_EMPTY_TTL_MS;
      if (now >= expire) this.sql.exec('DELETE FROM meta');
      else if (next === null || expire < next) next = expire;
    }
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  async scheduleAlarm(time) {
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || cur > time) await this.ctx.storage.setAlarm(time);
  }

  // ------------------------------------------------------------------ 도구
  members(exclude) {
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const a = ws.deserializeAttachment();
      if (a && a.slot) list.push({ slot: a.slot, userId: a.userId, nickname: a.nickname });
    }
    return list.sort((a, b) => a.slot - b.slot);
  }

  socketOf(slot) {
    return this.ctx.getWebSockets().find((ws) => ws.deserializeAttachment()?.slot === slot) || null;
  }

  // 자리를 받은 사람 모두에게 (보낸 사람 제외)
  broadcast(text, except) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      if (!ws.deserializeAttachment()?.slot) continue;
      try { ws.send(text); } catch { /* 닫히는 중 */ }
    }
  }
}

function safeSend(ws, msg) {
  try { ws.send(JSON.stringify(msg)); } catch { /* 닫히는 중 */ }
}

// 큰 스냅샷을 매번 전부 해석하지 않도록 앞부분에서 종류만 읽음: {"t":"st",...}
function peekType(text) {
  const m = text.slice(0, 24).match(/^\{\s*"t"\s*:\s*"([a-z]+)"/);
  return m ? m[1] : '';
}
