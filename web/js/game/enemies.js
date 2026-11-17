// 일반 적(소형 s1·s2, 중형 m1): 등장, 이동 패턴, 사격, 피해
import { VIEW, ENEMY, TEAM } from './rules.js';
import { fireEnemyShot } from './bullets.js';
import { dropPowerup } from './powerups.js';

const DEG = Math.PI / 180;

// 같이 할 때 인원 보정한 체력
export function scaledHp(base, playerCount) {
  return Math.round(base * (1 + TEAM.HP_SCALE_PER_EXTRA * (playerCount - 1)));
}

// 살아 있는 플레이어 중 가장 가까운 사람 쪽 각도 (없으면 아래쪽)
export function aimAt(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.players) {
    if (p.lives <= 0) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best ? Math.atan2(best.y - y, best.x - x) : Math.PI / 2;
}

// spec: 등장표 한 줄 { type, x, pattern, dir, drop }
export function spawnEnemy(world, spec) {
  const def = ENEMY[spec.type];
  const hp = scaledHp(def.hp, world.players.length);
  world.enemies.push({
    id: world.nextId++,
    type: spec.type,
    x: spec.x,
    y: ENEMY.SPAWN_Y,
    x0: spec.x,
    t: 0,
    hp,
    maxHp: hp,
    r: def.r,
    pattern: spec.pattern,
    dir: spec.dir || 1,
    fireT: def.fireDelay ?? def.fireEvery ?? 0,
    phase: 0,       // 중형: 0 내려옴, 1 머무르며 사격, 2 떠남
    phaseT: 0,
    drop: spec.drop || null,
    hitT: 0,
    dead: false,
  });
}

function move(e, def, dt) {
  switch (e.pattern) {
    case 'sine':
      e.y += def.speed * dt;
      e.x = e.x0 + def.sineAmp * Math.sin(def.sineSpeed * e.t);
      break;
    case 'diag':
      e.x += e.dir * def.speed * ENEMY.DIAG * dt;
      e.y += def.speed * ENEMY.DIAG * dt;
      break;
    case 'hover':
      if (e.phase === 0) {
        e.y += def.speed * dt;
        if (e.y >= def.hoverY) { e.y = def.hoverY; e.phase = 1; e.phaseT = 0; }
      } else if (e.phase === 1) {
        e.phaseT += dt;
        if (e.phaseT >= def.hoverTime) e.phase = 2;
      } else {
        e.y += def.leaveSpeed * dt;
      }
      break;
    default: // 'down'
      e.y += def.speed * dt;
  }
}

function shoot(world, e, def, dt) {
  if (e.type === 's2') {
    if (e.y < 0 || e.y > VIEW.H * def.fireMaxY) return;
    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT += def.fireEvery;
      fireEnemyShot(world, e.x, e.y + e.r * 0.5, aimAt(world, e.x, e.y), def.bulletSpeed);
    }
  } else if (e.type === 'm1') {
    if (e.phase !== 1) return;
    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT += def.fireEvery;
      const center = aimAt(world, e.x, e.y);
      const n = def.fanCount;
      for (let i = 0; i < n; i++) {
        const a = center + (i - (n - 1) / 2) * (def.fanSpread / (n - 1)) * DEG;
        fireEnemyShot(world, e.x, e.y + e.r * 0.6, a, def.bulletSpeed);
      }
    }
  }
}

export function updateEnemies(world, dt) {
  const m = ENEMY.OFFSCREEN;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const def = ENEMY[e.type];
    e.t += dt;
    if (e.hitT > 0) e.hitT -= dt;
    move(e, def, dt);
    shoot(world, e, def, dt);
    // 화면 밖으로 나가면 조용히 사라짐 (점수 없음)
    if (e.y > VIEW.H + m || e.x < -m || e.x > VIEW.W + m) e.dead = true;
  }
}

export function damageEnemy(world, e, dmg, owner) {
  if (e.dead) return;
  e.hp -= dmg;
  e.hitT = ENEMY.HIT_FLASH;
  if (e.hp <= 0) killEnemy(world, e, owner);
}

function killEnemy(world, e, owner) {
  e.dead = true;
  const def = ENEMY[e.type];
  const p = world.players.find((q) => q.slot === owner);
  if (p) p.score += def.score;
  world.events.push({ type: 'explode', x: e.x, y: e.y, size: e.type === 'm1' ? 2 : 1 });
  if (e.type === 'm1') dropPowerup(world, e.x, e.y, e.drop);
}

export function removeDeadEnemies(world) {
  const l = world.enemies;
  let w = 0;
  for (let i = 0; i < l.length; i++) if (!l[i].dead) l[w++] = l[i];
  l.length = w;
}
