// 상점·코인 테스트 (SPEC-v2 7단계): 가격, 최대치, 돈 부족, 되돌리기, 상점 1회 1개(생명), 보호막 1회 무효
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLAYER, SHOT, SHOP, COIN, DIFFICULTY, TICK, BOSS } from '../web/js/game/rules.js';
import { createWorld, stepWorld, nextRound, continueGame } from '../web/js/game/engine.js';
import { hitPlayer } from '../web/js/game/player.js';
import { openShop, itemState, buy, undo, priceOf, fireRateOf } from '../web/js/game/shop.js';
import { dropCoin, magnetRange } from '../web/js/game/coins.js';
import { spawnEnemy, damageEnemy } from '../web/js/game/enemies.js';
import { createBoss, damageBoss } from '../web/js/game/boss.js';
import { fireEnemyShot } from '../web/js/game/bullets.js';

const EMPTY = { timeline: [] };
const solo = () => createWorld({ ...EMPTY, economy: true });
const rich = (coins = 5000) => { const w = solo(); w.players[0].coins = coins; return { w, p: w.players[0], shop: openShop() }; };

// ------------------------------------------------------------------ 상점
test('가격: 상품표대로, 여러 번 사는 상품은 횟수마다 오름', () => {
  const { p, shop } = rich();
  assert.equal(priceOf(p, 'power'), 150);
  assert.deepEqual([1, 2, 3].map(() => { const pr = priceOf(p, 'rapid'); buy(shop, p, 'rapid'); return pr; }), [120, 200, 300]);
  assert.deepEqual([1, 2].map(() => { const pr = priceOf(p, 'wings'); buy(shop, p, 'wings'); return pr; }), [100, 180]);
  assert.equal(p.coins, 5000 - 620 - 280);
});

test('최대치: 총알 4단계, 연사 3회, 날개 2회, 폭탄 5, 생명 5, 보호막·자석 1', () => {
  const { p, shop } = rich(99999);
  p.power = PLAYER.MAX_POWER;
  assert.deepEqual(itemState(shop, p, 'power'), { price: 150, canBuy: false, reason: '최대예요' });
  for (let i = 0; i < 3; i++) assert.ok(buy(shop, p, 'rapid').ok);
  assert.equal(buy(shop, p, 'rapid').reason, '최대예요');
  for (let i = 0; i < 2; i++) assert.ok(buy(shop, p, 'wings').ok);
  assert.equal(buy(shop, p, 'wings').reason, '최대예요');
  p.bombs = PLAYER.MAX_BOMBS - 1;
  assert.ok(buy(shop, p, 'bomb').ok);
  assert.equal(buy(shop, p, 'bomb').reason, '최대예요');
  assert.ok(buy(shop, p, 'shield').ok);
  assert.equal(buy(shop, p, 'shield').reason, '최대예요');
  assert.ok(buy(shop, p, 'magnet').ok);
  assert.equal(buy(shop, p, 'magnet').reason, '최대예요');
  p.lives = PLAYER.MAX_LIVES;
  assert.equal(itemState(openShop(), p, 'life').reason, '최대예요');
});

test('돈 부족: 회색 + "코인이 N 모자라요", 코인은 그대로', () => {
  const { p, shop } = rich(120);
  const st = itemState(shop, p, 'power');
  assert.equal(st.canBuy, false);
  assert.equal(st.reason, '코인이 30 모자라요');
  assert.equal(buy(shop, p, 'power').ok, false);
  assert.equal(p.coins, 120);
  assert.equal(p.power, 1);
});

test('되돌리기: 마지막 구매부터 하나씩, 상점을 나가면(새 상점) 되돌릴 수 없음', () => {
  const { p, shop } = rich(500);
  buy(shop, p, 'power');
  buy(shop, p, 'bomb');
  assert.equal(p.coins, 270);
  assert.equal(undo(shop, p), 'bomb');
  assert.equal(p.bombs, PLAYER.START_BOMBS);
  assert.equal(p.coins, 350);
  assert.equal(undo(shop, p), 'power');
  assert.equal(p.power, 1);
  assert.equal(p.coins, 500);
  assert.equal(undo(shop, p), null);
  buy(shop, p, 'magnet');
  assert.equal(undo(openShop(), p), null); // 다음 상점에서는 이전 구매를 못 되돌림
  assert.equal(p.magnetBig, true);
});

test('생명: 상점 한 번에 1개만, 되돌리면 다시 살 수 있음', () => {
  const { p, shop } = rich(2000);
  assert.ok(buy(shop, p, 'life').ok);
  assert.equal(p.lives, PLAYER.START_LIVES + 1);
  assert.equal(buy(shop, p, 'life').reason, '이번 상점에서는 1개만');
  undo(shop, p);
  assert.ok(buy(shop, p, 'life').ok);
  assert.ok(buy(openShop(), p, 'life').ok); // 다음 상점에서는 또 1개
});

test('보호막: 다음 스테이지에서 피격 1회 무효, 그다음 피격은 그대로, 그 스테이지가 끝나면 사라짐', () => {
  const { w, p, shop } = rich(1000);
  buy(shop, p, 'shield');
  assert.equal(p.shield, 0); // 산 스테이지(상점)에서는 아직 아님
  nextRound(w);
  assert.equal(p.shield, 1);
  p.invuln = 0;
  assert.equal(hitPlayer(w, p), false);
  assert.equal(p.lives, PLAYER.START_LIVES);
  assert.ok(w.events.some((e) => e.type === 'shield'));
  assert.ok(p.invuln > 0);
  p.invuln = 0;
  assert.equal(hitPlayer(w, p), true);
  assert.equal(p.lives, PLAYER.START_LIVES - 1);
  // 안 쓰고 넘긴 보호막은 다음 스테이지로 이어지지 않음
  buy(openShop(), p, 'shield');
  nextRound(w);
  nextRound(w);
  assert.equal(p.shield, 0);
});

