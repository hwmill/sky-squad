// 같이 하기 동기화 테스트: 자리 번호, 스냅샷 왕복, 보간, 크기
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VIEW, TICK, NETPLAY, PLAYER } from '../web/js/game/rules.js';
import { createWorld, stepWorld } from '../web/js/game/engine.js';
import { hitPlayer } from '../web/js/game/player.js';
import { encodeSnapshot, decodeSnapshot, createGuestView } from '../web/js/net/sync.js';

const run = (w, n, inputs = []) => { for (let i = 0; i < n; i++) { stepWorld(w, inputs); w.events.length = 0; } };

test('자리 번호로 세계 만들기 (1P·2P·4P), 인원 보정은 3명 기준', () => {
  const w = createWorld({ slots: [1, 2, 4], seed: 3 });
  assert.deepEqual(w.players.map((p) => p.slot), [1, 2, 4]);
  run(w, 3 * TICK.HZ);
  const s1 = w.enemies.find((e) => e.type === 's1');
  assert.equal(s1.maxHp, Math.round(2 * (1 + 0.3 * 2)));
  // 시작 위치가 겹치지 않음
  assert.equal(new Set(w.players.map((p) => p.x)).size, 3);
});

test('게스트 입력(절대 위치)이 그 자리 비행기에 반영된다', () => {
  const w = createWorld({ slots: [1, 2], timeline: [] });
  stepWorld(w, [{ dx: 0, dy: 0 }, { x: 100, y: 400, bomb: true }]);
  assert.equal(w.players[1].x, 100);
  assert.equal(w.players[1].y, 400);
  assert.equal(w.players[1].bombs, PLAYER.START_BOMBS - 1);
});

test('스냅샷 왕복: 플레이어·적·총알이 그대로 복원된다', () => {
  const w = createWorld({ slots: [1, 3], seed: 9 });
  run(w, 10 * TICK.HZ);
  const snap = encodeSnapshot(w, [{ type: 'explode', x: 1, y: 2, size: 1 }]);
  const back = decodeSnapshot(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.state, 'play');
  assert.deepEqual(back.players.map((p) => p.slot), [1, 3]);
  assert.equal(back.players[1].lives, w.players[1].lives);
  assert.equal(back.enemies.length, w.enemies.length);
  assert.equal(back.enemies[0].id, w.enemies[0].id);
  assert.equal(back.shots.length, w.shots.list.length);
  assert.equal(back.eshots.length, w.eshots.list.length);
  assert.equal(back.events[0].type, 'explode');
});

test('스냅샷 크기: 4인 플레이 중 최대도 20KB 이하 (서버 제한 64KB)', () => {
  const w = createWorld({ slots: [1, 2, 3, 4], seed: 5 });
  let max = 0;
  for (let f = 0; f < 200 * TICK.HZ; f++) {
    stepWorld(w, w.players.map(() => ({ dx: 0, dy: 0 })));
    for (const p of w.players) { p.invuln = 99; p.power = 4; }
    w.events.length = 0;
    if (f % 4 === 0) max = Math.max(max, JSON.stringify(encodeSnapshot(w)).length);
    if (w.state !== 'play') break;
  }
  assert.ok(max < 20000, `최대 ${max}바이트`);
});

test('보간: 두 스냅샷 사이 시각이면 적이 중간 위치에 그려진다', () => {
  const w = createWorld({ timeline: [{ t: 0, type: 's1', x: 100, pattern: 'down' }] });
  run(w, 10);
  const view = createGuestView();
  const a = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w))));
  run(w, 4);
  const b = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(w))));
  view.push(a, 1000);
  view.push(b, 1066);
  const mid = view.build(1033 + NETPLAY.INTERP_DELAY_MS, 2, null);
  const ea = a.enemies[0].y;
  const eb = b.enemies[0].y;
  assert.ok(mid.enemies[0].y > ea && mid.enemies[0].y < eb, `${ea} < ${mid.enemies[0].y} < ${eb}`);
});

test('게스트 자기 비행기는 받은 위치가 아니라 내 입력 위치로 그린다', () => {
  const w = createWorld({ slots: [1, 2], timeline: [] });
  const view = createGuestView();
  view.push(decodeSnapshot(encodeSnapshot(w)), 0);
  const v = view.build(500, 2, { x: 33, y: 444 });
  const me = v.players.find((p) => p.slot === 2);
  assert.equal(me.x, 33);
  assert.equal(me.y, 444);
});

test('피격하면 spawn 번호가 바뀐다 (게스트가 부활 위치로 맞춤)', () => {
  const w = createWorld({ slots: [1, 2], timeline: [] });
  const before = w.players[1].spawn;
  w.players[1].x = 50;
  hitPlayer(w, w.players[1]);
  assert.equal(w.players[1].spawn, before + 1);
  assert.notEqual(w.players[1].x, 50);
  assert.ok(w.players[1].x > 0 && w.players[1].x < VIEW.W);
});
