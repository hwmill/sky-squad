// Lobby Durable Object (전체에 1개): 사용자·친구 저장(SQLite), 접속 표시(WebSocket)
// WebSocket은 절전(Hibernation) 방식: 메시지가 없을 때는 실행 시간이 과금되지 않는다.
import { DurableObject } from 'cloudflare:workers';
import {
  LIMITS, INVITE_CODE_RE, USER_ID_RE, ROOM_ID_RE, HttpError, json, errorJson, readJson, createRateLimiter,
  isValidNickname, newUserId, newInviteCode, newRoomId, newToken, sha256Hex,
} from './util.js';

const NICK_ERROR = '닉네임은 1~8자의 한글·영문·숫자만 쓸 수 있어요.';

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // 절전에서 깨어날 때마다 다시 실행되므로 가볍게 (IF NOT EXISTS)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL,
        invite_code TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      );
    `);
    this.allow = createRateLimiter();
  }

  // ------------------------------------------------------------------ REST
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ws/lobby') return this.openSocket(request);
    try {
      return await this.route(request, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return errorJson(e.status, e.code, e.message);
      console.error('Lobby 요청 처리 오류', request.method, url.pathname, e && e.stack ? e.stack : String(e));
      throw e;
    }
  }

  async route(request, path) {
    const m = request.method;
    // 내부 전용: 게임방(GameRoom)이 토큰 주인을 물어봄. Worker 입구는 /internal/을 전달하지 않으므로 밖에서는 못 부름
    if (m === 'POST' && path === '/internal/whoami') return this.whoami(request);
    if (m === 'POST' && path === '/api/register') return this.register(request);

    const me = await this.userFromRequest(request);
    if (!me) return errorJson(401, 'unauthorized', '등록 정보가 맞지 않아요. 앱 데이터를 지웠다면 다시 등록해 주세요.');

    if (m === 'GET' && path === '/api/me') return json({ userId: me.id, nickname: me.nickname, inviteCode: me.invite_code });
    if (m === 'PATCH' && path === '/api/me') return this.rename(request, me);
    if (m === 'POST' && path === '/api/friends/accept') return this.accept(request, me);
    if (m === 'GET' && path === '/api/friends') return json({ friends: this.friendList(me.id) });
    const del = path.match(/^\/api\/friends\/([^/]+)$/);
    if (m === 'DELETE' && del) return this.unfriend(me, del[1]);
    if (m === 'POST' && path === '/api/invite-code/reset') return this.resetInvite(me);
    if (m === 'POST' && path === '/api/rooms') return this.createRoom(me);
    return errorJson(404, 'not_found', '없는 주소예요.');
  }

  async whoami(request) {
    const body = await readJson(request);
    const user = await this.userFromToken(body.token);
    return user ? json({ userId: user.id, nickname: user.nickname }) : errorJson(401, 'unauthorized', '등록 정보가 맞지 않아요.');
  }

  // 게임방 만들기: 요청한 사람이 1P 방장
  async createRoom(me) {
    for (let i = 0; i < 5; i++) {
      const roomId = newRoomId();
      const res = await this.env.ROOM.getByName(roomId).fetch('https://room.internal/internal/init', {
        method: 'POST',
        body: JSON.stringify({ hostId: me.id }),
      });
      if (res.ok) return json({ roomId });
    }
    return errorJson(500, 'room_failed', '방을 만들지 못했어요. 잠시 후 다시 해 주세요.');
  }

  async register(request) {
    const body = await readJson(request);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (!isValidNickname(nickname)) return errorJson(400, 'bad_nickname', NICK_ERROR);
    const userId = this.uniqueValue(newUserId, 'id');
    const inviteCode = this.uniqueValue(newInviteCode, 'invite_code');
    const token = newToken();
    this.sql.exec(
      'INSERT INTO users (id, token_hash, nickname, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, await sha256Hex(token), nickname, inviteCode, Date.now(),
    );
    return json({ userId, token, inviteCode });
  }

  // 겹치지 않는 값이 나올 때까지 다시 만듦 (실제로는 거의 한 번에 끝남)
  uniqueValue(make, column) {
    for (let i = 0; i < 5; i++) {
      const v = make();
      if (!this.sql.exec(`SELECT 1 FROM users WHERE ${column} = ?`, v).toArray().length) return v;
    }
    throw new HttpError(500, 'id_collision', '잠시 후 다시 시도해 주세요.');
  }

  // Authorization: Bearer <토큰> → 사용자 (없으면 null)
  async userFromRequest(request) {
    const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/);
    return m ? this.userFromToken(m[1]) : null;
  }

  async userFromToken(token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const rows = this.sql.exec('SELECT id, nickname, invite_code FROM users WHERE token_hash = ?', await sha256Hex(token)).toArray();
    return rows[0] || null;
  }

  async rename(request, me) {
    const body = await readJson(request);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (!isValidNickname(nickname)) return errorJson(400, 'bad_nickname', NICK_ERROR);
    this.sql.exec('UPDATE users SET nickname = ? WHERE id = ?', nickname, me.id);
    this.notifyFriends(me.id, { t: 'friend', friend: { userId: me.id, nickname, online: this.isOnline(me.id) } });
    return json({ ok: true });
  }

  // 초대 코드로 친구 맺기 (양쪽 모두 등록)
  async accept(request, me) {
    const body = await readJson(request);
    const code = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '';
    const owner = INVITE_CODE_RE.test(code)
      ? this.sql.exec('SELECT id, nickname FROM users WHERE invite_code = ?', code).toArray()[0]
      : null;
    if (!owner) return errorJson(404, 'invite_not_found', '초대 링크가 잘못됐거나 새 링크로 바뀌었어요.');
    if (owner.id === me.id) return errorJson(400, 'self_invite', '내 초대 링크예요. 친구에게 보내 주세요.');
    const now = Date.now();
    this.sql.exec('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', me.id, owner.id, now);
    this.sql.exec('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)', owner.id, me.id, now);
    // 초대한 사람 화면에도 바로 나타나게
    this.sendTo(owner.id, { t: 'friend', friend: { userId: me.id, nickname: me.nickname, online: this.isOnline(me.id) } });
    return json({ friend: { userId: owner.id, nickname: owner.nickname, online: this.isOnline(owner.id) } });
  }

  friendIds(userId) {
    return this.sql.exec('SELECT friend_id FROM friends WHERE user_id = ?', userId).toArray().map((r) => r.friend_id);
  }

  friendList(userId) {
    const online = this.onlineUsers();
    return this.sql.exec(
      'SELECT u.id AS userId, u.nickname AS nickname FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.nickname',
      userId,
    ).toArray().map((r) => ({ userId: r.userId, nickname: r.nickname, online: online.has(r.userId) }));
  }

  unfriend(me, otherId) {
    if (!USER_ID_RE.test(otherId)) return errorJson(404, 'not_found', '없는 친구예요.');
    this.sql.exec('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', me.id, otherId, otherId, me.id);
    this.sendTo(otherId, { t: 'unfriend', userId: me.id });
    return json({ ok: true });
  }

  resetInvite(me) {
    const inviteCode = this.uniqueValue(newInviteCode, 'invite_code');
    this.sql.exec('UPDATE users SET invite_code = ? WHERE id = ?', inviteCode, me.id);
    return json({ inviteCode });
  }

  // ------------------------------------------------------------------ WebSocket (접속 표시)
  async openSocket(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return errorJson(426, 'upgrade_required', 'WebSocket으로 연결해 주세요.');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    server.serializeAttachment({ userId: null, openedAt: now, lastSeen: now });
    await this.scheduleSweep(now + LIMITS.AUTH_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    try {
      await this.handleMessage(ws, message);
    } catch (e) {
      console.error('Lobby 메시지 처리 오류', e && e.stack ? e.stack : String(e));
    }
  }

  async handleMessage(ws, message) {
    // 4KB 초과, 초당 30건 초과는 무시
    if (typeof message !== 'string' || message.length > LIMITS.BODY_MAX || !this.allow(ws)) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || {};
    const now = Date.now();

    // 첫 메시지는 반드시 인증 (토큰은 URL이 아니라 메시지로 받음)
    if (!att.userId) {
      const user = msg.t === 'auth' ? await this.userFromToken(msg.token) : null;
      if (!user) {
        this.safeSend(ws, { t: 'error', error: 'unauthorized' });
        ws.close(4001, 'unauthorized');
        return;
      }
      const wasOnline = this.isOnline(user.id, ws);
      ws.serializeAttachment({ ...att, userId: user.id, lastSeen: now });
      this.safeSend(ws, { t: 'ready', userId: user.id, friends: this.friendList(user.id) });
      if (!wasOnline) this.notifyFriends(user.id, { t: 'presence', userId: user.id, online: true });
      await this.scheduleSweep(now + LIMITS.PING_TIMEOUT_MS);
      return;
    }

    att.lastSeen = now;
    ws.serializeAttachment(att);
    if (msg.t === 'ping') this.safeSend(ws, { t: 'pong' });
    else if (msg.t === 'invite') this.relayInvite(ws, att.userId, msg);
    // 알 수 없는 종류는 무시
  }

  // 친구에게 게임방 초대 알림 (친구가 아니면 거부)
  relayInvite(ws, fromId, msg) {
    const to = typeof msg.to === 'string' ? msg.to : '';
    const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
    if (!USER_ID_RE.test(to) || !ROOM_ID_RE.test(roomId)) return;
    const isFriend = this.sql.exec('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?', fromId, to).toArray().length > 0;
    if (!isFriend) { this.safeSend(ws, { t: 'error', error: 'not_friend' }); return; }
    const me = this.sql.exec('SELECT nickname FROM users WHERE id = ?', fromId).toArray()[0];
    this.sendTo(to, { t: 'invited', from: { userId: fromId, nickname: me ? me.nickname : '' }, roomId });
  }

  async webSocketClose(ws) {
    try { this.handleGone(ws); } catch (e) { console.error('Lobby 연결 종료 처리 오류', e && e.stack ? e.stack : String(e)); }
  }

  async webSocketError(ws, error) {
    // 폰 화면이 꺼지거나 네트워크가 끊길 때도 여기로 옴 → 원인 구분용으로 기록
    console.warn('Lobby WebSocket 오류(연결 끊김 포함)', error && error.message ? error.message : String(error));
    try { this.handleGone(ws); } catch (e) { console.error('Lobby 연결 오류 처리 오류', e && e.stack ? e.stack : String(e)); }
  }

  // 그 사람의 마지막 연결이 끊겼으면 친구들에게 '접속 끊김' 알림
  handleGone(ws) {
    const att = ws.deserializeAttachment();
    if (att && att.userId && !this.isOnline(att.userId, ws)) {
      this.notifyFriends(att.userId, { t: 'presence', userId: att.userId, online: false });
    }
  }

  // 정리 알람: 인증 안 한 연결(5초)과 응답 없는 연결(60초)을 끊는다
  async alarm() {
    const now = Date.now();
    let next = null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      const due = att.userId ? att.lastSeen + LIMITS.PING_TIMEOUT_MS : att.openedAt + LIMITS.AUTH_TIMEOUT_MS;
      if (now >= due) {
        try { ws.close(att.userId ? 4002 : 4001, att.userId ? 'timeout' : 'auth timeout'); } catch { /* 이미 닫힘 */ }
        if (att.userId) {
          ws.serializeAttachment({ ...att, userId: null }); // 다시 세지 않게
          if (!this.isOnline(att.userId, ws)) this.notifyFriends(att.userId, { t: 'presence', userId: att.userId, online: false });
        }
      } else if (next === null || due < next) {
        next = due;
      }
    }
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  // 알람은 하나만 걸 수 있으므로, 더 이른 시각일 때만 바꿈
  async scheduleSweep(time) {
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || cur > time) await this.ctx.storage.setAlarm(time);
  }

  // ------------------------------------------------------------------ 접속자 도구
  onlineUsers() {
    const set = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.userId) set.add(att.userId);
    }
    return set;
  }

  isOnline(userId, exclude) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const att = ws.deserializeAttachment();
      if (att && att.userId === userId) return true;
    }
    return false;
  }

  safeSend(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* 닫히는 중 */ }
  }

  sendTo(userId, msg) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.userId === userId) this.safeSend(ws, msg);
    }
  }

  notifyFriends(userId, msg) {
    const ids = new Set(this.friendIds(userId));
    if (!ids.size) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && ids.has(att.userId)) this.safeSend(ws, msg);
    }
  }
}
