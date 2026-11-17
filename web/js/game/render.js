// 그리기 전용. 게임 상태(world)를 읽기만 하고 바꾸지 않는다.
// 그림 파일 없이 Canvas 도형으로 직접 그린다.
import { VIEW, DISPLAY, PLAYER, SHOT, ENEMY_SHOT, POWERUP } from './rules.js';
import { bombButtonCenter } from './input.js';

// 1P 파랑, 2P 빨강, 3P 초록, 4P 노랑
const PLAYER_BODY = ['#4da3ff', '#ff5b5b', '#5fd068', '#ffd23f'];
const PLAYER_WING = ['#2a6fd1', '#c63b3b', '#3a9c49', '#c9a21c'];
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
        case 'explode': burst(ev.x, ev.y, ev.size === 2 ? 26 : 12, ev.size === 2 ? 160 : 110, '#ffb347'); break;
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
      drawEnemies(world);
      if (world.boss && !world.boss.dead) drawBoss(world.boss, now);
      drawShots(world);
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

  // ------------------------------------------------------------ 플레이어
  function drawJet(x, y, slot, now, alpha = 1) {
    const i = (slot - 1) % 4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // 엔진 불꽃
    const flick = 4 + Math.sin(now / 25) * 3;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-4, 12); ctx.lineTo(0, 18 + flick); ctx.lineTo(4, 12);
    ctx.fill();
    // 날개
    ctx.fillStyle = PLAYER_WING[i];
    ctx.beginPath();
    ctx.moveTo(-17, 9); ctx.lineTo(0, -4); ctx.lineTo(17, 9); ctx.lineTo(15, 13); ctx.lineTo(0, 8); ctx.lineTo(-15, 13);
    ctx.closePath();
    ctx.fill();
    // 꼬리 날개
    ctx.beginPath();
    ctx.moveTo(-7, 14); ctx.lineTo(0, 9); ctx.lineTo(7, 14); ctx.lineTo(0, 13);
    ctx.closePath();
    ctx.fill();
    // 동체
    ctx.fillStyle = PLAYER_BODY[i];
    ctx.beginPath();
    ctx.moveTo(0, -19); ctx.lineTo(5, -7); ctx.lineTo(5, 13); ctx.lineTo(-5, 13); ctx.lineTo(-5, -7);
    ctx.closePath();
    ctx.fill();
    // 조종석
    ctx.fillStyle = '#dff4ff';
    ctx.beginPath();
    ctx.ellipse(0, -6, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayers(world, now) {
    for (const p of world.players) {
      if (p.lives <= 0) continue;
      // 무적 중 깜박임
      if (p.invuln > 0 && Math.floor(p.invuln * PLAYER.BLINK_HZ) % 2 === 0) continue;
      drawJet(p.x, p.y, p.slot, now);
      // 실제 피격 판정 위치 (작은 점)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.HITBOX_R - 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ 총알
  function drawShots(world) {
    ctx.fillStyle = '#9fe6ff';
    for (const s of world.shots.list) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vx, -s.vy));
      ctx.fillRect(-1.5, -SHOT.R * 2, 3, SHOT.R * 3);
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

  // ------------------------------------------------------------ 적
  function drawEnemies(world) {
    for (const e of world.enemies) {
      if (e.dead) continue;
      const flash = e.hitT > 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.type === 's1') drawDrone(flash);
      else if (e.type === 's2') drawSaucer(flash);
      else drawGunship(flash, e);
      ctx.restore();
    }
  }

  function drawDrone(flash) { // 주황 소형 (아래를 향함)
    ctx.fillStyle = flash ? '#ffffff' : '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(0, 12); ctx.lineTo(11, -6); ctx.lineTo(4, -2); ctx.lineTo(0, -10); ctx.lineTo(-4, -2); ctx.lineTo(-11, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#ffd27a';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSaucer(flash) { // 보라 원반 (사격형)
    ctx.fillStyle = flash ? '#ffffff' : '#a46bff';
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#e3d2ff';
    ctx.beginPath();
    ctx.ellipse(0, -2, 7, 6, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ff4fa3';
    ctx.fillRect(-1.5, 7, 3, 4);
  }

  function drawGunship(flash, e) { // 초록 중형 (머무르며 사격)
    ctx.fillStyle = flash ? '#ffffff' : '#3f8f6b';
    ctx.beginPath();
    ctx.moveTo(-26, -8); ctx.lineTo(26, -8); ctx.lineTo(18, 8); ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#6fcf97';
    ctx.fillRect(-12, -18, 24, 30);
    ctx.fillStyle = flash ? '#ffffff' : '#264d3b';
    ctx.fillRect(-4, 10, 8, 10);
    // 체력 표시 (작은 막대)
    const w = 36 * Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-18, -26, 36, 3);
    ctx.fillStyle = '#9dff9d';
    ctx.fillRect(-18, -26, w, 3);
  }

  function drawBoss(b, now) {
    const flash = b.hitT > 0;
    ctx.save();
    ctx.translate(b.x, b.y);
    // 몸체 (육각형)
    ctx.fillStyle = flash ? '#ffffff' : '#7a2340';
    ctx.beginPath();
    ctx.moveTo(-60, -10); ctx.lineTo(-36, -36); ctx.lineTo(36, -36); ctx.lineTo(60, -10); ctx.lineTo(40, 30); ctx.lineTo(-40, 30);
    ctx.closePath();
    ctx.fill();
    // 양쪽 포탑
    ctx.fillStyle = flash ? '#ffffff' : '#b8406a';
    ctx.fillRect(-52, 0, 16, 26);
    ctx.fillRect(36, 0, 16, 26);
    // 가운데 핵 (깜박이는 빛)
    const pulse = 0.6 + 0.4 * Math.sin(now / 150);
    ctx.fillStyle = b.phase === 2 ? `rgba(255,80,80,${pulse})` : `rgba(255,210,63,${pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.strokeStyle = r.small ? `rgba(255,255,255,${1 - r.t / life})` : `rgba(160,220,255,${1 - r.t / life})`;
      ctx.lineWidth = r.small ? 2 : 6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, (r.small ? 60 : 500) * (r.t / life), 0, Math.PI * 2);
      ctx.stroke();
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

    // 목숨: 작은 비행기 아이콘
    ctx.save();
    for (let i = 0; i < p.lives; i++) {
      ctx.save();
      ctx.translate(14 + i * 15, 18);
      ctx.scale(0.45, 0.45);
      ctx.fillStyle = PLAYER_BODY[(slot - 1) % 4];
      ctx.beginPath();
      ctx.moveTo(0, -19); ctx.lineTo(17, 9); ctx.lineTo(0, 4); ctx.lineTo(-17, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

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
      ctx.fillStyle = PLAYER_BODY[(slot - 1) % 4];
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
