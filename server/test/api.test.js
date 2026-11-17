// API 테스트 (SPEC 7장, 2단계 확인 기준): 등록, 친구 맺기·삭제, 오류 코드, 접속 표시
import { describe, it, expect } from 'vitest';
import { exports } from 'cloudflare:workers';

const ORIGIN = 'https://hwmill.github.io';
const BASE = 'https://api.test';

function call(path, { method = 'GET', token, body, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return exports.default.fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function register(nickname) {
  const res = await call('/api/register', { method: 'POST', body: { nickname } });
  expect(res.status).toBe(200);
  return { nickname, ...(await res.json()) };
}

// WebSocket 열고 받은 메시지를 모아 둠
async function openLobby(token) {
  const res = await exports.default.fetch(`${BASE}/ws/lobby`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  ws.accept();
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    // 기다리는 쪽이 있으면 바로 넘기고, 없으면 보관 (한 메시지는 한 번만 꺼냄)
    const w = waiters.find((x) => x.match(msg));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); } else inbox.push(msg);
  });
  const next = (match) => {
    const found = inbox.find(match);
    if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      waiters.push({ match, resolve });
      setTimeout(() => reject(new Error('메시지를 기다리다 시간 초과')), 3000);
    });
  };
  if (token) ws.send(JSON.stringify({ t: 'auth', token }));
  return { ws, next };
}

describe('등록', () => {
  it('닉네임으로 등록하면 userId(12자)·token·inviteCode(8자)를 받는다', async () => {
    const u = await register('아빠');
    expect(u.userId).toMatch(/^[a-z0-9]{12}$/);
    expect(u.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(u.token.length).toBeGreaterThanOrEqual(43);
    const me = await (await call('/api/me', { token: u.token })).json();
    expect(me).toEqual({ userId: u.userId, nickname: '아빠', inviteCode: u.inviteCode });
  });

  it('닉네임 규칙(1~8자, 한글·영문·숫자) 위반은 400', async () => {
    for (const nickname of ['', '아홉글자닉네임입니다', 'a b', '<b>', '😀']) {
      const res = await call('/api/register', { method: 'POST', body: { nickname } });
      expect(res.status, nickname).toBe(400);
      expect((await res.json()).error).toBe('bad_nickname');
    }
  });

  it('닉네임 변경 (PATCH /api/me)', async () => {
    const u = await register('엄마');
    const res = await call('/api/me', { method: 'PATCH', token: u.token, body: { nickname: 'Mom2' } });
    expect(await res.json()).toEqual({ ok: true });
    expect((await (await call('/api/me', { token: u.token })).json()).nickname).toBe('Mom2');
  });
});

describe('인증·주소 확인', () => {
  it('잘못된 토큰이면 401', async () => {
    expect((await call('/api/friends', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await call('/api/friends')).status).toBe(401);
  });

  it('허용되지 않은 Origin이면 403, 허용 주소는 CORS 헤더가 붙는다', async () => {
    expect((await call('/api/register', { method: 'POST', body: { nickname: 'a' }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/api/register', { method: 'POST', body: { nickname: 'a' }, origin: null })).status).toBe(403);
    const pre = await call('/api/friends', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('토큰은 서버에 해시로만 저장된다 (응답·조회 어디에도 원문이 다시 나오지 않음)', async () => {
    const u = await register('토큰확인');
    const text = await (await call('/api/me', { token: u.token })).text();
    expect(text).not.toContain(u.token);
  });
});

describe('친구', () => {
  it('초대 코드로 친구 맺기 → 양쪽 목록에 모두 보인다', async () => {
    const a = await register('아빠');
    const b = await register('엄마');
    const res = await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } });
    expect(res.status).toBe(200);
    expect((await res.json()).friend).toMatchObject({ userId: a.userId, nickname: '아빠' });

    const la = (await (await call('/api/friends', { token: a.token })).json()).friends;
    const lb = (await (await call('/api/friends', { token: b.token })).json()).friends;
    expect(la.map((f) => f.userId)).toEqual([b.userId]);
    expect(lb.map((f) => f.userId)).toEqual([a.userId]);
    expect(la[0].online).toBe(false);
  });

  it('자기 초대 코드면 400, 없는 코드면 404', async () => {
    const a = await register('혼자');
    expect((await call('/api/friends/accept', { method: 'POST', token: a.token, body: { inviteCode: a.inviteCode } })).status).toBe(400);
    expect((await call('/api/friends/accept', { method: 'POST', token: a.token, body: { inviteCode: 'ZZZZZZZZ' } })).status).toBe(404);
    expect((await call('/api/friends/accept', { method: 'POST', token: a.token, body: { inviteCode: 'bad' } })).status).toBe(404);
  });

  it('친구 삭제는 양쪽 모두에서 지워진다', async () => {
    const a = await register('가');
    const b = await register('나');
    await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } });
    const res = await call(`/api/friends/${b.userId}`, { method: 'DELETE', token: a.token });
    expect(await res.json()).toEqual({ ok: true });
    expect((await (await call('/api/friends', { token: a.token })).json()).friends).toEqual([]);
    expect((await (await call('/api/friends', { token: b.token })).json()).friends).toEqual([]);
  });

  it('초대 코드를 새로 만들면 이전 링크는 404', async () => {
    const a = await register('리셋');
    const b = await register('친구');
    const res = await call('/api/invite-code/reset', { method: 'POST', token: a.token });
    const { inviteCode } = await res.json();
    expect(inviteCode).not.toBe(a.inviteCode);
    expect((await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } })).status).toBe(404);
    expect((await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode } })).status).toBe(200);
  });
});