test('빠른 연사·날쌘 날개 효과', () => {
  const { w, p, shop } = rich(2000);
  buy(shop, p, 'rapid');
  assert.equal(fireRateOf(p, SHOT.RATE), SHOT.RATE * (1 + SHOP.RAPID_STEP));
  const x0 = p.x;
  buy(shop, p, 'wings');
  stepWorld(w, [{ dx: 10, dy: 0 }]);
  assert.ok(Math.abs(p.x - (x0 + 10 * (1 + SHOP.WINGS_STEP))) < 1e-9);
  // 1초 동안 발사 횟수가 늘어남
  const shots = () => w.events.filter((e) => e.type === 'shot').length;
  w.events.length = 0;
  for (let i = 0; i < TICK.HZ; i++) stepWorld(w, []);
  assert.ok(shots() >= Math.floor(SHOT.RATE * (1 + SHOP.RAPID_STEP)));
});

// ------------------------------------------------------------------ 코인
test('코인: 소형 1·중형 5, 주우면 지갑에, 4초 뒤 사라짐', () => {
  const w = solo();
  const p = w.players[0];
  spawnEnemy(w, { type: 's1', x: 100, pattern: 'down' });
  spawnEnemy(w, { type: 'm1', x: 250, pattern: 'down' });
  for (const e of w.enemies) damageEnemy(w, e, 999, 1);
  assert.deepEqual(w.coins.map((c) => c.value).sort((a, b) => a - b), [COIN.SMALL, COIN.MEDIUM]);
  // 하나는 플레이어 위치로 옮겨 줍기
  w.coins[0].x = p.x; w.coins[0].y = p.y;
  const v = w.coins[0].value;
  stepWorld(w, []);
  assert.equal(p.coins, v);
  assert.ok(w.events.some((e) => e.type === 'coin'));
  // 나머지는 멀리서 4초 지나면 사라짐
  for (const c of w.coins) { c.x = 20; c.y = 60; c.vx = 0; c.vy = 0; }
  for (let i = 0; i < COIN.LIFE * TICK.HZ + 2; i++) stepWorld(w, []);
  assert.equal(w.coins.length, 0);
  assert.equal(p.coins, v);
});

test('자석: 범위 안 코인은 끌려와서 획득, 큰 자석은 범위 2배', () => {
  const w = solo();
  const p = w.players[0];
  dropCoin(w, p.x + COIN.MAGNET_R - 5, p.y, 1);
  for (let i = 0; i < 30; i++) stepWorld(w, []);
  assert.equal(p.coins, 1);
  assert.equal(magnetRange(p), COIN.MAGNET_R);
  p.magnetBig = true;
  assert.equal(magnetRange(p), COIN.MAGNET_R * SHOP.MAGNET_MULT);
});

test('보스 50 + 클리어 100 + 노미스 50, 목숨을 잃었으면 노미스 없음', () => {
  for (const missed of [false, true]) {
    const w = solo();
    const p = w.players[0];
    if (missed) { p.invuln = 0; hitPlayer(w, p); }
    w.boss = createBoss(w);
    w.boss.entering = false;
    damageBoss(w, w.boss, 1e6, 1);
    assert.equal(p.coins, COIN.BOSS);
    for (let i = 0; i < BOSS.CLEAR_DELAY * TICK.HZ + 2; i++) stepWorld(w, []);
    assert.equal(w.state, 'clear');
    const expect = COIN.BOSS + COIN.CLEAR_BONUS + (missed ? 0 : COIN.NOMISS_BONUS);
    assert.equal(p.coins, expect);
    assert.equal(p.stageCoins, expect);
  }
});

test('이어하기해도 코인 유지 (점수만 0)', () => {
  const w = solo();
  const p = w.players[0];
  p.coins = 77;
  p.score = 500;
  p.lives = 1;
  p.invuln = 0;
  hitPlayer(w, p);
  assert.equal(p.lives, 0);
  assert.ok(continueGame(w, 1));
  assert.equal(p.coins, 77);
  assert.equal(p.score, 0);
});

test('다음 스테이지: 난이도 배율(체력 +20%, 탄 속도 +8%), 점수·코인 유지, 스테이지 코인은 0부터', () => {
  const w = solo();
  const p = w.players[0];
  p.score = 1234; p.coins = 300; p.stageCoins = 300;
  nextRound(w);
  assert.equal(w.round, 2);
  assert.equal(w.state, 'play');
  assert.equal(w.hpMul, 1 + DIFFICULTY.HP_PER_STAGE);
  assert.equal(p.score, 1234);
  assert.equal(p.coins, 300);
  assert.equal(p.stageCoins, 0);
  spawnEnemy(w, { type: 'm1', x: 100, pattern: 'down' });
  assert.equal(w.enemies[0].hp, Math.round(30 * 1.2));
  fireEnemyShot(w, 0, 0, Math.PI / 2, 100);
  assert.ok(Math.abs(w.eshots.list[0].vy - 100 * (1 + DIFFICULTY.SHOT_SPEED_PER_STAGE)) < 1e-9);
});

test('같이 하기(economy 끔)에서는 코인이 떨어지지 않음 (9단계 전까지 기존 동작 유지)', () => {
  const w = createWorld({ ...EMPTY, playerCount: 2 });
  spawnEnemy(w, { type: 's1', x: 100, pattern: 'down' });
  damageEnemy(w, w.enemies[0], 999, 1);
  assert.equal(w.coins.length, 0);
});
