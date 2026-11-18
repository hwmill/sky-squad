// 같이 하기 2차 테스트 (SPEC-v2 9단계): 상점 상태 주고받기, 스냅샷에 실리는 코인·스테이지·레이저·포대
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SHOP, NETPLAY } from '../web/js/game/rules.js';
import { createWorld, stepWorld, goToStage } from '../web/js/game/engine.js';
import { openShop, buy, undo, itemState, shopStateOf, applyShopState } from '../web/js/game/shop.js';
import { createBoss } from '../web/js/game/boss.js';
import { dropCoin } from '../web/js/game/coins.js';
import { encodeSnapshot, decodeSnapshot, createGuestView } from '../web/js/net/sync.js';

const EMPTY = { timeline: [] };

test('상점 상태: 방장 판정 결과를 게스트 화면이 똑같이 보여 줌 (살 수 있음·이유·되돌리기)', () => {
  const w = createWorld({ ...EMPTY, slots: [1, 2], economy: true });
  const host2 = w.players[1];
  host2.coins = 600;
  const shop = openShop();
  buy(shop, host2, 'life');
  buy(shop, host2, 'rapid');

  // 메시지로 오가는 모양 그대로 (JSON)
  const st = JSON.parse(JSON.stringify(shopStateOf(shop, host2)));
  const view = { slot: 2 };
  const vshop = { history: [], lifeBought: 0 };
  applyShopState(view, vshop, st);
  for (const it of SHOP.ITEMS) assert.deepEqual(itemState(vshop, view, it.id), itemState(shop, host2, it.id), it.id);
  assert.equal(vshop.history.at(-1).id, 'rapid'); // 되돌리기 버튼에 보일 상품
  assert.equal(itemState(vshop, view, 'life').reason, '이번 상점에서는 1개만');

  undo(shop, host2);
  applyShopState(view, vshop, shopStateOf(shop, host2));
  assert.equal(view.coins, 300);
  assert.equal(view.rapidLv, 0);
});

test('스냅샷: 스테이지·코인·레이저·포대·플레이어 코인이 실리고 게스트 화면에 나옴', () => {
  const w = createWorld({ ...EMPTY, slots: [1, 2], economy: true });
  goToStage(w, 3, []);
  w.boss = createBoss(w);
  w.boss.entering = false;
  w.boss.parts[1].dead = true;
  dropCoin(w, 100, 200, 5);
  w.lasers.push({ x: 50, y0: 120, w: 18, warn: 1, dur: 0.6, t: 0.2 });
  w.players[1].coins = 77;
  w.players[1].wingsLv = 2;
  w.players[1].shield = 1;
  stepWorld(w, []);

  const msg = JSON.parse(JSON.stringify(encodeSnapshot(w)));
  assert.ok(JSON.stringify(msg).length < 64 * 1024);
  const s = decodeSnapshot(msg);
  assert.equal(s.round, 3);
  assert.equal(s.coins.length, 1);
  assert.equal(s.coins[0].value, 5);
  assert.equal(s.lasers.length, 1);
  assert.deepEqual(s.boss.parts, [1, 0, 1, 1]);
  const p2 = s.players.find((p) => p.slot === 2);
  assert.deepEqual([p2.coins, p2.wingsLv, p2.shield], [77, 2, 1]);

  // 게스트가 그리는 세계: 배경(스테이지 3), 코인, 레이저(아직 경고선), 포대 위치까지
  const gv = createGuestView();
  gv.push(s, 0);
  const view = gv.build(NETPLAY.INTERP_DELAY_MS + 10, 2, { x: 100, y: 500 });
  assert.equal(view.round, 3);
  assert.equal(view.economy, true);
  assert.equal(view.coins.length, 1);
  assert.equal(view.lasers.length, 1);
  assert.equal(view.boss.kind, 'waffleShip');
  assert.equal(view.boss.parts.length, 4);
  assert.equal(view.boss.parts[1].dead, true);
});

test('예전(1차) 모양 스냅샷도 그대로 읽힘 (새 값이 없으면 기본값)', () => {
  const old = { t: 'st', f: 1, s: 0, p: [[1, 180, 550, 3, 3, 1, 0, 0, 0, 0, 0, 1]], e: [], b: 0, u: [], m: [], q: [], v: [] };
  const s = decodeSnapshot(old);
  assert.equal(s.round, 1);
  assert.deepEqual(s.coins, []);
  assert.deepEqual(s.lasers, []);
  assert.equal(s.players[0].coins, 0);
});