describe('로비 WebSocket (접속 표시)', () => {
  it('인증하면 ready와 친구 목록을 받고, 친구에게 접속·끊김이 알려진다', async () => {
    const a = await register('에이');
    const b = await register('비');
    await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } });

    const la = await openLobby(a.token);
    const ready = await la.next((m) => m.t === 'ready');
    expect(ready.friends).toEqual([{ userId: b.userId, nickname: '비', online: false }]);

    const lb = await openLobby(b.token);
    const readyB = await lb.next((m) => m.t === 'ready');
    expect(readyB.friends[0]).toMatchObject({ userId: a.userId, online: true });
    expect(await la.next((m) => m.t === 'presence')).toEqual({ t: 'presence', userId: b.userId, online: true });

    // REST 친구 목록에도 접속 중으로 나옴
    const list = (await (await call('/api/friends', { token: a.token })).json()).friends;
    expect(list[0].online).toBe(true);

    lb.ws.close(1000, 'bye');
    expect(await la.next((m) => m.t === 'presence')).toEqual({ t: 'presence', userId: b.userId, online: false });
    la.ws.close(1000, 'bye');
  });

  it('잘못된 토큰으로 인증하면 error 후 연결이 끊긴다', async () => {
    const l = await openLobby('y'.repeat(43));
    expect(await l.next((m) => m.t === 'error')).toEqual({ t: 'error', error: 'unauthorized' });
  });

  it('ping에는 pong으로 답한다', async () => {
    const a = await register('핑');
    const l = await openLobby(a.token);
    await l.next((m) => m.t === 'ready');
    l.ws.send(JSON.stringify({ t: 'ping' }));
    expect(await l.next((m) => m.t === 'pong')).toEqual({ t: 'pong' });
    l.ws.close(1000, 'bye');
  });

  it('친구 맺기가 되면 초대한 사람 화면에 바로 나타난다', async () => {
    const a = await register('초대자');
    const la = await openLobby(a.token);
    await la.next((m) => m.t === 'ready');
    const b = await register('받은사람');
    await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } });
    expect(await la.next((m) => m.t === 'friend')).toEqual({ t: 'friend', friend: { userId: b.userId, nickname: '받은사람', online: false } });
    la.ws.close(1000, 'bye');
  });
});
