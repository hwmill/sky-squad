// 스테이지 1 전체를 자동 조종으로 돌려 보는 시험 (오류 없이 끝까지 가는지, 성능 상한을 지키는지)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TICK, SHOT, ENEMY_SHOT, STAGE1 } from '../web/js/game/rules.js';
import { createWorld, stepWorld, continueGame } from '../web/js/game/engine.js';
import { STAGE1_TIMELINE } from '../web/js/game/stage1.js';

test('등장표: 시간순이고 보스 전에 끝나며, 1UP은 1개', () => {
  for (let i = 1; i < STAGE1_TIMELINE.length; i++) assert.ok(STAGE1_TIMELINE[i].t >= STAGE1_TIMELINE[i - 1].t);
  assert.ok(STAGE1_TIMELINE.at(-1).t < STAGE1.BOSS_AT);
  assert.equal(STAGE1_TIMELINE.filter((e) => e.drop === '1UP').length, 1);
});

for (const playerCount of [1, 4]) {
  test(`${playerCount}명 자동 플레이: 보스 처치까지 오류 없이 진행, 총알 상한 유지`, () => {
    const w = createWorld({ playerCount, seed: 42 });
    let maxShots = 0;
    let maxEnemyShots = 0;
    let t = 0;
    const limit = 400 * TICK.HZ; // 400초 안에 끝나야 함
    for (let f = 0; f < limit && w.state !== 'clear' && w.state !== 'over'; f++) {
      // 간단한 자동 조종: 좌우로 천천히 움직이고, 적 탄이 많으면 폭탄
      t += TICK.DT;
      const inputs = w.players.map((p, i) => ({
        dx: Math.sin(t * 0.7 + i) * 2,
        dy: 0,
        bomb: w.eshots.list.length > 60,
      }));
      stepWorld(w, inputs);
      if (w.state === 'continue') for (const p of w.players) continueGame(w, p.slot); // 끝까지 보기 위해 항상 이어하기
      // 보스가 너무 오래 버티지 않게 4단계 고정 (진행 확인용)
      for (const p of w.players) if (p.lives > 0) p.power = 4;
      maxShots = Math.max(maxShots, w.shots.list.length);
      maxEnemyShots = Math.max(maxEnemyShots, w.eshots.list.length);
      w.events.length = 0;
    }
    assert.equal(w.state, 'clear');
    assert.ok(maxShots <= SHOT.MAX);
    assert.ok(maxEnemyShots <= ENEMY_SHOT.MAX);
  });
}

// ================================================================ 2차 8단계: 스테이지 2~5
import { STAGES, PLAYER, DIFFICULTY, BOSSES, BOMB } from '../web/js/game/rules.js';
import { goToStage, nextRound, stageHpMul, stageShotMul } from '../web/js/game/engine.js';
import { STAGE_LIST, stageInfo, isLastStage } from '../web/js/game/stages.js';
import { createBoss, shotHitsBoss, damageBossAll, bossHpRatio, laserActive } from '../web/js/game/boss.js';
import { scaledHp } from '../web/js/game/enemies.js';
import { hitPlayer } from '../web/js/game/player.js';
import { updateRecords } from '../web/js/game/records.js';

test('스테이지 1~5: 이름·보스가 다르고, 등장표는 시간순·보스 전에 끝나며 1UP은 1개', () => {
  assert.equal(STAGE_LIST.length, STAGES.COUNT);
  assert.equal(new Set(STAGE_LIST.map((s) => s.boss)).size, 5);
  for (const s of STAGE_LIST) {
    const tl = s.timeline;
    for (let i = 1; i < tl.length; i++) assert.ok(tl[i].t >= tl[i - 1].t, `${s.no} 시간순`);
    assert.ok(tl.at(-1).t < s.bossAt, `${s.no} 보스 전`);
    assert.equal(tl.filter((e) => e.drop === '1UP').length, 1, `${s.no} 1UP`);
  }
  assert.equal(isLastStage(5), true);
  assert.equal(isLastStage(4), false);
});

test('스테이지 전환: 다음 스테이지 → 등장표·보스·난이도 배율이 바뀌고 점수는 유지', () => {
  const w = createWorld({ seed: 1, economy: true });
  w.players[0].score = 999;
  for (let n = 2; n <= 5; n++) {
    nextRound(w);
    assert.equal(w.round, n);
    assert.equal(w.timeline, stageInfo(n).timeline);
    assert.equal(w.bossKind, stageInfo(n).boss);
    assert.equal(w.hpMul, 1 + DIFFICULTY.HP_PER_STAGE * (n - 1));
    assert.equal(w.shotMul, 1 + DIFFICULTY.SHOT_SPEED_PER_STAGE * (n - 1));
    assert.equal(w.players[0].score, 999);
    assert.ok(w.events.some((e) => e.type === 'round' && e.round === n));
  }
  assert.equal(stageHpMul(5), 1.8);
  assert.ok(Math.abs(stageShotMul(5) - 1.32) < 1e-9);
  // 보스 체력 = 기본 × 인원 보정 × 스테이지 배율
  const b = createBoss(w);
  assert.equal(b.kind, 'cakeKing');
  assert.equal(b.maxHp, Math.round(scaledHp(BOSSES.cakeKing.HP, 1) * 1.8));
});

