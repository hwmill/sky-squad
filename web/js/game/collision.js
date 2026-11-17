// 충돌 판정 (원과 원)
import { PLAYER, SHOT, ENEMY_SHOT, POWERUP } from './rules.js';
import { damageEnemy } from './enemies.js';
import { damageBoss, bossTargetable } from './boss.js';
import { hitPlayer, isAlive } from './player.js';
import { applyPowerup } from './powerups.js';

export function overlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function handleCollisions(world) {
  const { enemies, boss, players } = world;

  // 1. 내 총알 → 적, 보스
  for (const s of world.shots.list) {
    if (s.dead) continue;
    for (const e of enemies) {
      if (!e.dead && overlap(s.x, s.y, SHOT.R, e.x, e.y, e.r)) {
        s.dead = true;
        damageEnemy(world, e, SHOT.DAMAGE, s.owner);
        break;
      }
    }
    if (!s.dead && bossTargetable(boss) && overlap(s.x, s.y, SHOT.R, boss.x, boss.y, boss.r)) {
      s.dead = true;
      damageBoss(world, boss, SHOT.DAMAGE, s.owner);
    }
  }

  for (const p of players) {
    if (!isAlive(p)) continue;

    // 2. 적 탄·적 몸체 → 플레이어 (무적이면 통과)
    if (p.invuln <= 0) {
      let hit = false;
      for (const b of world.eshots.list) {
        if (!b.dead && overlap(p.x, p.y, PLAYER.HITBOX_R, b.x, b.y, ENEMY_SHOT.R)) {
          b.dead = true;
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const e of enemies) {
          if (!e.dead && overlap(p.x, p.y, PLAYER.BODY_R, e.x, e.y, e.r * 0.7)) { hit = true; break; }
        }
      }
      if (!hit && boss && !boss.dead && overlap(p.x, p.y, PLAYER.BODY_R, boss.x, boss.y, boss.r * 0.7)) hit = true;
      if (hit) hitPlayer(world, p);
    }

    // 3. 아이템 줍기 (무적이어도 가능)
    if (!isAlive(p)) continue;
    for (const u of world.powerups) {
      if (!u.dead && overlap(p.x, p.y, PLAYER.PICKUP_R, u.x, u.y, POWERUP.R)) {
        u.dead = true;
        applyPowerup(world, p, u.kind);
      }
    }
  }
}
