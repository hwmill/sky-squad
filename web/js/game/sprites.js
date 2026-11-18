// 캐릭터 그림 (SPEC-v2 2장). 이미지 파일 없이 Canvas 도형으로만 그린다.
// - 모든 함수는 (0, 0)을 캐릭터 중심으로 보고 그린다. 위치 이동은 부르는 쪽에서 ctx.translate로.
// - 그림만 담당한다. 판정 크기(히트박스)와 게임 계산은 rules.js·engine.js 그대로.
// - 오리지널 캐릭터: 기존 만화·게임 캐릭터를 닮게 그리지 않는다 (CLAUDE.md 5번).

const TAU = Math.PI * 2;
const INK = '#3a2f45';        // 눈·입 색 (검정보다 부드럽게)
const BLUSH = 'rgba(255,120,150,0.55)';

// ------------------------------------------------------------ 이름표 (미리보기·HUD 공용)
// 플레이어 "뭉게 비행단": 1P 솜솜, 2P 딸콩, 3P 완두, 4P 레몽
export const PLAYER_CHARS = [
  { name: '솜솜', body: '#9ad8ff', shade: '#5fb2e6', ui: '#4db3f5' },
  { name: '딸콩', body: '#ffb8d2', shade: '#ee86ad', ui: '#ff7fb0' },
  { name: '완두', body: '#c3ec86', shade: '#8fc757', ui: '#7fcf4a' },
  { name: '레몽', body: '#ffe680', shade: '#e9c24a', ui: '#ffcf3a' },
];

// 적 "심술 과자단"
export const ENEMY_CHARS = {
  jelly: { name: '젤리콩', size: '소형' },
  macaron: { name: '심술 마카롱', size: '소형' },
  candyBee: { name: '사탕벌', size: '소형' },
  cookieTank: { name: '쿠키 탱크', size: '중형' },
  donutTurret: { name: '도넛 포대', size: '중형' },
};
export const BOSS_CHARS = {
  pudding: { name: '푸딩 대장', stage: 1 },
  octopus: { name: '문어 사탕왕', stage: 2 },
  waffleShip: { name: '와플 거북선', stage: 3 },
  cottonStorm: { name: '번개 솜사탕', stage: 4 },
  cakeKing: { name: '케이크 대마왕', stage: 5 },
};

// 게임 속 적 종류(rules.js) → 그림
export const ENEMY_SPRITE = { s1: 'jelly', s2: 'macaron', s3: 'candyBee', m1: 'cookieTank', m2: 'donutTurret' };

export const playerChar = (slot) => PLAYER_CHARS[(slot - 1) % 4];

