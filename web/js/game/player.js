// 플레이어 비행기: 이동, 자동 발사, 폭탄, 피격, 이어하기
import { VIEW, PLAYER, BOMB, SHOT, CONTINUE, SHOP } from './rules.js';
import { fireShot, clearPool } from './bullets.js';
import { damageEnemy } from './enemies.js';
import { damageBoss } from './boss.js';
import { initCoins } from './coins.js';
import { initUpgrades, fireRateOf, moveMulOf } from './shop.js';

export function createPlayer(slot) {
  const p = {
    slot,
    x: 0,
    y: 0,
    lives: PLAYER.START_LIVES,
    bombs: PLAYER.START_BOMBS,
    power: PLAYER.START_POWER,
    score: 0,
    invuln: 0,
    bombT: 0,       // 폭탄 사용 중 남은 시간 (이 동안 재사용 불가)
    fireT: 0,
    continueT: 0,   // 목숨 0일 때 이어하기 카운트다운
    spectator: false,
    spawn: 0,       // 시작 위치로 옮길 때마다 +1 (게스트가 자기 위치를 맞추는 신호)
  };
  initCoins(p);     // 코인·노미스 기록 (SPEC-v2)
  initUpgrades(p);  // 상점 효과 (SPEC-v2)
  placeAtStart(p);
  return p;
}

export const isAlive = (p) => p.lives > 0;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// 시작·부활 위치: 하단 중앙. 같이 할 때는 자리별로 조금씩 옆으로 (겹치지 않게)
export function placeAtStart(p) {
  const offset = PLAYER.SLOT_SPREAD[(p.slot - 1) % PLAYER.SLOT_SPREAD.length] || 0;
  p.x = VIEW.W / 2 + offset;
  p.y = VIEW.H - PLAYER.RESPAWN_FROM_BOTTOM;
  p.spawn = (p.spawn || 0) + 1;
}

// input: { dx, dy } 손가락 이동량(상대) 또는 { x, y } 절대 위치(같이 하기 게스트용)
export function movePlayer(p, input) {
  if (!isAlive(p) || !input) return;
  if (Number.isFinite(input.x) && Number.isFinite(input.y)) {
    p.x = input.x;
    p.y = input.y;
  } else {
    const k = moveMulOf(p); // 날쌘 날개: 손가락보다 조금 더 많이 움직임
    p.x += (input.dx || 0) * k;
    p.y += (input.dy || 0) * k;
  }
  p.x = clamp(p.x, PLAYER.EDGE, VIEW.W - PLAYER.EDGE);
  p.y = clamp(p.y, PLAYER.EDGE, VIEW.H - PLAYER.EDGE);
}

function fireVolley(world, p) {
  for (const g of SHOT.PATTERNS[p.power]) fireShot(world, p.x + g.dx, p.y + SHOT.GUN_Y, g.a, p.slot);
  world.events.push({ type: 'shot', slot: p.slot });
}

// 타이머와 자동 발사 (초당 SHOT.RATE번, 빠른 연사를 사면 더 빠르게)
export function tickPlayer(world, p, dt) {
  if (!isAlive(p)) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.bombT > 0) p.bombT = Math.max(0, p.bombT - dt);
  const gap = 1 / fireRateOf(p, SHOT.RATE);
  while (p.fireT <= 1e-9) {
    fireVolley(world, p);
    p.fireT += gap;
  }
  p.fireT -= dt;
}

// 폭탄: 적 탄 전부 제거, 모든 적에게 피해, 잠깐 무적. 사용 중이면 다시 못 씀
export function useBomb(world, p) {
  if (!isAlive(p) || p.bombs <= 0 || p.bombT > 0) return false;
  p.bombs--;
  p.bombT = BOMB.DURATION;
  p.invuln = Math.max(p.invuln, BOMB.INVULN);
  clearPool(world.eshots);
  for (const e of world.enemies) damageEnemy(world, e, BOMB.DAMAGE, p.slot);
  if (world.boss) damageBoss(world, world.boss, BOMB.DAMAGE, p.slot);
  world.events.push({ type: 'bomb', x: p.x, y: p.y, slot: p.slot });
  return true;
}

// 피격: 목숨 -1, 총알 단계 -1(최소 1), 폭탄 충전, 하단 중앙에서 무적 상태로 부활
// 보호막(상점)이 있으면 한 번은 막고 잠깐 무적
export function hitPlayer(world, p) {
  if (!isAlive(p) || p.invuln > 0) return false;
  if (p.shield > 0) {
    p.shield--;
    p.invuln = SHOP.SHIELD_INVULN;
    world.events.push({ type: 'shield', x: p.x, y: p.y, slot: p.slot });
    return false;
  }
  world.events.push({ type: 'hit', x: p.x, y: p.y, slot: p.slot });
  p.missed = true; // 노미스 보너스 없음
  p.lives--;
  p.power = Math.max(PLAYER.MIN_POWER, p.power - 1);
  p.bombs = Math.max(p.bombs, PLAYER.RESPAWN_BOMBS);
  p.bombT = 0;
  if (p.lives > 0) {
    placeAtStart(p);
    p.invuln = PLAYER.HIT_INVULN;
  } else {
    p.continueT = CONTINUE.SECONDS;
    p.invuln = 0;
    world.events.push({ type: 'dead', slot: p.slot });
  }
  return true;
}

// 이어하기: 목숨 3·폭탄 3·점수 0으로 지금 위치(스테이지 진행)에서 계속
export function continuePlayer(p) {
  p.lives = CONTINUE.LIVES;
  p.bombs = CONTINUE.BOMBS;
  p.score = 0;
  p.continueT = 0;
  p.spectator = false;
  p.invuln = PLAYER.HIT_INVULN;
  p.bombT = 0;
  p.fireT = 0;
  placeAtStart(p);
}
