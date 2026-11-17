// 터치 입력: 화면 아무 곳이나 드래그하면 손가락 이동량만큼 비행기가 움직인다(상대 이동).
// 오른쪽 아래 원형 버튼 = 폭탄. PC 확인용으로 방향키/WASD 이동, 스페이스·X = 폭탄
import { VIEW, PLAYER, BOMB_BUTTON, TICK } from './rules.js';

export function bombButtonCenter() {
  const r = BOMB_BUTTON.D / 2;
  return { x: VIEW.W - BOMB_BUTTON.MARGIN - r, y: VIEW.H - BOMB_BUTTON.MARGIN - r, r };
}

// view: { scale, toLogical(clientX, clientY) } — 그리는 쪽(render.js)이 제공
export function createInput(target, view) {
  let dx = 0;
  let dy = 0;
  let bomb = false;
  let dragId = null;
  let lastX = 0;
  let lastY = 0;
  const keys = new Set();

  function onDown(e) {
    e.preventDefault();
    const p = view.toLogical(e.clientX, e.clientY);
    const c = bombButtonCenter();
    if (Math.hypot(p.x - c.x, p.y - c.y) <= c.r + BOMB_BUTTON.TOUCH_EXTRA) {
      bomb = true;
      return;
    }
    if (dragId === null) {
      dragId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      try { target.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    }
  }
  function onMove(e) {
    if (e.pointerId !== dragId) return;
    e.preventDefault();
    dx += (e.clientX - lastX) / view.scale;
    dy += (e.clientY - lastY) / view.scale;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onUp(e) {
    if (e.pointerId === dragId) dragId = null;
  }

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'KeyX') bomb = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  return {
    // 계산 한 번(1/60초)마다 호출. 쌓인 이동량을 넘겨주고 비운다
    read() {
      const k = PLAYER.KEY_SPEED * TICK.DT;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= k;
      if (keys.has('ArrowRight') || keys.has('KeyD')) dx += k;
      if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= k;
      if (keys.has('ArrowDown') || keys.has('KeyS')) dy += k;
      const r = { dx, dy, bomb };
      dx = 0;
      dy = 0;
      bomb = false;
      return r;
    },
    reset() {
      dx = 0;
      dy = 0;
      bomb = false;
      dragId = null;
      keys.clear();
    },
  };
}
