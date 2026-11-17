// 캐릭터 그림 테스트 (SPEC-v2 6단계): 모든 그리기 함수가 오류 없이 끝나고, 그리기 상태(save/restore)를 남기지 않는지
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  drawPlayer, drawPlayerIcon, drawEnemy, drawBoss, drawStarShot, drawCoin, drawPop,
  PLAYER_CHARS, ENEMY_CHARS, BOSS_CHARS, ENEMY_SPRITE,
} from '../web/js/game/sprites.js';
import { ENEMY } from '../web/js/game/rules.js';

// Canvas 대신 호출만 받아 주는 가짜 ctx. save/restore 짝을 센다
function fakeCtx() {
  let depth = 0;
  let calls = 0;
  const target = {
    save() { depth++; calls++; },
    restore() { depth--; calls++; },
    createLinearGradient: () => ({ addColorStop() {} }),
    get depth() { return depth; },
    get calls() { return calls; },
  };
  return new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      return () => { calls++; };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}

test('플레이어 4종: 기울기·폭탄 표정 포함 그리기', () => {
  assert.equal(PLAYER_CHARS.length, 4);
  for (let slot = 1; slot <= 4; slot++) {
    for (const o of [{}, { t: 1.3, tilt: -1, bombing: true }, { t: 2.7, tilt: 1 }]) {
      const ctx = fakeCtx();
      drawPlayer(ctx, slot, o);
      drawPlayerIcon(ctx, slot);
      assert.equal(ctx.depth, 0, `${slot}P save/restore 짝`);
      assert.ok(ctx.calls > 20);
    }
  }
});

test('적 5종 + 보스: 번쩍임·2단계 포함 그리기', () => {
  assert.equal(Object.keys(ENEMY_CHARS).length, 5);
  for (const kind of Object.keys(ENEMY_CHARS)) {
    for (const flash of [false, true]) {
      const ctx = fakeCtx();
      drawEnemy(ctx, kind, { t: 0.5, flash });
      assert.equal(ctx.depth, 0, kind);
    }
  }
  for (const kind of Object.keys(BOSS_CHARS)) {
    for (const phase of [1, 2]) {
      const ctx = fakeCtx();
      drawBoss(ctx, kind, { t: 1, phase, flash: phase === 2 });
      assert.equal(ctx.depth, 0, kind);
    }
  }
});

test('게임 속 적 종류는 모두 그림이 있음', () => {
  for (const type of ['s1', 's2', 'm1']) {
    assert.ok(ENEMY[type], type);
    assert.ok(ENEMY_CHARS[ENEMY_SPRITE[type]], `${type} → 그림`);
  }
});

test('별 총알·코인·뿅 효과', () => {
  const ctx = fakeCtx();
  for (let p = 1; p <= 4; p++) drawStarShot(ctx, p, p * 0.3);
  drawCoin(ctx, 0.2);
  drawPop(ctx, 0);
  drawPop(ctx, 0.99, true);
  assert.equal(ctx.depth, 0);
});