// ------------------------------------------------------------ 공통 도형
// 맞았을 때 하얗게 번쩍임 — 켜져 있으면 모든 색을 흰색 쪽으로 많이 섞는다.
// (완전히 흰색으로 칠하면 계속 맞는 보스가 흰 덩어리로만 보여서 생김새가 남도록 섞음)
let FLASH = false;
const FLASH_MIX = 0.65;
const flashCache = new Map();
function col(c) {
  if (!FLASH || c[0] !== '#' || c.length !== 7) return c;
  let v = flashCache.get(c);
  if (!v) {
    const ch = (i) => {
      const n = parseInt(c.slice(i, i + 2), 16);
      return Math.round(n + (255 - n) * FLASH_MIX);
    };
    v = `rgb(${ch(1)},${ch(3)},${ch(5)})`;
    flashCache.set(c, v);
  }
  return v;
}

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
function ellipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function starPath(ctx, r, inner = 0.45, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
function line(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// 귀여운 눈 (점 + 반짝이)
function eyes(ctx, dx, y, r) {
  circle(ctx, -dx, y, r, col(INK));
  circle(ctx, dx, y, r, col(INK));
  if (FLASH) return;
  circle(ctx, -dx + r * 0.35, y - r * 0.4, r * 0.38, '#ffffff');
  circle(ctx, dx + r * 0.35, y - r * 0.4, r * 0.38, '#ffffff');
}
function blush(ctx, dx, y, rx) {
  if (FLASH) return;
  ellipse(ctx, -dx, y, rx, rx * 0.6, BLUSH);
  ellipse(ctx, dx, y, rx, rx * 0.6, BLUSH);
}
// 심술 얼굴: 안쪽으로 내려간 눈썹 + 찡그린 입. 무섭지 않게 (이빨·피 없음)
function grumpyFace(ctx, s, angry = 1) {
  const c = col(INK);
  const lift = 1.4 * s * angry;
  line(ctx, -5.5 * s, -4.2 * s - lift, -1.8 * s, -2.6 * s, 1.5 * s, c);
  line(ctx, 5.5 * s, -4.2 * s - lift, 1.8 * s, -2.6 * s, 1.5 * s, c);
  eyes(ctx, 3.6 * s, 0, 1.5 * s);
  blush(ctx, 6.2 * s, 2.4 * s, 2 * s);
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 5 * s, 2.2 * s, Math.PI * 1.15, Math.PI * 1.85); // 뒤집힌 웃음 = 뾰로통
  ctx.stroke();
}

// ------------------------------------------------------------ 플레이어 (구름 요정)
// o.t: 시간(초) / o.tilt: -1~1 이동 방향 기울기 / o.bombing: 폭탄 중(눈 꼭 감기)
const CLOUD = [ // 구름 몸: 원 여러 개를 겹침 [x, y, r]
  [0, -5, 12], [-9.5, -1, 7.5], [9.5, -1, 7.5], [-4.5, 3, 6.5], [4.5, 3, 6.5],
];

export function drawPlayer(ctx, slot, o = {}) {
  const ch = playerChar(slot);
  const t = o.t || 0;
  const flap = Math.floor(t * 8) % 2; // 날개 2프레임
  ctx.save();
  ctx.rotate((o.tilt || 0) * 0.28);
  ctx.translate(0, -4); // 그림을 살짝 위로: 판정 점(0,0)이 얼굴이 아니라 배 아래쪽에 오도록

  // 꼬리 반짝이 (구름이 지나간 자리)
  for (let i = 0; i < 3; i++) {
    const k = (t * 3 + i / 3) % 1;
    ctx.globalAlpha = 0.7 * (1 - k);
    circle(ctx, Math.sin((t + i) * 7) * 2, 9 + k * 12, 2.2 - k * 1.2, '#ffffff');
  }
  ctx.globalAlpha = 1;

  // 날개 (작은 흰 날개, 파닥임)
  const wa = flap ? -0.55 : -0.05;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 13, -6);
    ctx.rotate(side * wa);
    ellipse(ctx, side * 5, 0, 7, 4.2, '#e9f1ff');
    ellipse(ctx, side * 5.5, -0.6, 5.5, 3, '#ffffff');
    ctx.restore();
  }

  // 몸 (테두리 → 몸 색)
  for (const [x, y, r] of CLOUD) circle(ctx, x, y, r + 1.4, ch.shade);
  for (const [x, y, r] of CLOUD) circle(ctx, x, y, r, ch.body);
  ellipse(ctx, -4, -11, 4, 2.4, 'rgba(255,255,255,0.55)', -0.4); // 윤기

  // 얼굴 (판정 점이 배 가운데 (0,0)에 오도록 얼굴은 위쪽에)
  if (o.bombing) {
    // 눈을 꼭 감은 표정 > <
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6.5, -10.5); ctx.lineTo(-3.5, -9); ctx.lineTo(-6.5, -7.5);
    ctx.moveTo(6.5, -10.5); ctx.lineTo(3.5, -9); ctx.lineTo(6.5, -7.5);
    ctx.stroke();
    circle(ctx, 0, -5, 1.6, INK); // 작은 "오" 입
  } else {
    eyes(ctx, 4.5, -9, 1.9);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-1.1, -6, 1.1, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.arc(1.1, -6, 1.1, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  blush(ctx, 8, -5.5, 2.4);

  // 머리 소품
  ACCESSORY[(slot - 1) % 4](ctx, t);
  ctx.restore();
}

const ACCESSORY = [
  // 1P 솜솜: 이마 위 작은 조종사 고글
  (ctx) => {
    ctx.fillStyle = '#8a5a3c';
    rrect(ctx, -10, -17.5, 20, 3, 1.5);
    ctx.fill();
    for (const x of [-4.2, 4.2]) {
      circle(ctx, x, -17, 3.9, '#5b6b84');
      circle(ctx, x, -17, 2.8, '#d9f3ff');
      circle(ctx, x - 0.9, -17.9, 0.9, '#ffffff');
    }
  },
  // 2P 딸콩: 딸기 꼭지 모자 (초록 잎 + 꼭지)
  (ctx) => {
    ctx.save();
    ctx.translate(0, -16.5);
    ctx.fillStyle = '#4caf50';
    starPath(ctx, 6.5, 0.42, 5);
    ctx.fill();
    ctx.restore();
    line(ctx, 0, -18, 0.8, -22.5, 1.8, '#3b8f3f');
  },
  // 3P 완두: 새싹 두 장 (살랑살랑)
  (ctx, t) => {
    const sway = Math.sin(t * 4) * 0.15;
    line(ctx, 0, -16, 0, -21, 1.6, '#3f9a4b');
    ctx.save();
    ctx.translate(0, -21);
    ctx.rotate(sway);
    ellipse(ctx, -3.8, -1.2, 4.2, 2.3, '#55b85f', 0.45);
    ellipse(ctx, 3.8, -1.2, 4.2, 2.3, '#55b85f', -0.45);
    ctx.restore();
  },
  // 4P 레몽: 레몬 조각 머리핀 (오른쪽 위)
  (ctx) => {
    ctx.save();
    ctx.translate(7.5, -14);
    ctx.rotate(0.5);
    ctx.fillStyle = '#f5c518';
    ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff6c2';
    ctx.beginPath(); ctx.arc(0, 0, 3.8, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f5c518';
    ctx.lineWidth = 0.8;
    for (const a of [1.25, 1.5, 1.75]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a * Math.PI) * 3.8, Math.sin(a * Math.PI) * 3.8); ctx.stroke();
    }
    ctx.restore();
  },
];

