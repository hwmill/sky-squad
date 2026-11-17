// 게임방 테스트 (SPEC 7장, 3단계): 방 만들기, 자리 배정, 중계, 초대
import { describe, it, expect } from 'vitest';
import { exports } from 'cloudflare:workers';

const ORIGIN = 'https://hwmill.github.io';
const BASE = 'https://api.test';

function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return exports.default.fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function register(nickname) {
  return { nickname, ...(await (await call('/api/register', { method: 'POST', body: { nickname } })).json()) };
}

async function befriend(a, b) {
  await call('/api/friends/accept', { method: 'POST', token: b.token, body: { inviteCode: a.inviteCode } });
}

async function openWs(path, token) {
  const res = await exports.default.fetch(`${BASE}${path}`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } });
  if (res.status !== 101) return { status: res.status };
  const ws = res.webSocket;
  ws.accept();
  const inbox = [];
  const waiters = [];
  let closed = null;
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const w = waiters.find((x) => x.match(msg));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); } else inbox.push(msg);
  });
  ws.addEventListener('close', (e) => { closed = e.code; });
  const next = (match) => {
    const found = inbox.find(match);
    if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      waiters.push({ match, resolve });
      setTimeout(() => reject(new Error('메시지를 기다리다 시간 초과')), 3000);
    });
  };
  const send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  if (token) send({ t: 'auth', token });
  return { ws, next, send, inbox, get closed() { return closed; }, status: 101 };
}

async function createRoom(user) {
  const res = await call('/api/rooms', { method: 'POST', token: user.token });
  expect(res.status).toBe(200);
  return (await res.json()).roomId;
}

