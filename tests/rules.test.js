// 게임 규칙 테스트 (SPEC.md 6장): 피격, 폭탄, 파워업, 컨티뉴 + 발사·인원 보정·스테이지 진행
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VIEW, PLAYER, BOMB, SHOT, SCORE, CONTINUE, STAGE1, TICK, BOSS } from '../web/js/game/rules.js';
import { createWorld, stepWorld, continueGame, giveUp } from '../web/js/game/engine.js';
import { hitPlayer, useBomb, tickPlayer } from '../web/js/game/player.js';
import { applyPowerup, dropPowerup } from '../web/js/game/powerups.js';
import { spawnEnemy, scaledHp } from '../web/js/game/enemies.js';
import { fireEnemyShot } from '../web/js/game/bullets.js';
import { damageBoss } from '../web/js/game/boss.js';

const EMPTY = { timeline: [] }; // 적이 나오지 않는 세계 (규칙만 확인)
const steps = (world, n, inputs) => { for (let i = 0; i < n; i++) stepWorld(world, inputs); };

// ---------------------------------------------------------------- 시작 상태
test('시작: 목숨 3, 폭탄 3, 총알 1단계, 하단 중앙', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  assert.equal(p.lives, 3);
  assert.equal(p.bombs, 3);
  assert.equal(p.power, 1);
  assert.equal(p.x, VIEW.W / 2);
  assert.equal(p.y, VIEW.H - PLAYER.RESPAWN_FROM_BOTTOM);
});

// ---------------------------------------------------------------- 자동 발사
test('자동 발사: 1초(60프레임)에 8번, 4단계는 한 번에 5발', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  let volleys = 0;
  for (let i = 0; i < TICK.HZ; i++) {
    tickPlayer(w, p, TICK.DT);
    volleys += w.events.filter((e) => e.type === 'shot').length;
    w.events.length = 0;
  }
  assert.equal(volleys, SHOT.RATE);

  const w4 = createWorld(EMPTY);
  w4.players[0].power = 4;
  tickPlayer(w4, w4.players[0], TICK.DT);
  assert.equal(w4.shots.list.length, SHOT.PATTERNS[4].length);
});

test('총알 단계: 1~최대 모든 단계에 발사 모양이 있고, 단계가 오를수록 총알 수가 줄지 않음', () => {
  let prev = 0;
  for (let k = 1; k <= PLAYER.MAX_POWER; k++) {
    const n = SHOT.PATTERNS[k].length;
    assert.ok(n >= prev, `${k}단계`);
    prev = n;
  }
  // 가운데 나란히 쏘는 총알(a: 0) 수도 늘거나 같음 → 보스에게 맞는 수가 줄지 않음
  const straight = (k) => SHOT.PATTERNS[k].filter((g) => g.a === 0).length;
  for (let k = 2; k <= PLAYER.MAX_POWER; k++) assert.ok(straight(k) >= straight(k - 1), `${k}단계 나란히 탄`);
});

test('내 총알은 최대 200개를 넘지 않는다', () => {
  const w = createWorld(EMPTY);
  w.players[0].power = 4;
  w.players[0].y = VIEW.H - PLAYER.EDGE;
  for (let i = 0; i < 600; i++) tickPlayer(w, w.players[0], TICK.DT);
  assert.ok(w.shots.list.length <= SHOT.MAX);
});

// ---------------------------------------------------------------- 피격
test('피격: 목숨 -1, 총알 단계 -1, 폭탄 3개로 충전, 3초 무적, 하단 중앙 부활', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.power = 3;
  p.bombs = 1;
  p.x = 50;
  p.y = 100;
  assert.equal(hitPlayer(w, p), true);
  assert.equal(p.lives, 2);
  assert.equal(p.power, 2);
  assert.equal(p.bombs, PLAYER.RESPAWN_BOMBS);
  assert.equal(p.invuln, PLAYER.HIT_INVULN);
  assert.equal(p.x, VIEW.W / 2);
  assert.equal(p.y, VIEW.H - PLAYER.RESPAWN_FROM_BOTTOM);
});

test('피격: 총알 단계는 1 밑으로 내려가지 않고, 폭탄이 3개보다 많으면 그대로', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.bombs = 5;
  hitPlayer(w, p);
  assert.equal(p.power, 1);
  assert.equal(p.bombs, 5);
});