test('와플 거북선: 포대 4개를 다 부수기 전에는 몸통에 피해가 없고, 폭탄은 포대에 들어감', () => {
  const w = createWorld({ timeline: [] });
  goToStage(w, 3, []);
  const b = createBoss(w);
  b.entering = false;
  assert.equal(b.parts.length, 4);
  // 몸통 가운데를 맞혀도 체력 그대로 (총알은 등껍질을 지나 뒤쪽 포대로)
  assert.equal(shotHitsBoss(w, b, b.x, b.y, 4, 100, 1), false);
  assert.equal(b.hp, b.maxHp);
  damageBossAll(w, b, BOMB.DAMAGE, 1);
  assert.ok(b.parts.every((q) => q.hp === q.maxHp - BOMB.DAMAGE));
  // 포대를 하나씩 부숨 → 몸통 피해 시작, 2단계로
  for (const q of b.parts) while (!q.dead) shotHitsBoss(w, b, b.x + q.dx, b.y + q.dy, 4, 50, 1);
  assert.ok(bossHpRatio(b) < 1);
  shotHitsBoss(w, b, b.x, b.y + 20, 4, 10, 1);
  assert.equal(b.hp, b.maxHp - 10);
  w.boss = b;
  stepWorld(w, []);
  assert.equal(b.phase, 2);
});

test('번개 솜사탕: 경고선 동안은 안전, 번쩍이는 동안 그 줄에 있으면 피격', () => {
  const w = createWorld({ timeline: [] });
  goToStage(w, 4, []);
  const p = w.players[0];
  p.invuln = 0;
  w.lasers.push({ x: p.x, y0: 100, w: 18, warn: 1, dur: 0.6, t: 0 });
  for (let i = 0; i < 50; i++) stepWorld(w, []); // 0.83초: 아직 경고선
  assert.equal(laserActive(w.lasers[0]), false);
  assert.equal(p.lives, PLAYER.START_LIVES);
  for (let i = 0; i < 15; i++) stepWorld(w, []); // 1.08초: 번개
  assert.equal(p.lives, PLAYER.START_LIVES - 1);
  // 옆으로 비켜 있으면 안전
  const w2 = createWorld({ timeline: [] });
  const p2 = w2.players[0];
  p2.invuln = 0;
  w2.lasers.push({ x: p2.x + 40, y0: 100, w: 18, warn: 0, dur: 0.6, t: 0 });
  for (let i = 0; i < 20; i++) stepWorld(w2, []);
  assert.equal(p2.lives, PLAYER.START_LIVES);
});

test('케이크 대마왕: 체력 2/3·1/3에서 단계가 바뀜 (3단계)', () => {
  const w = createWorld({ timeline: [] });
  goToStage(w, 5, []);
  const b = createBoss(w);
  b.entering = false;
  w.boss = b;
  w.stage.bossSpawned = true;
  const phases = [];
  for (const ratio of [0.9, 0.6, 0.3]) {
    b.hp = Math.floor(b.maxHp * ratio);
    stepWorld(w, []);
    phases.push(b.phase);
  }
  assert.deepEqual(phases, [1, 2, 3]);
});

for (let n = 2; n <= 5; n++) {
  test(`스테이지 ${n} 자동 플레이: 보스 처치까지 오류 없이, 총알 상한 유지`, () => {
    const w = createWorld({ seed: 40 + n, economy: true });
    goToStage(w, n);
    let maxShots = 0;
    let maxEnemyShots = 0;
    let t = 0;
    const limit = 420 * TICK.HZ;
    for (let f = 0; f < limit && w.state !== 'clear' && w.state !== 'over'; f++) {
      t += TICK.DT;
      const inputs = w.players.map((p, i) => ({ dx: Math.sin(t * 0.7 + i) * 2, dy: 0, bomb: w.eshots.list.length > 60 }));
      stepWorld(w, inputs);
      if (w.state === 'continue') for (const p of w.players) continueGame(w, p.slot);
      for (const p of w.players) if (p.lives > 0) p.power = 6; // 진행 확인용 고정
      maxShots = Math.max(maxShots, w.shots.list.length);
      maxEnemyShots = Math.max(maxEnemyShots, w.eshots.list.length);
      w.events.length = 0;
    }
    assert.equal(w.state, 'clear');
    assert.ok(maxShots <= SHOT.MAX);
    assert.ok(maxEnemyShots <= ENEMY_SHOT.MAX);
  });
}

test('최고 기록: 점수·도달 스테이지가 더 클 때만 갱신, 각각 "새 기록" 표시', () => {
  assert.deepEqual(updateRecords({ score: 0, stage: 0 }, { score: 500, stage: 1 }), { score: 500, stage: 1, newScore: true, newStage: true });
  assert.deepEqual(updateRecords({ score: 9000, stage: 3 }, { score: 500, stage: 4 }), { score: 9000, stage: 4, newScore: false, newStage: true });
  assert.deepEqual(updateRecords({ score: 9000, stage: 3 }, { score: 9000, stage: 3 }), { score: 9000, stage: 3, newScore: false, newStage: false });
  // 1차에서 저장된 문자열 기록도 그대로 읽힘 (기존 키·형식 유지)
  assert.deepEqual(updateRecords({ score: '12000', stage: null }, { score: 100, stage: 1 }), { score: 12000, stage: 1, newScore: false, newStage: true });
});

test('보호막은 레이저도 한 번 막음', () => {
  const w = createWorld({ timeline: [] });
  const p = w.players[0];
  p.invuln = 0;
  p.shield = 1;
  w.lasers.push({ x: p.x, y0: 0, w: 18, warn: 0, dur: 0.6, t: 0 });
  stepWorld(w, []);
  assert.equal(p.lives, PLAYER.START_LIVES);
  assert.equal(p.shield, 0);
  assert.ok(hitPlayer !== undefined);
});
