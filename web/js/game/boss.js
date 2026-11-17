// 스테이지 1 보스: 내려와서 좌우로 움직이며 3가지 패턴으로 공격.
// 체력 50% 이하가 되면 패턴 구성이 바뀌고 더 빨라진다.
import { VIEW, BOSS, SCORE, ENEMY } from './rules.js';
import { fireEnemyShot, clearPool } from './bullets.js';
import { scaledHp, aimAt } from './enemies.js';

const DEG = Math.PI / 180;

export function createBoss(world) {
  const hp = scaledHp(BOSS.HP, world.players.length);
  return {
    x: VIEW.W / 2,
    y: BOSS.START_Y,
    r: BOSS.R,
    hp,
    maxHp: hp,
    entering: true,  // 내려오는 동안은 맞지 않음
    phase: 1,
    pattern: 0,
    patternT: 0,
    fireT: 0,
    spin: 0,
    swayT: 0,
    hitT: 0,
    dead: false,
  };
}

// 총알이 맞을 수 있는 상태인지
export const bossTargetable = (b) => b && !b.dead && !b.entering;

function firePattern(world, b, name, cfg) {
  if (name === 'AIMED') {
    const center = aimAt(world, b.x, b.y);
    for (let i = 0; i < cfg.count; i++) {
      const a = center + (i - (cfg.count - 1) / 2) * cfg.spread * DEG;
      fireEnemyShot(world, b.x, b.y + b.r * 0.6, a, cfg.speed);
    }
  } else if (name === 'SPIRAL') {
    for (let i = 0; i < cfg.arms; i++) {
      fireEnemyShot(world, b.x, b.y, b.spin + (i * 2 * Math.PI) / cfg.arms, cfg.speed);
    }
    b.spin += cfg.turn * DEG * cfg.every;
  } else if (name === 'RING') {
    const offset = world.rng() * 2 * Math.PI;
    for (let i = 0; i < cfg.count; i++) {
      fireEnemyShot(world, b.x, b.y, offset + (i * 2 * Math.PI) / cfg.count, cfg.speed);
    }
  }
}

export function updateBoss(world, b, dt) {
  if (b.dead) return;
  if (b.hitT > 0) b.hitT -= dt;
  if (b.entering) {
    b.y += BOSS.ENTER_SPEED * dt;
    if (b.y >= BOSS.ENTER_Y) { b.y = BOSS.ENTER_Y; b.entering = false; }
    return;
  }
  b.swayT += dt;
  b.x = VIEW.W / 2 + BOSS.SWAY_RANGE * Math.sin(BOSS.SWAY_SPEED * b.swayT);

  if (b.phase === 1 && b.hp <= b.maxHp * BOSS.PHASE2_AT) {
    b.phase = 2;
    b.pattern = 0;
    b.patternT = 0;
    b.fireT = 0;
    world.events.push({ type: 'bossPhase', x: b.x, y: b.y });
  }

  const list = b.phase === 1 ? BOSS.PHASE1 : BOSS.PHASE2;
  b.patternT += dt;
  if (b.patternT >= BOSS.PATTERN_TIME) {
    b.patternT = 0;
    b.pattern = (b.pattern + 1) % list.length;
    b.fireT = 0;
  }
  const name = list[b.pattern];
  const cfg = BOSS[name];
  const rate = b.phase === 2 ? BOSS.PHASE2_RATE : 1;
  b.fireT -= dt;
  while (b.fireT <= 0) {
    firePattern(world, b, name, cfg);
    b.fireT += cfg.every * rate;
  }
}

export function damageBoss(world, b, dmg, owner) {
  if (!bossTargetable(b)) return;
  b.hp -= dmg;
  b.hitT = ENEMY.HIT_FLASH;
  if (b.hp > 0) return;
  b.hp = 0;
  b.dead = true;
  const p = world.players.find((q) => q.slot === owner);
  if (p) p.score += SCORE.BOSS;
  clearPool(world.eshots);
  world.clearT = BOSS.CLEAR_DELAY;
  world.events.push({ type: 'bossDown', x: b.x, y: b.y });
}