describe('게임방', () => {
  it('방 만들기는 로그인 필요, roomId는 6자', async () => {
    expect((await call('/api/rooms', { method: 'POST' })).status).toBe(401);
    const a = await register('방장');
    expect(await createRoom(a)).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('없는 방은 연결되지 않는다', async () => {
    expect((await openWs('/ws/room/ZZZZZZ')).status).toBe(404);
  });

  it('방장은 1P, 들어오는 순서대로 2P~4P, 5번째는 full', async () => {
    const users = [];
    for (const n of ['일', '이', '삼', '사', '오']) users.push(await register(n));
    const roomId = await createRoom(users[0]);

    const host = await openWs(`/ws/room/${roomId}`, users[0].token);
    expect((await host.next((m) => m.t === 'seat')).slot).toBe(1);

    const guests = [];
    for (let i = 1; i <= 3; i++) {
      const g = await openWs(`/ws/room/${roomId}`, users[i].token);
      const seat = await g.next((m) => m.t === 'seat');
      expect(seat.slot).toBe(i + 1);
      expect(seat.members.map((m) => m.nickname)).toEqual(['일', '이', '삼', '사'].slice(0, i + 1));
      guests.push(g);
    }
    // 방장은 입장할 때마다 members를 받음
    const last = await host.next((m) => m.t === 'members' && m.members.length === 4);
    expect(last.members.map((m) => m.slot)).toEqual([1, 2, 3, 4]);

    const fifth = await openWs(`/ws/room/${roomId}`, users[4].token);
    expect(await fifth.next((m) => m.t === 'full')).toEqual({ t: 'full' });

    // 한 명이 나가면 나머지에게 반영
    guests[2].ws.close(1000, 'bye');
    const after = await host.next((m) => m.t === 'members' && m.members.length === 3);
    expect(after.members.map((m) => m.slot)).toEqual([1, 2, 3]);
  });

  it('게스트 입력은 방장에게만 (자리 번호는 서버가 붙임), 방장 상태는 게스트 전원에게', async () => {
    const a = await register('에이');
    const b = await register('비');
    const c = await register('씨');
    const roomId = await createRoom(a);
    const host = await openWs(`/ws/room/${roomId}`, a.token);
    await host.next((m) => m.t === 'seat');
    const g2 = await openWs(`/ws/room/${roomId}`, b.token);
    await g2.next((m) => m.t === 'seat');
    const g3 = await openWs(`/ws/room/${roomId}`, c.token);
    await g3.next((m) => m.t === 'seat');

    g2.send({ t: 'in', s: 4, x: 100, y: 500, b: 1 }); // 자리를 4로 속여도
    expect(await host.next((m) => m.t === 'in')).toEqual({ t: 'in', s: 2, x: 100, y: 500, b: 1 });

    host.send({ t: 'st', f: 10, ps: [[1, 180, 550]] });
    expect(await g2.next((m) => m.t === 'st')).toEqual({ t: 'st', f: 10, ps: [[1, 180, 550]] });
    expect(await g3.next((m) => m.t === 'st')).toEqual({ t: 'st', f: 10, ps: [[1, 180, 550]] });

    // 게스트는 상태를 보낼 수 없음 (무시)
    g2.send({ t: 'st', f: 99 });
    host.send({ t: 'pause' });
    expect(await g3.next((m) => m.t === 'pause')).toEqual({ t: 'pause' });
    expect(g3.inbox.some((m) => m.f === 99)).toBe(false);
  });

  it('시작은 방장만, 시작 후에는 새로 들어올 수 없고, 끝나면(end) 다시 시작 가능', async () => {
    const a = await register('방장2');
    const b = await register('손님');
    const c = await register('늦은사람');
    const roomId = await createRoom(a);
    const host = await openWs(`/ws/room/${roomId}`, a.token);
    await host.next((m) => m.t === 'seat');
    const g = await openWs(`/ws/room/${roomId}`, b.token);
    await g.next((m) => m.t === 'seat');

    g.send({ t: 'start' }); // 게스트가 보낸 start는 무시
    host.send({ t: 'start', seed: 7, slots: [1, 2] });
    expect(await g.next((m) => m.t === 'start')).toEqual({ t: 'start', seed: 7, slots: [1, 2] });

    const late = await openWs(`/ws/room/${roomId}`, c.token);
    expect(await late.next((m) => m.t === 'error')).toEqual({ t: 'error', error: 'started' });

    host.send({ t: 'end' });
    host.send({ t: 'ping' }); // 순서 보장용
    const late2 = await openWs(`/ws/room/${roomId}`, c.token);
    expect((await late2.next((m) => m.t === 'seat')).slot).toBe(3);
  });

  it('방장이 나가면 게스트에게 hostleft', async () => {
    const a = await register('떠남');
    const b = await register('남음');
    const roomId = await createRoom(a);
    const host = await openWs(`/ws/room/${roomId}`, a.token);
    await host.next((m) => m.t === 'seat');
    const g = await openWs(`/ws/room/${roomId}`, b.token);
    await g.next((m) => m.t === 'seat');
    host.ws.close(1000, 'bye');
    expect(await g.next((m) => m.t === 'hostleft')).toEqual({ t: 'hostleft' });
  });

  it('잘못된 토큰이면 error 후 끊김', async () => {
    const a = await register('토큰');
    const roomId = await createRoom(a);
    const bad = await openWs(`/ws/room/${roomId}`, 'z'.repeat(43));
    expect(await bad.next((m) => m.t === 'error')).toEqual({ t: 'error', error: 'unauthorized' });
  });
});

describe('로비 초대', () => {
  it('친구에게 초대하면 invited 알림, 친구가 아니면 거부', async () => {
    const a = await register('초대함');
    const b = await register('초대받음');
    const stranger = await register('남');
    await befriend(a, b);
    const roomId = await createRoom(a);

    const la = await openWs('/ws/lobby', a.token);
    await la.next((m) => m.t === 'ready');
    const lb = await openWs('/ws/lobby', b.token);
    await lb.next((m) => m.t === 'ready');

    la.send({ t: 'invite', to: b.userId, roomId });
    expect(await lb.next((m) => m.t === 'invited')).toEqual({ t: 'invited', from: { userId: a.userId, nickname: '초대함' }, roomId });

    la.send({ t: 'invite', to: stranger.userId, roomId });
    expect(await la.next((m) => m.t === 'error')).toEqual({ t: 'error', error: 'not_friend' });
  });
});
