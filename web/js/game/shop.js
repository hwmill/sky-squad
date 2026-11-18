// 상점 구매 판정 (SPEC-v2 3장). 화면 없이 계산만 하는 순수 함수 → Node에서 테스트
// 같이 할 때(9단계)는 방장이 이 함수로 최종 판정한다.
import { SHOP, PLAYER } from './rules.js';

export const itemById = (id) => SHOP.ITEMS.find((it) => it.id === id);

// 플레이어에 상점 효과 값 준비 (createPlayer 뒤 한 번)
export function initUpgrades(p) {
  p.rapidLv = 0;      // 빠른 연사 횟수 (0~3)
  p.wingsLv = 0;      // 날쌘 날개 횟수 (0~2)
  p.magnetBig = false;
  p.shieldNext = 0;   // 산 보호막 (다음 스테이지 시작 때 shield로 옮김)
  p.shield = 0;       // 이번 스테이지에서 쓸 수 있는 보호막
}

// 상품마다: 지금 몇 번째인지(level), 최대에 닿았는지
function stock(p, id) {
  switch (id) {
    case 'power': return { level: p.power, maxed: p.power >= PLAYER.MAX_POWER };
    case 'rapid': return { level: p.rapidLv, maxed: p.rapidLv >= itemById('rapid').prices.length };
    case 'wings': return { level: p.wingsLv, maxed: p.wingsLv >= itemById('wings').prices.length };
    case 'bomb': return { level: p.bombs, maxed: p.bombs >= PLAYER.MAX_BOMBS };
    case 'life': return { level: p.lives, maxed: p.lives >= PLAYER.MAX_LIVES };
    case 'shield': return { level: p.shieldNext, maxed: p.shieldNext >= 1 };
    case 'magnet': return { level: p.magnetBig ? 1 : 0, maxed: p.magnetBig };
    default: return { level: 0, maxed: true };
  }
}

// 가격: 여러 번 사는 상품은 횟수에 따라 오름
export function priceOf(p, id) {
  const it = itemById(id);
  if (!it) return Infinity;
  const n = id === 'rapid' ? p.rapidLv : id === 'wings' ? p.wingsLv : 0;
  return it.prices[Math.min(n, it.prices.length - 1)];
}

// 상점 한 번 열 때마다 새로 (되돌리기 기록, 이번 상점에서 산 생명 수)
export function openShop() {
  return { history: [], lifeBought: 0 };
}

// 화면에 보여 줄 상태: { price, canBuy, reason }
export function itemState(shop, p, id) {
  const price = priceOf(p, id);
  const { maxed } = stock(p, id);
  if (maxed) return { price, canBuy: false, reason: '최대예요' };
  if (id === 'life' && shop.lifeBought >= SHOP.LIFE_PER_VISIT) return { price, canBuy: false, reason: '이번 상점에서는 1개만' };
  if (p.coins < price) return { price, canBuy: false, reason: `코인이 ${price - p.coins} 모자라요` };
  return { price, canBuy: true, reason: '' };
}

// 되돌리기용으로 바뀔 수 있는 값을 통째로 저장
const FIELDS = ['coins', 'power', 'rapidLv', 'wingsLv', 'bombs', 'lives', 'shieldNext', 'magnetBig'];
const snapshot = (p) => Object.fromEntries(FIELDS.map((k) => [k, p[k]]));

export function buy(shop, p, id) {
  const st = itemState(shop, p, id);
  if (!st.canBuy) return { ok: false, reason: st.reason };
  shop.history.push({ id, before: snapshot(p) });
  p.coins -= st.price;
  switch (id) {
    case 'power': p.power++; break;
    case 'rapid': p.rapidLv++; break;
    case 'wings': p.wingsLv++; break;
    case 'bomb': p.bombs++; break;
    case 'life': p.lives++; shop.lifeBought++; break;
    case 'shield': p.shieldNext = 1; break;
    case 'magnet': p.magnetBig = true; break;
    default: break;
  }
  return { ok: true, price: st.price };
}

// 마지막 구매 되돌리기 (상점을 나가기 전까지)
export function undo(shop, p) {
  const last = shop.history.pop();
  if (!last) return null;
  Object.assign(p, last.before);
  if (last.id === 'life') shop.lifeBought--;
  return last.id;
}

// 상품 효과가 게임 계산에 쓰이는 값
export const fireRateOf = (p, base) => base * (1 + SHOP.RAPID_STEP * (p.rapidLv || 0));
export const moveMulOf = (p) => 1 + SHOP.WINGS_STEP * (p.wingsLv || 0);