// 피격 판정 점 (배 아래쪽의 작은 빛). 판정 크기는 rules.js PLAYER.HITBOX_R
export function drawHitDot(ctx, r) {
  circle(ctx, 0, 0, r + 1, 'rgba(255,90,140,0.85)');
  circle(ctx, 0, 0, r - 0.6, '#ffffff');
}

// HUD 목숨 아이콘: 작은 얼굴
export function drawPlayerIcon(ctx, slot) {
  const ch = playerChar(slot);
  circle(ctx, 0, 0, 6.6, ch.shade);
  circle(ctx, 0, 0, 5.6, ch.body);
  circle(ctx, -2, -0.6, 0.9, INK);
  circle(ctx, 2, -0.6, 0.9, INK);
  ellipse(ctx, -3.6, 1.5, 1.3, 0.8, BLUSH);
  ellipse(ctx, 3.6, 1.5, 1.3, 0.8, BLUSH);
}

// ------------------------------------------------------------ 적 (심술 과자단)
// o.t: 시간(초) / o.flash: 맞아서 번쩍
export function drawEnemy(ctx, kind, o = {}) {
  FLASH = Boolean(o.flash);
  ctx.save();
  (ENEMY_DRAW[kind] || ENEMY_DRAW.jelly)(ctx, o.t || 0);
  ctx.restore();
  FLASH = false;
}

