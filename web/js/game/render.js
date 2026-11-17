// 그리기 전용. 게임 상태(world)를 읽기만 하고 바꾸지 않는다.
// 그림 파일 없이 Canvas 도형으로 직접 그린다.
// 캐릭터·적 그림은 sprites.js (SPEC-v2 6단계)
import { VIEW, DISPLAY, PLAYER, ENEMY_SHOT, POWERUP } from './rules.js';
import { bombButtonCenter } from './input.js';
import {
  drawPlayer, drawPlayerIcon, drawHitDot, drawEnemy, drawBoss as drawBossSprite, drawStarShot, drawPop,
  playerChar, ENEMY_SPRITE, BOSS_CHARS, RAINBOW,
} from './sprites.js';

const POWERUP_COLOR = { P: '#ff9b3d', B: '#4da3ff', '1UP': '#5fd068' };
const FONT = 'system-ui, -apple-system, "Noto Sans KR", sans-serif';
const MAX_SPARKS = 400;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let lastNow = 0;
  let flashT = 0;   // 폭탄 번쩍임
  let warnT = 0;    // 보스 경고
  let shakeT = 0;   // 피격 흔들림
  const sparks = [];
  const rings = [];
  const pops = [];          // "뿅" 효과
  const tilts = new Map();  // 자리별 기울기 (그림 전용, 계산에는 영향 없음)
  const stars = makeStars();

  const view = {
    get scale() { return scale; },
    toLogical(cx, cy) {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
    },
  };

  // 화면 크기에 맞춰 360×640 비율을 유지하며 확대
  function resize() {
    scale = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
    const dpr = Math.min(window.devicePixelRatio || 1, DISPLAY.MAX_DPR);
    canvas.style.width = `${Math.floor(VIEW.W * scale)}px`;
    canvas.style.height = `${Math.floor(VIEW.H * scale)}px`;
    canvas.width = Math.round(VIEW.W * scale * dpr);
    canvas.height = Math.round(VIEW.H * scale * dpr);
  }

  // 사건 → 효과 (폭발 불꽃, 번쩍임 등)
  function addEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'explode':
          burst(ev.x, ev.y, ev.size === 2 ? 14 : 6, ev.size === 2 ? 140 : 100, '#ffe066');
          if (pops.length < 40) pops.push({ x: ev.x, y: ev.y, t: 0, big: ev.size === 2 });
          break;
        case 'hit': burst(ev.x, ev.y, 30, 180, '#ffffff'); shakeT = 0.3; break;
        case 'bomb': flashT = 0.35; rings.push({ x: ev.x, y: ev.y, t: 0 }); break;
        case 'bossDown': burst(ev.x, ev.y, 80, 260, '#ffd23f'); flashT = 0.5; shakeT = 0.6; break;
        case 'bossPhase': burst(ev.x, ev.y, 30, 140, '#ff5b9b'); break;
        case 'boss': warnT = 2.5; break;
        case 'powerup': rings.push({ x: ev.x, y: ev.y, t: 0, small: true }); break;
        default: break;
      }
    }
  }

  function burst(x, y, n, speed, color) {
    for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, t: 0, color });
    }
  }

  function draw(world, now, opts = {}) {
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    const frozen = !world || world.state !== 'play';
    const k = canvas.width / VIEW.W;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      shakeT -= dt;
      sx = (Math.random() - 0.5) * 6;
      sy = (Math.random() - 0.5) * 6;
    }
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground(now, frozen);
    if (world) {
      drawPowerups(world);
      drawEnemies(world, now);
      if (world.boss && !world.boss.dead) drawBoss(world.boss, now);
      drawShots(world, now, opts.slot || 1);
      drawPlayers(world, now);
      drawEnemyShots(world);
    }
    drawEffects(dt);
    ctx.restore();

    if (world) {
      const slot = opts.slot || 1;
      drawHud(world, slot, opts.fps);
      drawBombButton(world.players.find((q) => q.slot === slot));
      if (world.boss && !world.boss.dead && !world.boss.entering) drawBossBar(world.boss);
    }
    if (warnT > 0) { warnT -= dt; drawWarning(now); }
    if (flashT > 0) {
      flashT -= dt;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, flashT) * 1.5})`;
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    }
  }

  // ------------------------------------------------------------ 배경 (별 3겹)
  function makeStars() {
    const list = [];
    for (let i = 0; i < 70; i++) {
      const layer = i % 3;
      list.push({ x: Math.random() * VIEW.W, y: Math.random() * VIEW.H, layer, size: 1 + layer * 0.6 });
    }
    return list;
  }
  let starT = 0;
  function drawBackground(now, frozen) {
    if (!frozen) starT = now / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    g.addColorStop(0, '#070b1f');
    g.addColorStop(1, '#16224d');
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, VIEW.W + 20, VIEW.H + 20);
    for (const s of stars) {
      const speed = 20 + s.layer * 35;
      const y = (s.y + starT * speed) % VIEW.H;
      ctx.fillStyle = s.layer === 2 ? '#ffffff' : s.layer === 1 ? '#b8c4ff' : '#6672a8';
      ctx.fillRect(s.x, y, s.size, s.size * (1 + s.layer));
    }
  }

  // ------------------------------------------------------------ 플레이어 (sprites.js의 구름 요정)
  // 이동 방향으로 살짝 기울기: 직전 위치와 비교 (그림 전용 상태)
  function tiltOf(p) {
    const o = tilts.get(p.slot) || { x: p.x, v: 0 };
    const target = Math.max(-1, Math.min(1, (p.x - o.x) / 3));
    o.v += (target - o.v) * 0.2;
    o.x = p.x;
    tilts.set(p.slot, o);
    return o.v;
  }

  function drawPlayers(world, now) {
    for (const p of world.players) {
      if (p.lives <= 0) continue;
      const tilt = tiltOf(p);
      // 무적 중 깜박임
      if (p.invuln > 0 && Math.floor(p.invuln * PLAYER.BLINK_HZ) % 2 === 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      drawPlayer(ctx, p.slot, { t: now / 1000 + p.slot * 0.37, tilt, bombing: p.bombT > 0 });
      drawHitDot(ctx, PLAYER.HITBOX_R - 1); // 실제 피격 판정 위치 (그림보다 훨씬 작음)
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ 총알
  // 별 총알: 쏜 사람의 총알 단계에 따라 색이 바뀜 (게스트 화면은 주인 정보가 없어 내 단계 색)
  function drawShots(world, now, mySlot) {
    const t = now / 1000;
    const powerOf = new Map(world.players.map((p) => [p.slot, p.power]));
    const myPower = powerOf.get(mySlot) || 1;
    for (const s of world.shots.list) {
      ctx.save();
      ctx.translate(s.x, s.y);
      drawStarShot(ctx, powerOf.get(s.owner) || myPower, t);
      ctx.restore();
    }
  }

  function drawEnemyShots(world) {
    const list = world.eshots.list;
    if (!list.length) return;
    ctx.fillStyle = '#ff4fa3';
    ctx.beginPath();
    for (const b of list) { ctx.moveTo(b.x + ENEMY_SHOT.R + 1, b.y); ctx.arc(b.x, b.y, ENEMY_SHOT.R + 1, 0, Math.PI * 2); }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const b of list) { ctx.moveTo(b.x + 2, b.y); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); }
    ctx.fill();
  }

  // ------------------------------------------------------------ 적 (sprites.js의 심술 과자단)
  function drawEnemies(world, now) {
    const t = now / 1000;
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (e.dead) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      drawEnemy(ctx, ENEMY_SPRITE[e.type] || 'jelly', { t: t + (i % 7) * 0.29, flash: e.hitT > 0 });
      if (e.type === 'm1' && e.maxHp) { // 중형 체력 표시 (작은 막대)
        const w = 36 * Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-18, -32, 36, 3);
        ctx.fillStyle = '#9dff9d';
        ctx.fillRect(-18, -32, w, 3);
      }
      ctx.restore();
    }
  }

  function drawBoss(b, now) {
    ctx.save();
    ctx.translate(b.x, b.y);
    drawBossSprite(ctx, 'pudding', { t: now / 1000, flash: b.hitT > 0, phase: b.phase });
    ctx.restore();
  }

  function drawBossBar(b) {
    const x = 40;
    const y = DISPLAY.HUD_H + 6;
    const w = VIEW.W - 80;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = b.phase === 2 ? '#ff5b5b' : '#ffd23f';
    ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 8);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('BOSS', x - 4, y + 8);
    ctx.textAlign = 'left';
    ctx.fillText(BOSS_CHARS.pudding.name, x, y + 20);
  }

  // ------------------------------------------------------------ 아이템
  function drawPowerups(world) {
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const u of world.powerups) {
      const w = u.kind === '1UP' ? 30 : 24;
      ctx.fillStyle = POWERUP_COLOR[u.kind];
      roundRect(u.x - w / 2, u.y - POWERUP.R + 2, w, POWERUP.R * 2 - 4, 7);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(u.kind, u.x, u.y + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------ 효과
  function drawEffects(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t += dt;
      if (s.t >= s.life) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      ctx.globalAlpha = 1 - s.t / s.life;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      const life = r.small ? 0.35 : 0.8;
      if (r.t >= life) { rings.splice(i, 1); continue; }
      const rad = (r.small ? 60 : 500) * (r.t / life);
      if (r.small) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - r.t / life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      // 폭탄: 무지개 원형 파동
      ctx.globalAlpha = 1 - r.t / life;
      ctx.lineWidth = 5;
      for (let k = 0; k < RAINBOW.length; k++) {
        ctx.strokeStyle = RAINBOW[k];
        ctx.beginPath();
        ctx.arc(r.x, r.y, Math.max(0, rad - k * 5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 쓰러질 때 "뿅"
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i];
      q.t += dt;
      const life = q.big ? 0.6 : 0.45;
      if (q.t >= life) { pops.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(q.x, q.y);
      drawPop(ctx, q.t / life, q.big);
      ctx.restore();
    }
  }

  function drawWarning(now) {
    if (Math.floor(now / 250) % 2) return;
    ctx.fillStyle = 'rgba(255,40,80,0.18)';
    ctx.fillRect(0, VIEW.H / 2 - 40, VIEW.W, 80);
    ctx.fillStyle = '#ff5b7a';
    ctx.font = `900 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WARNING!', VIEW.W / 2, VIEW.H / 2 + 12);
  }

  // ------------------------------------------------------------ HUD
  function drawHud(world, slot, fps) {
    const p = world.players.find((q) => q.slot === slot);
    if (!p) return;
    ctx.fillStyle = 'rgba(5,8,25,0.55)';
    ctx.fillRect(0, 0, VIEW.W, DISPLAY.HUD_H);

    // 목숨: 내 캐릭터 얼굴 아이콘
    for (let i = 0; i < p.lives; i++) {
      ctx.save();
      ctx.translate(14 + i * 15, 18);
      drawPlayerIcon(ctx, slot);
      ctx.restore();
    }

    // 폭탄 수
    const bx = 14 + Math.max(3, p.lives) * 15 + 8;
    for (let i = 0; i < p.bombs; i++) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(bx + i * 12, 18, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 점수 (같이 할 때는 개인 점수. 내 자리 색으로 "2P" 표시)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(p.score.toLocaleString('ko-KR'), VIEW.W - 48, 24);
    if (world.players.length > 1) {
      ctx.fillStyle = playerChar(slot).ui;
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText(`${slot}P`, VIEW.W - 48, 34);
    }

    // 총알 단계
    ctx.fillStyle = POWERUP_COLOR.P;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`P${p.power}`, VIEW.W - 12, 24);

    if (fps) {
      ctx.fillStyle = fps >= 55 ? '#9dff9d' : '#ff9b9b';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`FPS ${fps}`, 8, VIEW.H - 10); // 왼쪽 아래 (보스 체력 막대와 겹치지 않게)
    }
  }

  function drawBombButton(p) {
    if (!p) return;
    const c = bombButtonCenter();
    const ready = p.lives > 0 && p.bombs > 0 && p.bombT <= 0;
    ctx.fillStyle = ready ? 'rgba(255,90,90,0.38)' : 'rgba(140,140,160,0.22)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(255,200,200,0.8)' : 'rgba(200,200,220,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillText('B', c.x, c.y + 3);
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(`×${p.bombs}`, c.x, c.y + 20);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { resize, draw, addEvents, view };
}
