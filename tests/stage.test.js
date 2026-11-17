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