const ENEMY_DRAW = {
  // 젤리콩: 말랑한 젤리 방울 (출렁출렁)
  jelly(ctx, t) {
    const w = Math.sin(t * 9) * 0.07;
    ctx.scale(1 + w, 1 - w);
    ctx.fillStyle = col('#9b6dff');
    ctx.beginPath();
    ctx.moveTo(-12, 8);
    ctx.bezierCurveTo(-14, -4, -8, -13, 0, -13);
    ctx.bezierCurveTo(8, -13, 14, -4, 12, 8);
    ctx.quadraticCurveTo(0, 12, -12, 8);
    ctx.fill();
    ctx.fillStyle = col('#c1a3ff');
    ctx.beginPath();
    ctx.ellipse(-4.5, -7, 4, 2.4, -0.5, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(0, 1);
    grumpyFace(ctx, 1);
    ctx.restore();
  },

  // 심술 마카롱: 납작한 마카롱 (위 껍질 + 크림 + 아래 껍질)
  macaron(ctx, t) {
    const bob = Math.sin(t * 5) * 0.8;
    ctx.translate(0, bob);
    ellipse(ctx, 0, 6, 15, 6, col('#e57aa6'));
    ellipse(ctx, 0, 3.5, 14.5, 3.2, col('#fff3e3'));
    // 크림 물결
    ctx.fillStyle = col('#fff3e3');
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 4.2, 5.5, 1.8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col('#ff9cc5');
    ctx.beginPath();
    ctx.ellipse(0, -1, 15, 9, 0, Math.PI, 0);
    ctx.lineTo(15, 1.5);
    ctx.quadraticCurveTo(0, 4, -15, 1.5);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, -6, -6.5, 4, 1.6, col('#ffc3dc'), -0.2);
    ctx.save();
    ctx.translate(0, -3.5);
    grumpyFace(ctx, 0.85);
    ctx.restore();
  },

  // 사탕벌: 동그란 사탕 몸 + 막대사탕 날개
  candyBee(ctx, t) {
    const flap = Math.sin(t * 30) * 0.35;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 8, -5);
      ctx.rotate(side * (0.7 + flap));
      line(ctx, 0, 0, 0, -9, 1.6, col('#f4efe6'));
      circle(ctx, 0, -12, 5, col('#7fd6ff'));
      if (!FLASH) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, -12, 2.6, 0, Math.PI * 1.4); ctx.stroke();
      }
      ctx.restore();
    }
    circle(ctx, 0, 0, 11, col('#ffcf3f'));
    // 줄무늬 (사탕 포장)
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.clip();
    ctx.fillStyle = col('#ff8a3d');
    ctx.fillRect(-12, 3, 24, 3);
    ctx.fillRect(-12, 8, 24, 3);
    ctx.restore();
    line(ctx, 0, 11, 0, 15, 2, col('#ff8a3d')); // 작은 침 대신 사탕 꼭지
    ctx.save();
    ctx.translate(0, -3);
    grumpyFace(ctx, 0.85);
    ctx.restore();
  },

  // 쿠키 탱크: 바퀴 달린 큰 쿠키
  cookieTank(ctx, t) {
    const roll = t * 4;
    for (const x of [-15, 15]) {
      circle(ctx, x, 17, 6.5, col('#5a4636'));
      circle(ctx, x, 17, 2.5, col('#b9a48e'));
      if (!FLASH) line(ctx, x + Math.cos(roll) * 5, 17 + Math.sin(roll) * 5, x - Math.cos(roll) * 5, 17 - Math.sin(roll) * 5, 1.2, '#8c7663');
    }
    circle(ctx, 0, 0, 23, col('#c98b4e'));
    circle(ctx, 0, 0, 21, col('#e2a868'));
    // 초코칩
    for (const [x, y, r] of [[-13, -8, 2.6], [12, -10, 2.2], [-15, 7, 2.2], [14, 8, 2.6], [-3, -16, 2], [5, 15, 2]]) {
      ellipse(ctx, x, y, r, r * 0.8, col('#6b3f22'), x * 0.1);
    }
    // 머리 위 작은 포신 (아래로 3방향 탄을 쏘므로 아래쪽에)
    ctx.fillStyle = col('#7a5b42');
    rrect(ctx, -4, 18, 8, 8, 2);
    ctx.fill();
    grumpyFace(ctx, 1.5);
  },

  // 도넛 포대: 분홍 도넛, 가운데 구멍에서 발사, 스프링클이 빙글빙글
  donutTurret(ctx, t) {
    circle(ctx, 0, 0, 22, col('#d79a5a'));
    ctx.fillStyle = col('#ff9ccf');
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      const r = 19 + Math.sin(i * 2.7) * 1.6;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(r, 0);
    }
    ctx.closePath();
    ctx.fill();
    // 스프링클
    if (!FLASH) {
      const colors = ['#ffffff', '#7fd6ff', '#ffe066', '#9bea7a'];
      for (let i = 0; i < 12; i++) {
        const a = t * 1.5 + (i / 12) * TAU;
        const r = 14 + (i % 2) * 2;
        ctx.save();
        ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
        ctx.rotate(a + i);
        ctx.fillStyle = colors[i % 4];
        rrect(ctx, -2, -0.7, 4, 1.4, 0.7);
        ctx.fill();
        ctx.restore();
      }
    }
    // 가운데 구멍 = 포구
    circle(ctx, 0, 0, 8, col('#4a2e3a'));
    circle(ctx, 0, 0, 5, col('#2c1a24'));
    // 얼굴은 도넛 윗부분에
    ctx.save();
    ctx.translate(0, -13.5);
    grumpyFace(ctx, 0.7);
    ctx.restore();
  },
};

