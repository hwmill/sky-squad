// 4단계 안정화 테스트: 끊김 대기(게스트 15초·방장 30초 → 테스트에서는 0.4초·0.6초), 메시지 제한
import { describe, it, expect } from 'vitest';
import { exports } from 'cloudflare:workers';

const ORIGIN = 'https://hwmill.github.io';
const BASE = 'https://api.test';
const GUEST_HOLD = 400;
const HOST_HOLD = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function call(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return exports.default.fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function register(nickname) {
  return { nickname, ...(await (await call('/api/register', { method: 'POST', body: { nickname } })).json()) };
}

async function openWs(path, token) {
  const res = await exports.default.fetch(`${BASE}${path}`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } });
  const ws = res.webSocket;
  ws.accept();
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const w = waiters.find((x) => x.match(msg));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); } else inbox.push(msg);
  });
  const next = (match, ms = 3000) => {
    const found = inbox.find(match);
    if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      waiters.push({ match, resolve });
      setTimeout(() => reject(new Error('메시지를 기다리다 시간 초과')), ms);
    });
  };
  const send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  if (token) send({ t: 'auth', token });
  return { ws, next, send, inbox };
}

// 방장 + 게스트 1명이 게임을 시작한 상태
async function startedRoom() {
  const a = await register('방장');
  const b = await register('게스트');
  const { roomId } = await (await call('/api/rooms', { method: 'POST', token: a.token })).json();
  const host = await openWs(`/ws/room/${roomId}`, a.token);
  await host.next((m) => m.t === 'seat');
  const guest = await openWs(`/ws/room/${roomId}`, b.token);
  await guest.next((m) => m.t === 'seat');
  host.send({ t: 'start', seed: 1, slots: [1, 2] });
  await guest.next((m) => m.t === 'start');
  return { a, b, roomId, host, guest };
}

describe('게스트 끊김 (15초 대기)', () => {
  it('끊기면 방장에게 away, 시간 안에 다시 들어오면 같은 자리로 back', async () => {
    const { b, roomId, host, guest } = await startedRoom();
    guest.ws.close(1000, 'network');
    expect(await host.next((m) => m.t === 'away')).toEqual({ t: 'away', slot: 2 });
    // 입장 때 받은 members(away=false)가 아니라, 끊긴 뒤의 members
    const mem = await host.next((m) => m.t === 'members' && m.members.some((x) => x.slot === 2 && x.away));
    expect(mem.members.find((m) => m.slot === 2).away).toBe(true);

    const again = await openWs(`/ws/room/${roomId}`, b.token);
    const seat = await again.next((m) => m.t === 'seat');
    expect(seat.slot).toBe(2);
    expect(seat.started).toBe(true);
    expect(await host.next((m) => m.t === 'back')).toEqual({ t: 'back', slot: 2 });
  });

  it('시간이 지나면 자리가 빠진다', async () => {
    const { host, guest } = await startedRoom();
    guest.ws.close(1000, 'network');
    await host.next((m) => m.t === 'away');
    const gone = await host.next((m) => m.t === 'members' && !m.members.some((x) => x.slot === 2), GUEST_HOLD + 3000);
    expect(gone.members.map((m) => m.slot)).toEqual([1]);
  });
});

describe('방장 끊김·앱 내림 (30초 대기)', () => {
  it('방장이 끊기면 hostaway, 돌아오면 hostback', async () => {
    const { a, roomId, host, guest } = await startedRoom();
    host.ws.close(1000, 'network');
    expect(await guest.next((m) => m.t === 'hostaway')).toEqual({ t: 'hostaway' });
    const back = await openWs(`/ws/room/${roomId}`, a.token);
    expect((await back.next((m) => m.t === 'seat')).slot).toBe(1);
    expect(await guest.next((m) => m.t === 'hostback')).toEqual({ t: 'hostback' });
  });

  it('방장이 시간 안에 돌아오지 않으면 모두에게 hostleft (방 종료)', async () => {
    const { roomId, host, guest } = await startedRoom();
    host.ws.close(1000, 'network');
    await guest.next((m) => m.t === 'hostaway');
    expect(await guest.next((m) => m.t === 'hostleft', HOST_HOLD + 3000)).toEqual({ t: 'hostleft' });
    // 끝난 방에는 다시 들어갈 수 없음
    const res = await exports.default.fetch(`${BASE}/ws/room/${roomId}`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } });
    expect(res.status).toBe(404);
  });

  it('방장이 앱을 내리고(pause) 시간이 지나면 방장 포함 모두 hostleft', async () => {
    const { host, guest } = await startedRoom();
    host.send({ t: 'pause' });
    expect(await guest.next((m) => m.t === 'pause')).toEqual({ t: 'pause' });
    expect(await guest.next((m) => m.t === 'hostleft', HOST_HOLD + 3000)).toEqual({ t: 'hostleft' });
    expect(await host.next((m) => m.t === 'hostleft', 3000)).toEqual({ t: 'hostleft' });
  });

  it('시간 안에 resume하면 게임이 계속된다', async () => {
    const { host, guest } = await startedRoom();
    host.send({ t: 'pause' });
    await guest.next((m) => m.t === 'pause');
    host.send({ t: 'resume' });
    await guest.next((m) => m.t === 'resume');
    await sleep(HOST_HOLD + 400);
    host.send({ t: 'st', f: 1 });
    expect(await guest.next((m) => m.t === 'st')).toEqual({ t: 'st', f: 1 });
    expect(guest.inbox.some((m) => m.t === 'hostleft')).toBe(false);
  });
});

describe('입력 검증', () => {
  it('초당 30건을 넘는 메시지는 무시', async () => {
    const { host, guest } = await startedRoom();
    for (let i = 0; i < 50; i++) guest.send({ t: 'in', x: i, y: 0 });
    guest.send({ t: 'in', x: 999, y: 0 }); // 51번째 (무시돼야 함)
    await sleep(500);
    const got = host.inbox.filter((m) => m.t === 'in');
    expect(got.length).toBeLessThanOrEqual(30);
    expect(got.some((m) => m.x === 999)).toBe(false);
  });

  it('4KB가 넘는 게스트 메시지와 알 수 없는 종류는 무시', async () => {
    const { host, guest } = await startedRoom();
    guest.send({ t: 'in', x: 1, y: 2, pad: 'x'.repeat(5000) });
    guest.send({ t: 'hack', x: 1 });
    guest.send({ t: 'in', x: 7, y: 8 });
    const m = await host.next((x) => x.t === 'in');
    expect(m.x).toBe(7);
    expect(host.inbox.some((x) => x.t === 'hack')).toBe(false);
  });

  it('로비도 초당 30건 제한', async () => {
    const a = await register('핑폭탄');
    const l = await openWs('/ws/lobby', a.token);
    await l.next((m) => m.t === 'ready');
    for (let i = 0; i < 50; i++) l.send({ t: 'ping' });
    await sleep(500);
    expect(l.inbox.filter((m) => m.t === 'pong').length).toBeLessThanOrEqual(30);
  });
});
