// 총알: 객체 풀로 재사용해서 매 프레임 새 객체를 만들지 않는다 (폰에서 끊김 방지)
import { VIEW, SHOT, ENEMY_SHOT } from './rules.js';

export function createPool(max) {
  return { list: [], free: [], max };
}

// 빈 객체 하나 꺼내기. 최대 개수를 넘으면 null
export function take(pool) {
  if (pool.list.length >= pool.max) return null;
  const o = pool.free.pop() || {};
  pool.list.push(o);
  return o;
}

// keep(o)가 false인 것은 목록에서 빼서 재사용 대기열로
export function sweep(pool, keep) {
  const l = pool.list;
  let w = 0;
  for (let i = 0; i < l.length; i++) {
    const o = l[i];
    if (keep(o)) l[w++] = o;
    else pool.free.push(o);
  }
  l.length = w;
}

export function clearPool(pool) {
  for (const o of pool.list) pool.free.push(o);
  pool.list.length = 0;
}

const DEG = Math.PI / 180;

// 내 총알. angleDeg: 0 = 위쪽, +는 오른쪽으로 기울어짐
export function fireShot(world, x, y, angleDeg, owner) {
  const s = take(world.shots);
  if (!s) return;
  s.x = x;
  s.y = y;
  s.vx = Math.sin(angleDeg * DEG) * SHOT.SPEED;
  s.vy = -Math.cos(angleDeg * DEG) * SHOT.SPEED;
  s.owner = owner;
  s.dead = false;
}

// 적 탄. angle: 라디안 (0 = 오른쪽, π/2 = 아래쪽). world.shotMul: 스테이지 난이도 (탄 속도)
export function fireEnemyShot(world, x, y, angle, baseSpeed) {
  const b = take(world.eshots);
  if (!b) return;
  const speed = baseSpeed * (world.shotMul || 1);
  b.x = x;
  b.y = y;
  b.vx = Math.cos(angle) * speed;
  b.vy = Math.sin(angle) * speed;
  b.dead = false;
}

const inShotArea = (o) => !o.dead && o.y > -20 && o.y < VIEW.H + 20 && o.x > -20 && o.x < VIEW.W + 20;
const inEnemyShotArea = (o) => {
  const m = ENEMY_SHOT.OFFSCREEN;
  return !o.dead && o.y > -m && o.y < VIEW.H + m && o.x > -m && o.x < VIEW.W + m;
};

export function moveBullets(world, dt) {
  for (const s of world.shots.list) { s.x += s.vx * dt; s.y += s.vy * dt; }
  for (const b of world.eshots.list) { b.x += b.vx * dt; b.y += b.vy * dt; }
}

// 맞았거나 화면 밖으로 나간 총알 정리
export function sweepBullets(world) {
  sweep(world.shots, inShotArea);
  sweep(world.eshots, inEnemyShotArea);
}