// ------------------------------------------------------------ 보스
// o.t: 시간 / o.flash: 번쩍 / o.phase: 단계 (높을수록 화남)
// o.spin: 문어 다리 회전 / o.parts: 와플 거북선 포대 [{dx, dy, r, dead, hitT}]
export function drawBoss(ctx, kind, o = {}) {
  FLASH = Boolean(o.flash);
  ctx.save();
  (BOSS_DRAW[kind] || BOSS_DRAW.pudding)(ctx, o.t || 0, o.phase || 1, o);
  ctx.restore();
  FLASH = false;
}

// 화가 나면 머리 위에서 김이 폴폴 (보스 공통)
function steam(ctx, t, y, spread = 22) {
  if (FLASH) return;
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.2 + i / 3) % 1;
    ctx.globalAlpha = 0.8 * (1 - k);
    circle(ctx, (i - 1) * spread + Math.sin(t * 3 + i) * 3, y - k * 22, 4 + k * 5, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

function bolt(ctx, x, y, s, color) { // 작은 번개 모양
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 6 * s);
  ctx.lineTo(x - 3 * s, y + 1 * s);
  ctx.lineTo(x, y + 1 * s);
  ctx.lineTo(x - 1.5 * s, y + 7 * s);
  ctx.lineTo(x + 3.5 * s, y - 1 * s);
  ctx.lineTo(x + 0.5 * s, y - 1 * s);
  ctx.closePath();
  ctx.fill();
}

