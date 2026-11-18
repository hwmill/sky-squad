// 코인 (SPEC-v2 3장): 적이 떨어뜨림 → 줍기 / 자석 / 4초 뒤 사라짐, 보스·클리어 보너스
// 계산만 한다 (그리기는 render.js). world.economy가 켜진 판(혼자 하기)에서만 동작
import { VIEW, COIN, PLAYER, SHOP } from './rules.js';

const isAlive = (p) => p.lives > 0; // player.js와 서로 불러오지 않도록 여기 따로 둠

// 플레이어에 코인 관련 값 준비 (createPlayer 뒤 한 번)
export function initCoins(p) {
  p.coins = 0;        // 이번 판 지갑
  p.stageCoins = 0;   // 이번 스테이지에서 얻은 코인 (결과 화면용)
  p.missed = false;   // 이번 스테이지에서 목숨을 잃었는지 (노미스 보너스)
}

function give(world, p, n) {
  p.coins += n;
  p.stageCoins += n;
}

// 적이 쓰러진 자리에 코인 떨어뜨리기
export function dropCoin(world, x, y, value) {
  if (!world.economy || world.coins.length >= COIN.MAX) return;
  const a = -Math.PI / 2 + (world.rng() - 0.5) * 1.2; // 위쪽으로 살짝 흩어짐
  world.coins.push({
    x, y, value,
    vx: Math.cos(a) * COIN.POP_SPEED * 0.6,
    vy: Math.sin(a) * COIN.POP_SPEED,
    t: 0,
    pulled: false,
    dead: false,
  });
}

export const magnetRange = (p) => COIN.MAGNET_R * (p.magnetBig ? SHOP.MAGNET_MULT : 1);

// 가장 가까운, 자석 범위 안의 살아 있는 플레이어
function nearestPuller(world, c) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.players) {
    if (!isAlive(p)) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    const r = magnetRange(p);
    if (d <= r * r && d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function updateCoins(world, dt) {
  for (const c of world.coins) {
    c.t += dt;
    if (c.t >= COIN.LIFE) { c.dead = true; continue; }
    const p = nearestPuller(world, c);
    if (p) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = Math.min(d, COIN.MAGNET_SPEED * dt);
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
      c.pulled = true;
      continue;
    }
    c.vy = Math.min(COIN.FALL_MAX, c.vy + COIN.GRAVITY * dt);
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vx *= 0.96;
    if (c.y > VIEW.H + 20) c.dead = true;
  }
}

// 줍기: 먼저 닿은 사람이 가져감 (같이 할 때 9단계에서 사용)
export function collectCoins(world) {
  for (const c of world.coins) {
    if (c.dead) continue;
    for (const p of world.players) {
      if (!isAlive(p)) continue;
      const r = PLAYER.PICKUP_R + COIN.R;
      if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= r * r) {
        c.dead = true;
        give(world, p, c.value);
        world.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value, slot: p.slot });
        break;
      }
    }
  }
  if (world.coins.some((c) => c.dead)) world.coins = world.coins.filter((c) => !c.dead);
}

// 보스 처치: 살아 있는 전원이 각자 받음 (아이가 손해 보지 않도록)
export function giveBossCoins(world) {
  if (!world.economy) return;
  for (const p of world.players) if (isAlive(p)) give(world, p, COIN.BOSS);
}

// 스테이지 클리어: 살아 있는 전원 + 노미스 보너스
export function giveClearBonus(world) {
  if (!world.economy) return;
  for (const p of world.players) {
    if (!isAlive(p)) continue;
    give(world, p, COIN.CLEAR_BONUS + (p.missed ? 0 : COIN.NOMISS_BONUS));
  }
}
