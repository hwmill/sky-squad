// 보스 5종 (SPEC-v2 2장): 내려와서 좌우로 움직이며 공격 패턴을 돌아가며 쓴다.
// 체력이 줄면 단계(phase)가 바뀌어 패턴 구성이 달라지고 빨라진다.
// - 푸딩 대장(스테이지 1): 1차와 같은 동작 (rules.js BOSS)
// - 문어 사탕왕: 다리 8개 회전 탄 / 와플 거북선: 포대 4개를 먼저 부숴야 몸통에 피해
// - 번개 솜사탕: 경고선 → 세로 번개 레이저 / 케이크 대마왕: 3단, 한 단 부서질 때마다 패턴 변경
import { VIEW, BOSS, BOSSES, SCORE, ENEMY } from './rules.js';
import { fireEnemyShot, clearPool } from './bullets.js';
import { scaledHp, aimAt, rankMul } from './enemies.js';
import { giveBossCoins } from './coins.js';

const DEG = Math.PI / 180;

// 푸딩 대장은 1차 상수(BOSS)를 다른 보스와 같은 모양으로 감싼다 (동작은 그대로)
const PUDDING = {
  HP: BOSS.HP,
  R: BOSS.R,
  SWAY_RANGE: BOSS.SWAY_RANGE,
  SWAY_SPEED: BOSS.SWAY_SPEED,
  phases: [
    { at: 1, list: BOSS.PHASE1, rate: 1 },
    { at: BOSS.PHASE2_AT, list: BOSS.PHASE2, rate: BOSS.PHASE2_RATE },
  ],
  AIMED: BOSS.AIMED,
  SPIRAL: BOSS.SPIRAL,
  RING: BOSS.RING,
};

export const bossDef = (kind) => (BOSSES[kind] || PUDDING);

export function createBoss(world, kind = world.bossKind || 'pudding') {
  const def = bossDef(kind);
  const n = world.players.length;
  const mul = (world.hpMul || 1) * rankMul(world, 'HP_MAX'); // 스테이지·파워 난이도 (포대 포함)
  const hp = Math.round(scaledHp(def.HP, n) * mul);
  const b = {
    kind,
    x: VIEW.W / 2,
    y: BOSS.START_Y,
    r: def.R,
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
    turretNext: 0,
    parts: null,     // 와플 거북선 포대
    dead: false,
  };
  if (def.TURRET) {
    const T = def.TURRET;
    b.parts = T.spots.map(([dx, dy]) => {
      const php = Math.round(scaledHp(T.hp, n) * mul);
      return { dx, dy, r: T.r, hp: php, maxHp: php, hitT: 0, dead: false };
    });
  }
  return b;
}

// 총알이 맞을 수 있는 상태인지
export const bossTargetable = (b) => b && !b.dead && !b.entering;
const partsAlive = (b) => Boolean(b.parts && b.parts.some((q) => !q.dead));
// 체력 막대용: 포대까지 합친 남은 비율
export function bossHpRatio(b) {
  let hp = Math.max(0, b.hp);
  let max = b.maxHp;
  if (b.parts) for (const q of b.parts) { hp += Math.max(0, q.hp); max += q.maxHp; }
  return max > 0 ? hp / max : 0;
}

// 지금 체력으로 몇 단계인지
function phaseOf(b, def) {
  if (b.parts) return partsAlive(b) ? 1 : 2;
  const ratio = b.hp / b.maxHp;
  let ph = 1;
  for (let i = 1; i < def.phases.length; i++) if (ratio <= def.phases[i].at) ph = i + 1;
  return ph;
}

function aimedFan(world, x, y, cfg) {
  const center = aimAt(world, x, y);
  for (let i = 0; i < cfg.count; i++) {
    fireEnemyShot(world, x, y, center + (i - (cfg.count - 1) / 2) * cfg.spread * DEG, cfg.speed);
  }
}

// 번개 레이저: 경고선 → 잠시 뒤 세로로 번쩍 (첫 줄은 플레이어 쪽, 나머지는 여기저기)
function spawnLasers(world, b, cfg) {
  const target = world.players.find((p) => p.lives > 0);
  const xs = [target ? target.x : VIEW.W / 2];
  for (let i = 1; i < cfg.count; i++) xs.push(30 + world.rng() * (VIEW.W - 60));
  for (const x of xs) world.lasers.push({ x, y0: b.y + b.r * 0.6, w: cfg.width, warn: cfg.warn, dur: cfg.dur, t: 0 });
  world.events.push({ type: 'laserWarn' });
}