const BOSS_DRAW = {
  // 푸딩 대장: 출렁이는 커스터드 푸딩 + 캐러멜 + 작은 대장 모자
  pudding(ctx, t, phase) {
    const j = Math.sin(t * (phase === 2 ? 9 : 6)) * 0.05;
    // 접시
    ellipse(ctx, 0, 38, 58, 9, col('#c9d3e6'));
    ellipse(ctx, 0, 36, 52, 6.5, col('#eef3fb'));
    ctx.save();
    ctx.translate(0, 36);
    ctx.scale(1 + j, 1 - j); // 아래를 기준으로 출렁
    ctx.translate(0, -36);
    // 커스터드 몸
    ctx.fillStyle = col('#ffd27a');
    ctx.beginPath();
    ctx.moveTo(-48, 34);
    ctx.bezierCurveTo(-46, 10, -40, -18, -34, -26);
    ctx.lineTo(34, -26);
    ctx.bezierCurveTo(40, -18, 46, 10, 48, 34);
    ctx.quadraticCurveTo(0, 40, -48, 34);
    ctx.fill();
    ctx.fillStyle = col('#ffe3a3');
    ctx.beginPath();
    ctx.ellipse(-26, 4, 6, 18, 0.15, 0, TAU);
    ctx.fill();
    // 캐러멜 (흘러내림)
    ctx.fillStyle = col('#b0602a');
    ctx.beginPath();
    ctx.moveTo(-35, -26);
    ctx.lineTo(35, -26);
    ctx.lineTo(37.5, -16);
    ctx.quadraticCurveTo(0, -11, -37.5, -16);
    ctx.closePath();
    ctx.fill();
    for (const [x, len] of [[-28, 10], [-15, 16], [-2, 8], [12, 14], [26, 9]]) { // 흘러내린 방울
      rrect(ctx, x - 3.2, -18, 6.4, len, 3.2);
      ctx.fill();
    }
    ellipse(ctx, 0, -26, 35, 6, col('#8f4a1d'));
    ellipse(ctx, -12, -27, 10, 2, col('#c97b40'));
    // 대장 모자
    ctx.fillStyle = col('#2f3f7a');
    rrect(ctx, -16, -42, 32, 14, 5);
    ctx.fill();
    ellipse(ctx, 0, -29, 21, 4, col('#243266'));
    ctx.save();
    ctx.translate(0, -36);
    ctx.fillStyle = col('#ffd84d');
    starPath(ctx, 4.5);
    ctx.fill();
    ctx.restore();
    // 얼굴
    ctx.save();
    ctx.translate(0, 6);
    grumpyFace(ctx, 2.6, phase === 2 ? 1.8 : 1);
    ctx.restore();
    ctx.restore();
    // 2단계: 머리에서 김이 폴폴 (화났어요)
    if (phase === 2) steam(ctx, t, -40);
  },

  // 문어 사탕왕: 사탕 머리 + 줄무늬 사탕 다리 8개(회전) + 작은 왕관
  octopus(ctx, t, phase, o) {
    const spin = o.spin || 0;
    for (let i = 0; i < 8; i++) {
      const a = spin + (i * Math.PI) / 4;
      ctx.save();
      ctx.rotate(a);
      // 꼬불꼬불 다리 (분홍 + 흰 줄무늬)
      ctx.lineCap = 'round';
      ctx.strokeStyle = col(i % 2 ? '#ff7fb6' : '#b27dff');
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      const wig = Math.sin(t * 6 + i) * 5;
      ctx.quadraticCurveTo(30, wig, 42, wig * 0.4);
      ctx.stroke();
      if (!FLASH) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      circle(ctx, 43, wig * 0.4, 5, col('#ffe066')); // 다리 끝 사탕 (여기서 탄이 나감)
      ctx.restore();
    }
    // 머리
    circle(ctx, 0, -4, 31, col('#c45ea8'));
    circle(ctx, 0, -6, 29, col('#e57ec4'));
    // 소용돌이 사탕 무늬
    if (!FLASH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k < 40; k++) {
        const a = k * 0.35 + t;
        const r = 3 + k * 0.5;
        const x = Math.cos(a) * r;
        const y = -18 + Math.sin(a) * r * 0.5;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // 왕관
    ctx.fillStyle = col('#ffd84d');
    ctx.beginPath();
    ctx.moveTo(-13, -30); ctx.lineTo(-13, -42); ctx.lineTo(-6, -35); ctx.lineTo(0, -45);
    ctx.lineTo(6, -35); ctx.lineTo(13, -42); ctx.lineTo(13, -30);
    ctx.closePath();
    ctx.fill();
    circle(ctx, 0, -38, 2.4, col('#ff6fa8'));
    ctx.save();
    ctx.translate(0, 2);
    grumpyFace(ctx, 2.3, phase === 2 ? 1.8 : 1);
    ctx.restore();
    if (phase === 2) steam(ctx, t, -48);
  },

  // 와플 거북선: 와플 등껍질 + 포대 4개 + 아래쪽 머리
  waffleShip(ctx, t, phase, o) {
    // 지느러미
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 50, 18 + Math.sin(t * 4 + s) * 3, 14, 7, col('#8fcf6a'), s * 0.5);
    }
    // 머리 (플레이어 쪽)
    circle(ctx, 0, 40, 15, col('#9fdc78'));
    ctx.save();
    ctx.translate(0, 40);
    grumpyFace(ctx, 1.3, phase === 2 ? 1.8 : 1);
    ctx.restore();
    // 등껍질 = 와플
    ellipse(ctx, 0, 0, 52, 40, col('#c98b3a'));
    ellipse(ctx, 0, -2, 48, 36, col('#e6ad55'));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -2, 48, 36, 0, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = col('#c4862f');
    ctx.lineWidth = 3;
    for (let x = -48; x <= 48; x += 12) { ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x, 36); ctx.stroke(); }
    for (let y = -38; y <= 36; y += 12) { ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(50, y); ctx.stroke(); }
    ctx.restore();
    ellipse(ctx, -18, -20, 12, 5, 'rgba(255,255,255,0.25)', -0.3);
    // 포대 (부서지면 부스러기)
    for (const q of o.parts || []) {
      ctx.save();
      ctx.translate(q.dx, q.dy);
      if (q.dead) {
        for (const [x, y, r] of [[-4, 2, 3], [3, -2, 2.5], [2, 4, 2]]) circle(ctx, x, y, r, col('#8a5a2a'));
      } else {
        const keep = FLASH;
        if (q.hitT > 0) FLASH = true;
        circle(ctx, 0, 0, q.r, col('#fff1d6'));
        circle(ctx, 0, 0, q.r - 3, col('#f7c6d9'));
        ctx.fillStyle = col('#6b4a3a');
        rrect(ctx, -3, 2, 6, 11, 2);
        ctx.fill();
        circle(ctx, 0, 0, 3, col('#6b4a3a'));
        FLASH = keep;
      }
      ctx.restore();
    }
    if (phase === 2) steam(ctx, t, -42, 26);
  },

  // 번개 솜사탕: 몽실한 솜사탕 구름 + 막대 + 주위에 작은 번개
  cottonStorm(ctx, t, phase) {
    const angry = phase === 2;
    const puffs = [[0, -8, 26], [-24, 0, 18], [24, 0, 18], [-14, -24, 16], [14, -24, 16], [-10, 12, 16], [10, 12, 16]];
    const c1 = angry ? '#b9a3d9' : '#ffc4e1';
    const c2 = angry ? '#8f7fb8' : '#a8dcff';
    line(ctx, 0, 20, 0, 48, 5, col('#f4e6c8')); // 막대
    for (const [x, y, r] of puffs) circle(ctx, x, y + Math.sin(t * 3 + x) * 1.5, r + 2, col(c2));
    for (const [x, y, r] of puffs) circle(ctx, x * 0.95, y - 1 + Math.sin(t * 3 + x) * 1.5, r, col(c1));
    ellipse(ctx, -12, -26, 9, 4, 'rgba(255,255,255,0.5)', -0.3);
    grumpyFace(ctx, 2.4, angry ? 1.8 : 1);
    // 빙글 도는 작은 번개
    if (!FLASH) {
      for (let i = 0; i < 4; i++) {
        const a = t * 1.5 + (i * Math.PI) / 2;
        bolt(ctx, Math.cos(a) * 48, Math.sin(a) * 34 - 4, 1.3, (Math.floor(t * 6) + i) % 2 ? '#fff27a' : '#ffd84d');
      }
    }
  },

  // 케이크 대마왕: 3단 케이크. 단계가 오를수록 위에서부터 한 단씩 없어짐
  cakeKing(ctx, t, phase) {
    const tiers = [ // 아래 → 위 [y, w, h, 몸 색, 크림 색]
      [26, 104, 30, '#8a5a3c', '#fff3e3'],
      [-2, 80, 28, '#ff9cc5', '#ffffff'],
      [-28, 56, 26, '#fff3e3', '#ff9cc5'],
    ];
    const left = Math.max(1, 4 - phase);
    const wob = Math.sin(t * (2 + phase * 2)) * 0.03;
    ctx.save();
    ctx.scale(1 + wob, 1 - wob);
    ellipse(ctx, 0, 42, 62, 8, col('#c9d3e6')); // 접시
    for (let i = 0; i < left; i++) {
      const [y, w, h, body, cream] = tiers[i];
      ctx.fillStyle = col(body);
      rrect(ctx, -w / 2, y - h / 2, w, h, 6);
      ctx.fill();
      // 크림 물결
      ctx.fillStyle = col(cream);
      ctx.beginPath();
      ctx.moveTo(-w / 2, y - h / 2 + 2);
      for (let x = -w / 2; x <= w / 2; x += 8) ctx.arc(x + 4, y - h / 2 + 2, 4, Math.PI, 0, true);
      ctx.lineTo(w / 2, y - h / 2 - 2);
      ctx.lineTo(-w / 2, y - h / 2 - 2);
      ctx.closePath();
      ctx.fill();
      // 딸기 장식
      if (!FLASH) for (let x = -w / 2 + 10; x < w / 2 - 4; x += 18) circle(ctx, x, y + 4, 3, '#ff5b6e');
    }
    // 맨 위 단에 얼굴 + 촛불 왕관
    const [ty, tw, th] = tiers[left - 1];
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = col('#7fd6ff');
      rrect(ctx, i * 12 - 2.5, ty - th / 2 - 16, 5, 13, 2);
      ctx.fill();
      ellipse(ctx, i * 12, ty - th / 2 - 19 + Math.sin(t * 10 + i) * 0.8, 2.5, 4, col('#ffb347'));
    }
    ctx.save();
    ctx.translate(0, ty + 1);
    grumpyFace(ctx, Math.min(2.2, tw / 30), 1 + (phase - 1) * 0.6);
    ctx.restore();
    ctx.restore();
    if (phase >= 2) steam(ctx, t, ty - th / 2 - 26, 20);
  },
};