test('무적 중에는 맞지 않는다', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  hitPlayer(w, p);
  assert.equal(hitPlayer(w, p), false);
  assert.equal(p.lives, 2);
});

test('적 탄에 맞으면 피격, 무적이 끝나면 다시 맞는다', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  fireEnemyShot(w, p.x, p.y - 2, Math.PI / 2, 0);
  stepWorld(w, []);
  assert.equal(p.lives, 2);
  assert.equal(w.eshots.list.length, 0); // 맞은 탄은 사라짐

  steps(w, Math.ceil(PLAYER.HIT_INVULN * TICK.HZ) + 1, []);
  assert.equal(p.invuln, 0);
  fireEnemyShot(w, p.x, p.y, 0, 0);
  stepWorld(w, []);
  assert.equal(p.lives, 1);
});

// ---------------------------------------------------------------- 폭탄
test('폭탄: 적 탄 전부 제거, 모든 적에게 50 피해, 2초 무적, 폭탄 -1', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  for (let i = 0; i < 30; i++) fireEnemyShot(w, 100 + i, 100, Math.PI / 2, 50);
  spawnEnemy(w, { type: 'm1', x: 180, pattern: 'hover' });
  spawnEnemy(w, { type: 's1', x: 90, pattern: 'down' });
  const [m1, s1] = w.enemies;
  m1.hp = 80; // 폭탄 한 번으로는 안 죽는 체력

  assert.equal(useBomb(w, p), true);
  assert.equal(w.eshots.list.length, 0);
  assert.equal(p.bombs, 2);
  assert.equal(p.invuln, BOMB.INVULN);
  assert.equal(s1.dead, true);                 // 소형은 처치
  assert.equal(m1.hp, 80 - BOMB.DAMAGE);       // 정확히 50 피해
  assert.equal(p.score, SCORE.SMALL);          // 처치 점수는 폭탄 쓴 사람에게
});

test('폭탄: 사용 중(2초)에는 다시 못 쓰고, 0개면 못 쓴다', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  assert.equal(useBomb(w, p), true);
  assert.equal(useBomb(w, p), false);
  assert.equal(p.bombs, 2);

  steps(w, Math.ceil(BOMB.DURATION * TICK.HZ) + 1, []);
  assert.equal(useBomb(w, p), true);
  p.bombs = 0;
  p.bombT = 0;
  assert.equal(useBomb(w, p), false);
});

test('폭탄 버튼 입력으로도 동작한다', () => {
  const w = createWorld(EMPTY);
  stepWorld(w, [{ dx: 0, dy: 0, bomb: true }]);
  assert.equal(w.players[0].bombs, 2);
});

// ---------------------------------------------------------------- 파워업
test('P: 총알 +1단계, 최대 단계에서 먹으면 점수 +1000', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  for (let i = 0; i < PLAYER.MAX_POWER - 1; i++) applyPowerup(w, p, 'P');
  assert.equal(p.power, PLAYER.MAX_POWER);
  applyPowerup(w, p, 'P');
  assert.equal(p.power, PLAYER.MAX_POWER);
  assert.equal(p.score, SCORE.POWER_MAX_BONUS);
});

test('B: 폭탄 +1 (최대 5), 1UP: 목숨 +1 (최대 5)', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  for (let i = 0; i < 5; i++) applyPowerup(w, p, 'B');
  assert.equal(p.bombs, PLAYER.MAX_BOMBS);
  for (let i = 0; i < 5; i++) applyPowerup(w, p, '1UP');
  assert.equal(p.lives, PLAYER.MAX_LIVES);
});

test('1UP은 스테이지당 최대 1개 (두 번째부터는 P로 바뀜)', () => {
  const w = createWorld(EMPTY);
  dropPowerup(w, 100, 100, '1UP');
  dropPowerup(w, 100, 100, '1UP');
  assert.deepEqual(w.powerups.map((u) => u.kind), ['1UP', 'P']);
});

test('중형 적 처치 시 P 또는 B 하나를 떨어뜨리고, 닿으면 줍는다', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  spawnEnemy(w, { type: 'm1', x: p.x, pattern: 'down' });
  w.enemies[0].hp = 1;
  w.enemies[0].y = 200;
  useBomb(w, p);
  assert.equal(w.powerups.length, 1);
  assert.ok(['P', 'B'].includes(w.powerups[0].kind));
  w.powerups[0].y0 = p.y; // 플레이어 위치로 옮겨서 줍기
  stepWorld(w, []);
  assert.equal(w.powerups.length, 0);
});

