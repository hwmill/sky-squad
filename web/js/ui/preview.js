// 캐릭터 미리보기 화면 (?preview=chars) — SPEC-v2 6단계 확인용
// 모든 캐릭터를 이름과 함께 한 화면에 늘어놓고 움직임까지 보여 준다. 게임 계산은 하지 않는다.
import { VIEW, PLAYER, BOSSES } from '../game/rules.js';
import {
  drawPlayer, drawHitDot, drawEnemy, drawBoss, drawStarShot, drawCoin, drawPop,
  PLAYER_CHARS, ENEMY_CHARS, BOSS_CHARS,
} from '../game/sprites.js';

const FONT = 'system-ui, -apple-system, "Noto Sans KR", sans-serif';
// 와플 거북선 포대 위치 (rules.js BOSSES.waffleShip.TURRET.spots)
const PREVIEW_PARTS = BOSSES.waffleShip.TURRET.spots.map(([dx, dy]) => ({ dx, dy, r: BOSSES.waffleShip.TURRET.r, hitT: 0 }));

export function startPreview(canvas) {
  const ctx = canvas.getContext('2d');
  // 화면을 누르면 게임 처음 화면으로
  canvas.addEventListener('pointerup', () => { location.href = location.pathname; });

  function label(text, x, y, size = 11, color = '#ffffff', align = 'center', weight = 'bold') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }
  function at(x, y, fn) {
    ctx.save();
    ctx.translate(x, y);
    fn();
    ctx.restore();
  }

  function frame(now) {
    const t = now / 1000;
    const k = canvas.width / VIEW.W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    g.addColorStop(0, '#0d1433');
    g.addColorStop(1, '#22306a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    label('캐릭터 미리보기', VIEW.W / 2, 26, 17);
    label('sky-squad 2차 · 6단계 그림 확인', VIEW.W / 2, 42, 10, '#9aa6d8', 'center', 'normal');

    // ---- 플레이어: 뭉게 비행단
    label('뭉게 비행단 (플레이어)', 14, 66, 11, '#b8c4ff', 'left');
    PLAYER_CHARS.forEach((c, i) => {
      const x = 48 + i * 88;
      const y = 104;
      const bombing = (t + i) % 4 < 0.8; // 가끔 폭탄 쓰는 표정
      const tilt = Math.sin(t * 1.4 + i * 1.2);
      at(x, y, () => {
        drawPlayer(ctx, i + 1, { t: t + i * 0.37, tilt, bombing });
        drawHitDot(ctx, PLAYER.HITBOX_R - 1); // 판정 점 (게임과 같은 크기)
      });
      label(`${i + 1}P ${c.name}`, x, 146, 12, c.ui);
    });

    // ---- 적: 심술 과자단
    label('심술 과자단 (적)', 14, 176, 11, '#b8c4ff', 'left');
    const flashOn = (i) => (t * 1.3 + i * 0.4) % 2 < 0.08; // 맞았을 때 번쩍임 시연
    ['jelly', 'macaron', 'candyBee'].forEach((kind, i) => {
      const x = 60 + i * 120;
      at(x, 212, () => drawEnemy(ctx, kind, { t: t + i, flash: flashOn(i) }));
      label(ENEMY_CHARS[kind].name, x, 246, 11);
      label(ENEMY_CHARS[kind].size, x, 259, 9, '#9aa6d8', 'center', 'normal');
    });
    ['cookieTank', 'donutTurret'].forEach((kind, i) => {
      const x = 110 + i * 140;
      at(x, 298, () => drawEnemy(ctx, kind, { t: t + i, flash: flashOn(i + 3) }));
      label(ENEMY_CHARS[kind].name, x, 342, 11);
      label(ENEMY_CHARS[kind].size, x, 355, 9, '#9aa6d8', 'center', 'normal');
    });

    // ---- 보스
    // 보스 5종을 4초씩 차례로 (2초는 보통, 2초는 화난 단계)
    const kinds = Object.keys(BOSS_CHARS);
    const kind = kinds[Math.floor(t / 4) % kinds.length];
    const angry = t % 4 >= 2;
    const phase = angry ? (kind === 'cakeKing' ? 3 : 2) : 1;
    const parts = kind === 'waffleShip' ? PREVIEW_PARTS.map((q, i) => ({ ...q, dead: angry && i < 2 })) : null;
    label(`보스 (스테이지 ${BOSS_CHARS[kind].stage} / 5)`, 14, 380, 11, '#b8c4ff', 'left');
    at(VIEW.W / 2, 444, () => drawBoss(ctx, kind, { t, phase, spin: t * 0.6, parts, flash: (t % 2) < 0.06 }));
    label(`${BOSS_CHARS[kind].name} · ${angry ? '화난 단계' : '처음 단계'}`, VIEW.W / 2, 512, 12);

    // ---- 총알·코인·효과
    label('별 총알 · 코인 · 뿅 효과', 14, 532, 11, '#b8c4ff', 'left');
    for (let p = 1; p <= PLAYER.MAX_POWER; p++) { // 총알 1~8단계 색
      const x = 22 + (p - 1) * 24;
      at(x, 562, () => drawStarShot(ctx, p, t));
      label(String(p), x, 590, 10, '#dfe5ff', 'center', 'normal');
    }
    label('단계', 22 + 3.5 * 24, 604, 9, '#9aa6d8', 'center', 'normal');
    at(232, 562, () => drawCoin(ctx, t));
    label('코인', 232, 590, 10, '#dfe5ff', 'center', 'normal');
    at(306, 566, () => drawPop(ctx, (t % 1.2) / 1.2));
    label('뿅', 306, 590, 10, '#dfe5ff', 'center', 'normal');

    label('화면을 누르면 게임 처음 화면으로', VIEW.W / 2, 624, 10, '#7f8bc0', 'center', 'normal');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