// 엔딩용 과자성 (케이크 탑 + 깃발)
export function drawCastle(ctx, t = 0) {
  const towers = [[-70, 70, '#ff9cc5'], [70, 70, '#ff9cc5'], [-35, 100, '#fff3e3'], [35, 100, '#fff3e3'], [0, 130, '#ffd27a']];
  for (const [x, h, c] of towers) {
    ctx.fillStyle = c;
    rrect(ctx, x - 20, -h, 40, h, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let k = -20; k < 20; k += 8) { ctx.beginPath(); ctx.arc(x + k + 4, -h + 2, 4, Math.PI, 0, true); ctx.fill(); }
    circle(ctx, x, -h - 6, 5, '#ff5b6e'); // 딸기 지붕
    line(ctx, x, -h - 10, x, -h - 28, 2, '#8a5a3c');
    ctx.fillStyle = PLAYER_CHARS[Math.abs(Math.round(x / 35)) % 4].body;
    ctx.beginPath();
    const wave = Math.sin(t * 5 + x) * 3;
    ctx.moveTo(x, -h - 28); ctx.lineTo(x + 16, -h - 23 + wave); ctx.lineTo(x, -h - 18);
    ctx.closePath();
    ctx.fill();
    // 창문
    circle(ctx, x, -h / 2, 6, '#ffe9a8');
  }
  ctx.fillStyle = '#8a5a3c';
  rrect(ctx, -14, -34, 28, 34, 12); // 성문
  ctx.fill();
}

