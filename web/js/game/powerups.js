// 파워업 아이템: P(총알 단계), B(폭탄), 1UP(목숨)
import { VIEW, PLAYER, POWERUP, SCORE } from './rules.js';

// 중형 적이 떨어뜨림. forced가 있으면 그 종류(예: '1UP')
export function dropPowerup(world, x, y, forced) {
  let kind = forced || (world.rng() < POWERUP.P_CHANCE ? 'P' : 'B');
  if (kind === '1UP') {
    // 1UP은 스테이지당 최대 1개. 넘으면 P로 바꿈
    if (world.stage.oneUps >= POWERUP.ONEUP_PER_STAGE) kind = 'P';
    else world.stage.oneUps++;
  }
  world.powerups.push({ kind, x, y, y0: y, t: 0, dead: false });
}

export function updatePowerups(world, dt) {
  for (const u of world.powerups) {
    u.t += dt;
    // 천천히 떨어지면서 위아래로 흔들림
    u.y = u.y0 + POWERUP.FALL_SPEED * u.t + POWERUP.BOB_AMP * Math.sin(POWERUP.BOB_SPEED * u.t);
    if (u.y > VIEW.H + POWERUP.OFFSCREEN) u.dead = true;
  }
}

export function applyPowerup(world, p, kind) {
  if (kind === 'P') {
    if (p.power < PLAYER.MAX_POWER) p.power++;
    else p.score += SCORE.POWER_MAX_BONUS;
  } else if (kind === 'B') {
    p.bombs = Math.min(PLAYER.MAX_BOMBS, p.bombs + 1);
  } else if (kind === '1UP') {
    p.lives = Math.min(PLAYER.MAX_LIVES, p.lives + 1);
  }
  world.events.push({ type: 'powerup', kind, x: p.x, y: p.y, slot: p.slot });
}