// ---------------------------------------------------------------- 컨티뉴
test('목숨 0 → 멈추고 10초 카운트다운 → 이어하면 목숨 3·폭탄 3·점수 0', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.score = 5000;
  p.lives = 1;
  hitPlayer(w, p);
  assert.equal(p.lives, 0);
  stepWorld(w, []);
  assert.equal(w.state, 'continue');
  const frozenT = w.t;
  steps(w, 60, []);
  assert.equal(w.t, frozenT); // 게임은 멈춤
  assert.ok(p.continueT < CONTINUE.SECONDS && p.continueT > 0);

  assert.equal(continueGame(w, 1), true);
  assert.equal(p.lives, CONTINUE.LIVES);
  assert.equal(p.bombs, CONTINUE.BOMBS);
  assert.equal(p.score, 0);
  stepWorld(w, []);
  assert.equal(w.state, 'play');
});

test('10초 안에 이어하지 않으면 게임 오버', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.lives = 1;
  hitPlayer(w, p);
  steps(w, CONTINUE.SECONDS * TICK.HZ + 5, []);
  assert.equal(w.state, 'over');
  assert.equal(continueGame(w, 1), false);
});

test('그만하기를 누르면 바로 게임 오버', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.lives = 1;
  hitPlayer(w, p);
  giveUp(w, 1);
  stepWorld(w, []);
  assert.equal(w.state, 'over');
});

test('같이 할 때: 한 명이 목숨 0이어도 다른 사람이 살아 있으면 계속 진행', () => {
  const w = createWorld({ ...EMPTY, playerCount: 2 });
  const [a, b] = w.players;
  a.lives = 1;
  hitPlayer(w, a);
  steps(w, 30, []);
  assert.equal(w.state, 'play');
  steps(w, CONTINUE.SECONDS * TICK.HZ, []);
  assert.equal(a.spectator, true);   // 시간이 지나 관전만
  b.lives = 1;
  b.invuln = 0;
  hitPlayer(w, b);
  steps(w, CONTINUE.SECONDS * TICK.HZ + 5, []);
  assert.equal(w.state, 'over');
});

// ---------------------------------------------------------------- 인원 보정, 보스, 스테이지
test('인원 보정: 적 체력 × (1 + 0.3 × (인원 − 1))', () => {
  assert.equal(scaledHp(100, 1), 100);
  assert.equal(scaledHp(100, 2), 130);
  assert.equal(scaledHp(100, 4), 190);
});

test('스테이지 1: 정해진 시각에 보스가 나오고, 처치하면 점수 10000 후 클리어', () => {
  const w = createWorld(EMPTY);
  const p = w.players[0];
  p.invuln = Infinity; // 이 테스트는 진행만 확인
  steps(w, Math.ceil(STAGE1.BOSS_AT * TICK.HZ) + 1, []);
  assert.ok(w.boss, '보스 등장');
  assert.equal(w.events.some((e) => e.type === 'boss'), true);

  // 내려오는 중에는 맞지 않음
  damageBoss(w, w.boss, 99999, 1);
  assert.equal(w.boss.dead, false);

  steps(w, 6 * TICK.HZ, []);
  assert.equal(w.boss.entering, false);
  const scoreBefore = p.score;
  damageBoss(w, w.boss, 99999, 1);
  assert.equal(w.boss.dead, true);
  assert.equal(p.score - scoreBefore, SCORE.BOSS);
  steps(w, Math.ceil(BOSS.CLEAR_DELAY * TICK.HZ) + 1, []);
  assert.equal(w.state, 'clear');
});

test('보스는 체력 50% 이하에서 2페이즈로 바뀐다', () => {
  const w = createWorld(EMPTY);
  w.players[0].invuln = Infinity;
  steps(w, Math.ceil(STAGE1.BOSS_AT * TICK.HZ) + 6 * TICK.HZ, []);
  const b = w.boss;
  damageBoss(w, b, Math.ceil(b.maxHp * 0.5), 1);
  stepWorld(w, []);
  assert.equal(b.phase, 2);
});