function firePattern(world, b, name, cfg) {
  if (name === 'AIMED') {
    aimedFan(world, b.x, b.y + b.r * 0.6, cfg);
  } else if (name === 'SPIRAL' || name === 'SPIRAL2') {
    for (let i = 0; i < cfg.arms; i++) fireEnemyShot(world, b.x, b.y, b.spin + (i * 2 * Math.PI) / cfg.arms, cfg.speed);
    b.spin += cfg.turn * DEG * cfg.every;
  } else if (name === 'RING' || name === 'RING2') {
    const offset = world.rng() * 2 * Math.PI;
    for (let i = 0; i < cfg.count; i++) fireEnemyShot(world, b.x, b.y, offset + (i * 2 * Math.PI) / cfg.count, cfg.speed);
  } else if (name === 'LEGS' || name === 'LEGS_REV') {
    // 다리 끝 8곳에서 바깥쪽으로, 다리가 돌면서 회오리 모양
    for (let i = 0; i < cfg.arms; i++) {
      const a = b.spin + (i * 2 * Math.PI) / cfg.arms;
      fireEnemyShot(world, b.x + Math.cos(a) * b.r * 0.8, b.y + Math.sin(a) * b.r * 0.8, a, cfg.speed);
    }
    b.spin += cfg.turn * DEG * cfg.every * 4;
  } else if (name === 'LASER' || name === 'LASER2') {
    spawnLasers(world, b, cfg);
  } else if (name === 'TURRETS') {
    // 살아 있는 포대가 차례로 조준 사격
    const alive = b.parts.filter((q) => !q.dead);
    if (!alive.length) return;
    const q = alive[b.turretNext++ % alive.length];
    const T = bossDef(b.kind).TURRET;
    const x = b.x + q.dx;
    const y = b.y + q.dy;
    fireEnemyShot(world, x, y, aimAt(world, x, y), T.speed);
  }
}

export function updateLasers(world, dt) {
  if (!world.lasers.length) return;
  for (const l of world.lasers) l.t += dt;
  world.lasers = world.lasers.filter((l) => l.t < l.warn + l.dur);
}
export const laserActive = (l) => l.t >= l.warn && l.t < l.warn + l.dur;

export function updateBoss(world, b, dt) {
  if (b.dead) return;
  if (b.hitT > 0) b.hitT -= dt;
  if (b.parts) for (const q of b.parts) if (q.hitT > 0) q.hitT -= dt;
  if (b.entering) {
    b.y += BOSS.ENTER_SPEED * dt;
    if (b.y >= BOSS.ENTER_Y) { b.y = BOSS.ENTER_Y; b.entering = false; }
    return;
  }
  const def = bossDef(b.kind);
  b.swayT += dt;
  b.x = VIEW.W / 2 + def.SWAY_RANGE * Math.sin(def.SWAY_SPEED * b.swayT);

  const ph = phaseOf(b, def);
  if (ph !== b.phase) {
    b.phase = ph;
    b.pattern = 0;
    b.patternT = 0;
    b.fireT = 0;
    world.events.push({ type: 'bossPhase', x: b.x, y: b.y });
  }

  const cur = def.phases[b.phase - 1];
  b.patternT += dt;
  if (b.patternT >= BOSS.PATTERN_TIME) {
    b.patternT = 0;
    b.pattern = (b.pattern + 1) % cur.list.length;
    b.fireT = 0;
  }
  const name = cur.list[b.pattern];
  const cfg = def[name];
  b.fireT -= dt * rankMul(world, 'FIRE_MAX');
  while (b.fireT <= 0) {
    firePattern(world, b, name, cfg);
    b.fireT += cfg.every * cur.rate;
  }
}

const hitCircle = (ax, ay, ar, bx, by, br) => (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2;

// 내 총알 하나가 보스(포대 먼저)에 맞았는지. 맞았으면 피해를 주고 true (총알은 사라짐)
export function shotHitsBoss(world, b, x, y, r, dmg, owner) {
  if (!bossTargetable(b)) return false;
  if (b.parts) {
    for (const q of b.parts) {
      if (!q.dead && hitCircle(x, y, r, b.x + q.dx, b.y + q.dy, q.r)) { damagePart(world, b, q, dmg, owner); return true; }
    }
  }
  // 포대가 남아 있으면 총알이 등껍질을 지나가서 뒤쪽 포대까지 닿음 (몸통 피해는 없음)
  if (partsAlive(b)) return false;
  if (hitCircle(x, y, r, b.x, b.y, b.r)) { damageBoss(world, b, dmg, owner); return true; }
  return false;
}

function damagePart(world, b, q, dmg, owner) {
  q.hp -= dmg;
  q.hitT = ENEMY.HIT_FLASH;
  if (q.hp > 0) return;
  q.hp = 0;
  q.dead = true;
  const p = world.players.find((s) => s.slot === owner);
  if (p) p.score += SCORE.MEDIUM;
  world.events.push({ type: 'explode', x: b.x + q.dx, y: b.y + q.dy, size: 2 });
}

// 몸통 피해. 포대가 남아 있으면 단단한 등껍질이라 피해 없음 (총알은 막힘)
export function damageBoss(world, b, dmg, owner) {
  if (!bossTargetable(b)) return;
  if (partsAlive(b)) { b.hitT = ENEMY.HIT_FLASH * 0.5; return; }
  b.hp -= dmg;
  b.hitT = ENEMY.HIT_FLASH;
  if (b.hp > 0) return;
  b.hp = 0;
  b.dead = true;
  const p = world.players.find((q) => q.slot === owner);
  if (p) p.score += SCORE.BOSS;
  giveBossCoins(world);
  clearPool(world.eshots);
  if (world.lasers) world.lasers = [];
  world.clearT = BOSS.CLEAR_DELAY;
  world.events.push({ type: 'bossDown', x: b.x, y: b.y });
}

// 폭탄: 살아 있는 포대 전부와 (포대가 없으면) 몸통에 피해
export function damageBossAll(world, b, dmg, owner) {
  if (!bossTargetable(b)) return;
  if (b.parts) for (const q of b.parts) if (!q.dead) damagePart(world, b, q, dmg, owner);
  damageBoss(world, b, dmg, owner);
}
