// GameRoom Durable Object (방마다 1개): 최대 4자리, 신호만 중계한다.
// - 게임 계산은 방장(1P) 폰이 한다. 서버는 게스트 입력 → 방장, 방장 상태 → 게스트로 전달만
// - 게임 상태는 저장하지 않는다. 방장·시작 여부(meta)와 자리 목록(seats)만 작은 표에 두고, 방이 끝나면 지운다
// - 끊김 처리(4단계): 게임 중 게스트가 끊기면 15초, 방장이 끊기거나 앱을 내리면 30초 기다린다
import { DurableObject } from 'cloudflare:workers';
import { LIMITS, holdMs, createRateLimiter, json, errorJson } from './util.js';

// 방장이 게스트에게 그대로 넘기는 메시지 종류 (shop·shopst: 2차 상점 시작·구매 결과)
const HOST_RELAY = new Set(['st', 'ev', 'pause', 'resume', 'start', 'shop', 'shopst']);

// 게스트가 방장에게 보낼 수 있는 메시지와 남길 값 (나머지 값은 버림)
// in: 조작 입력 / buy·undo·ready: 2차 상점 구매·되돌리기·준비 완료
const GUEST_RELAY = {
  in: null, // 1차 그대로 전달 (x, y, k, b, c, g)
  buy: (m) => (typeof m.item === 'string' && m.item.length <= 16 ? { item: m.item } : null),
  undo: () => ({}),
  ready: () => ({}),
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seats (
        slot INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL,
        away_until INTEGER
      );
    `);
    this.allow = createRateLimiter();
  }

  getMeta(k) {
    const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return r ? r.v : null;
  }

  setMeta(k, v) {
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
  }

  delMeta(k) { this.sql.exec('DELETE FROM meta WHERE k = ?', k); }

  started() { return this.getMeta('started') === '1'; }

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
    try {
      if (typeof message !== 'string' || !this.allow(ws)) return; // 초당 30건 초과는 무시
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
          if (this.started()) return;
          this.setMeta('started', '1');
        } else if (t === 'end') {
          this.setMeta('started', '0'); // 결과 화면 → 대기실에서 다시 시작 가능
          this.delMeta('paused_until');
          return;
        } else if (t === 'pause') {
          // 방장이 앱을 내림 → 30초 안에 돌아오지 않으면 방 종료
          const until = Date.now() + holdMs(this.env, 'HOST_HOLD_MS');
          this.setMeta('paused_until', until);
          await this.scheduleAlarm(until);
        } else if (t === 'resume') {
          this.delMeta('paused_until');
        }
        if (HOST_RELAY.has(t)) this.broadcast(message, ws);
        return;
      }

      // 게스트: 입력·상점 요청만 방장에게. 자리 번호(s)는 서버가 붙임 (속이기 방지). 4KB 초과·다른 종류는 무시
      if (message.length > LIMITS.BODY_MAX) return;
      let msg;
      try { msg = JSON.parse(message); } catch { return; }
      if (!msg || typeof msg.t !== 'string' || !Object.hasOwn(GUEST_RELAY, msg.t)) return;
      const pick = GUEST_RELAY[msg.t];
      const body = pick ? pick(msg) : msg;
      if (!body) return;
      const host = this.socketOf(1);
      if (host) safeSend(host, { ...body, t: msg.t, s: att.slot });
    } catch (e) {
      console.error('GameRoom 메시지 처리 오류', e && e.stack ? e.stack : String(e));
    }
  }

  // 첫 메시지 {t:"auth", token} → Lobby에 물어 사용자 확인 → 자리 배정 (끊겼던 사람은 같은 자리로)
  async join(ws, att, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { msg = null; }
    const user = msg && msg.t === 'auth' ? await this.whoami(msg.token) : null;
    if (!user) {
      safeSend(ws, { t: 'error', error: 'unauthorized' });
      ws.close(4001, 'unauthorized');
      return;
    }

    // 같은 사람의 예전 연결이 남아 있으면 정리 (새 연결이 이어받음)
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const a = other.deserializeAttachment();
      if (a && a.userId === user.userId && a.slot) {
        other.serializeAttachment({ ...a, slot: 0, replaced: true });
        try { other.close(4003, 'replaced'); } catch { /* 이미 닫힘 */ }
      }
    }

    const seat = this.sql.exec('SELECT slot, away_until FROM seats WHERE user_id = ?', user.userId).toArray()[0];
    let slot;
    let wasAway = false;
    if (seat) {
      slot = seat.slot;
      wasAway = seat.away_until !== null;
      this.sql.exec('UPDATE seats SET away_until = NULL, nickname = ? WHERE slot = ?', user.nickname, slot);
    } else {
      if (this.started()) {
        safeSend(ws, { t: 'error', error: 'started' });
        ws.close(4005, 'started');
        return;
      }
      const used = new Set(this.sql.exec('SELECT slot FROM seats').toArray().map((r) => r.slot));
      slot = 0;
      if (user.userId === this.getMeta('host')) slot = used.has(1) ? 0 : 1;
      else for (let s = 2; s <= LIMITS.MAX_PLAYERS; s++) if (!used.has(s)) { slot = s; break; }
      if (!slot) {
        safeSend(ws, { t: 'full' });
        ws.close(4004, 'full');
        return;
      }
      this.sql.exec('INSERT INTO seats (slot, user_id, nickname, away_until) VALUES (?, ?, ?, NULL)', slot, user.userId, user.nickname);
    }

    ws.serializeAttachment({ slot, userId: user.userId, nickname: user.nickname, openedAt: att.openedAt });
    const members = this.members();
    safeSend(ws, { t: 'seat', slot, members, started: this.started() });
    this.broadcast(JSON.stringify({ t: 'members', members }), ws);
    if (wasAway) {
      if (slot === 1) this.broadcast(JSON.stringify({ t: 'hostback' }), ws);
      else { const host = this.socketOf(1); if (host) safeSend(host, { t: 'back', slot }); }
    }
  }

  async whoami(token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const res = await this.env.LOBBY.getByName('main').fetch('https://lobby.internal/internal/whoami', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.ok ? res.json() : null;
  }

  // ------------------------------------------------------------------ 나가기·끊김
  async webSocketClose(ws) { await this.leave(ws); }

  async webSocketError(ws) { await this.leave(ws); }

  async leave(ws) {
    try {
      const att = ws.deserializeAttachment();
      if (!att || !att.slot || !this.getMeta('host')) return;
      ws.serializeAttachment({ ...att, slot: 0 });
      const { slot } = att;

      if (this.started()) {
        // 게임 중: 자리를 잠시 남겨 두고 기다림 (게스트 15초, 방장 30초)
        const until = Date.now() + holdMs(this.env, slot === 1 ? 'HOST_HOLD_MS' : 'GUEST_HOLD_MS');
        this.sql.exec('UPDATE seats SET away_until = ? WHERE slot = ?', until, slot);
        await this.scheduleAlarm(until);
        if (slot === 1) this.broadcast(JSON.stringify({ t: 'hostaway' }), ws);
        else { const host = this.socketOf(1); if (host) safeSend(host, { t: 'away', slot }); }
        this.broadcast(JSON.stringify({ t: 'members', members: this.members() }), ws);
        return;
      }

      // 대기실: 바로 자리 비움. 방장이 나가면 방 종료
      if (slot === 1) { this.endRoom(); return; }
      this.sql.exec('DELETE FROM seats WHERE slot = ?', slot);
      this.broadcast(JSON.stringify({ t: 'members', members: this.members() }), ws);
      if (!this.connectedCount()) this.endRoom();
    } catch (e) {
      console.error('GameRoom 나가기 처리 오류', e && e.stack ? e.stack : String(e));
    }
  }

  // 방 종료: 모두에게 알리고 연결을 닫고 기록 삭제 (방장 넘기기는 1차에서 하지 않음)
  endRoom() {
    const text = JSON.stringify({ t: 'hostleft' });
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      ws.serializeAttachment({ ...a, slot: 0 });
      try { ws.send(text); ws.close(4006, 'room closed'); } catch { /* 이미 닫힘 */ }
    }
    this.sql.exec('DELETE FROM meta');
    this.sql.exec('DELETE FROM seats');
  }

  // 정리 알람: 인증 안 한 연결(5초), 돌아오지 않은 자리(15·30초), 방장 일시정지(30초), 아무도 안 들어온 방(10분)
  async alarm() {
    const now = Date.now();
    let next = null;
    const later = (t) => { if (next === null || t < next) next = t; };

    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      if (att.slot || att.replaced) continue;
      const due = att.openedAt + LIMITS.AUTH_TIMEOUT_MS;
      if (now >= due) { try { ws.close(4001, 'auth timeout'); } catch { /* 이미 닫힘 */ } } else later(due);
    }
    if (!this.getMeta('host')) return;

    const paused = Number(this.getMeta('paused_until') || 0);
    if (paused && now >= paused) { this.endRoom(); return; }
    if (paused) later(paused);

    for (const s of this.sql.exec('SELECT slot, away_until FROM seats WHERE away_until IS NOT NULL').toArray()) {
      if (now < s.away_until) { later(s.away_until); continue; }
      if (s.slot === 1) { this.endRoom(); return; }
      this.sql.exec('DELETE FROM seats WHERE slot = ?', s.slot);
      this.broadcast(JSON.stringify({ t: 'members', members: this.members() }));
    }

    const seats = this.sql.exec('SELECT COUNT(*) AS n FROM seats').one().n;
    const created = Number(this.getMeta('created') || 0);
    if (!seats && created) {
      const expire = created + LIMITS.ROOM_EMPTY_TTL_MS;
      if (now >= expire) { this.endRoom(); return; }
      later(expire);
    }
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  async scheduleAlarm(time) {
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || cur > time) await this.ctx.storage.setAlarm(time);
  }

  // ------------------------------------------------------------------ 도구
  // 자리 목록 (away: 연결이 끊겨 기다리는 중)
  members() {
    return this.sql.exec('SELECT slot, user_id, nickname, away_until FROM seats ORDER BY slot').toArray()
      .map((r) => ({ slot: r.slot, userId: r.user_id, nickname: r.nickname, away: r.away_until !== null }));
  }

  connectedCount() {
    return this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.slot).length;
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
