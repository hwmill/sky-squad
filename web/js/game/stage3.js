// 스테이지 3: 바다 위 (약 3분) — 옆에서 들어오는 무리가 많고 도넛 포대 2대씩. 보스: 와플 거북선
import { makeTimeline } from './stage-kit.js';

const k = makeTimeline();

// 1. 도입: 좌우 교차
k.swoop(2, 1, 6);
k.swoop(5, -1, 6);
k.row(9, 's1', [60, 120, 180, 240, 300], 'down');
k.bees(12, [90, 270]);
k.swoop(15, 1, 7, 's2');
k.column(19, 's1', 180, 8, 0.3, 'sine');

// 2. 도넛 포대 둘
k.add(25, 'm2', 100, 'hover');
k.add(25, 'm2', 260, 'hover');
k.bees(30, [60, 180, 300], 0.4);
k.row(34, 's2', [80, 180, 280], 'down');
k.swoop(38, -1, 7);

// 3. 중형 행진
for (let i = 0; i < 3; i++) k.add(46 + i * 4, 'm1', 80 + i * 100, 'hover');
k.column(50, 's1', 60, 6, 0.35, 'sine');
k.column(52, 's1', 300, 6, 0.35, 'sine');
k.bees(58, [100, 200, 260], 0.3);
for (let i = 0; i < 4; i++) k.row(62 + i * 2, 's2', [60 + i * 30, 300 - i * 30], 'down');

// 4. 중반: 1UP
k.swoop(72, 1, 8);
k.swoop(74, -1, 8);
k.add(80, 'm1', 180, 'hover', { drop: '1UP' });
k.bees(84, [50, 130, 230, 310], 0.25);
k.add(90, 'm2', 180, 'hover');
k.row(95, 's1', [40, 100, 160, 220, 280, 320], 'down');
k.row(98, 's2', [90, 270], 'down');

// 5. 후반: 밀도 높게
for (let i = 0; i < 6; i++) k.swoop(106 + i * 2.5, i % 2 ? -1 : 1, 6, i % 3 === 2 ? 's2' : 's1');
k.add(112, 'm2', 90, 'hover');
k.add(116, 'm2', 270, 'hover');
k.bees(124, [60, 120, 180, 240, 300], 0.2);
k.add(132, 'm1', 180, 'hover');
for (let i = 0; i < 5; i++) k.row(136 + i * 2, 's2', [50 + i * 25, 310 - i * 25], 'down');
k.column(148, 's1', 120, 8, 0.28, 'sine');
k.column(149, 's1', 240, 8, 0.28, 'sine');
k.bees(158, [80, 280], 0.4);
k.row(163, 's2', [100, 180, 260], 'down');

export const STAGE3_TIMELINE = k.done();
