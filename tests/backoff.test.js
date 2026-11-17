// 재연결 간격: 1초 → 2초 → 4초 … 최대 30초 (SPEC 4단계)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay } from '../web/js/net/backoff.js';

test('로비 재연결 간격은 1, 2, 4, 8, 16, 30, 30 … 초', () => {
  const seq = Array.from({ length: 8 }, (_, i) => backoffDelay(i, 1000, 30000) / 1000);
  assert.deepEqual(seq, [1, 2, 4, 8, 16, 30, 30, 30]);
});

test('게임방 재연결은 짧은 간격(0.5초부터 최대 4초)', () => {
  assert.equal(backoffDelay(0, 500, 4000), 500);
  assert.equal(backoffDelay(10, 500, 4000), 4000);
});