// ------------------------------------------------------------ 총알·코인·효과
// 별 총알: 단계가 오를수록 색이 화려해짐 (개수는 rules.js의 발사 모양대로)
// 1~7단계 색, 8단계(최대)는 무지개
const STAR_COLOR = ['#fff3a0', '#ffd84d', '#ffb347', '#ff9fd0', '#c9a6ff', '#9ad8ff', '#9dff9d'];
export function starShotColor(power, t) {
  if (power > STAR_COLOR.length) return `hsl(${(t * 360) % 360}, 95%, 72%)`; // 무지개
  return STAR_COLOR[Math.max(0, power - 1)];
}
export function drawStarShot(ctx, power, t = 0) {
  ctx.save();
  ctx.rotate(t * 8);
  ctx.fillStyle = starShotColor(power, t);
  starPath(ctx, 5.5, 0.45);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

// 코인 (7단계부터 게임에 등장). 빙글빙글 도는 금화
export function drawCoin(ctx, t = 0) {
  const sx = Math.max(0.15, Math.abs(Math.cos(t * 4)));
  ctx.save();
  ctx.scale(sx, 1);
  circle(ctx, 0, 0, 7, '#d99a12');
  circle(ctx, 0, 0, 5.8, '#ffd23f');
  ctx.fillStyle = '#f2b51d';
  starPath(ctx, 3.4);
  ctx.fill();
  ctx.restore();
}

// 쓰러질 때 "뿅" 효과. k: 0(시작) ~ 1(끝)
export function drawPop(ctx, k, big = false) {
  const n = big ? 8 : 6;
  const R = (big ? 34 : 22) * (0.3 + k * 0.9);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  const colors = ['#ffe066', '#ffffff', '#ff9fd0', '#9ad8ff'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k;
    ctx.save();
    ctx.translate(Math.cos(a) * R, Math.sin(a) * R);
    ctx.rotate(k * 6 + i);
    ctx.fillStyle = colors[i % 4];
    starPath(ctx, (big ? 5 : 3.6) * (1 - k * 0.5));
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ff6fa8';
  ctx.lineWidth = 3;
  ctx.font = `900 ${big ? 18 : 13}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const y = -6 - k * 14;
  ctx.strokeText('뿅', 0, y);
  ctx.fillText('뿅', 0, y);
  ctx.restore();
}

// 폭탄 무지개 파동 색
export const RAINBOW = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
