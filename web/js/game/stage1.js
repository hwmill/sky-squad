// 스테이지 1 적 등장표 (약 3분). 보스 등장 시각은 rules.js의 STAGE1.BOSS_AT
// 한 줄 = { t: 등장 시각(초), type: s1|s2|m1, x, pattern: down|sine|diag|hover, dir, drop }
//   s1 소형(사격 없음), s2 소형(조준 사격), m1 중형(머무르며 부채꼴 사격, 처치 시 아이템)
import { VIEW } from './rules.js';

const L = [];
const add = (t, type, x, pattern, extra = {}) => L.push({ t: Math.round(t * 100) / 100, type, x, pattern, ...extra });
// 같은 자리에서 n마리가 gap초 간격으로
const column = (t, type, x, n, gap, pattern, extra) => { for (let i = 0; i < n; i++) add(t + i * gap, type, x, pattern, extra); };
// 여러 자리에서 동시에
const row = (t, type, xs, pattern, extra) => { for (const x of xs) add(t, type, x, pattern, extra); };
// 화면 위 모서리에서 대각선으로 가로지르기 (dir 1: 왼쪽→오른쪽)
const swoop = (t, dir, n) => column(t, 's1', dir > 0 ? -20 : VIEW.W + 20, n, 0.35, 'diag', { dir });

// 1. 도입 (2~20초): 소형만
column(2, 's1', 90, 5, 0.45, 'down');
column(5, 's1', 270, 5, 0.45, 'down');
column(9, 's1', 180, 6, 0.4, 'sine');
row(14, 's1', [60, 120, 180, 240, 300], 'down');
column(16, 's1', 100, 5, 0.4, 'sine');
column(17, 's1', 260, 5, 0.4, 'sine');

// 2. 측면 + 첫 중형 (20~45초)
swoop(21, 1, 6);
swoop(24, -1, 6);
add(28, 'm1', 180, 'hover');
row(31, 's2', [80, 280], 'down');
row(34, 's2', [130, 230], 'down');
swoop(37, 1, 6);
swoop(38.5, -1, 6);
row(42, 's1', [40, 100, 160, 220, 280, 320], 'down');

// 3. 사격하는 소형 (45~70초)
for (let i = 0; i < 5; i++) row(46 + i * 2.2, 's2', [70 + (i % 2) * 40, 290 - (i % 2) * 40], 'down');
add(52, 'm1', 90, 'hover');
add(56, 'm1', 270, 'hover');
column(60, 's1', 180, 8, 0.3, 'sine');
swoop(64, 1, 5);
swoop(64, -1, 5);

// 4. 중반 (70~110초): 1UP 중형 포함
row(70, 's1', [50, 130, 230, 310], 'down');
row(72, 's1', [90, 180, 270], 'down');
add(78, 'm1', 180, 'hover');
for (let i = 0; i < 4; i++) row(82 + i * 3, 's2', [60, 180, 300], 'down');
swoop(86, 1, 7);
swoop(90, -1, 7);
add(96, 'm1', 180, 'hover', { drop: '1UP' });
column(100, 's1', 70, 6, 0.35, 'sine');
column(100, 's1', 290, 6, 0.35, 'sine');
row(105, 's2', [100, 180, 260], 'down');

// 5. 후반 (110~165초): 밀도 높게
add(112, 'm1', 100, 'hover');
add(114, 'm1', 260, 'hover');
for (let i = 0; i < 6; i++) swoop(118 + i * 2.5, i % 2 ? -1 : 1, 5);
for (let i = 0; i < 5; i++) row(126 + i * 2, 's2', [50 + i * 20, 310 - i * 20], 'down');
add(136, 'm1', 180, 'hover');
column(140, 's1', 120, 8, 0.3, 'sine');
column(141, 's1', 240, 8, 0.3, 'sine');
add(148, 'm1', 80, 'hover');
add(150, 'm1', 280, 'hover');
for (let i = 0; i < 4; i++) row(154 + i * 2.5, 's1', [40, 110, 180, 250, 320], 'down');
row(160, 's2', [90, 180, 270], 'down');

export const STAGE1_TIMELINE = L.sort((a, b) => a.t - b.t);
