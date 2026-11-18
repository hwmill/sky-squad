// 스테이지 4: 눈 내리는 산 (약 3분) — 사탕벌 돌진이 많고 사격형이 빽빽. 보스: 번개 솜사탕
import { makeTimeline } from './stage-kit.js';

const k = makeTimeline();

// 1. 도입
k.bees(2, [90, 180, 270], 0.4);
k.column(5, 's1', 100, 6, 0.35, 'sine');
k.column(6, 's1', 260, 6, 0.35, 'sine');
k.row(11, 's2', [70, 180, 290], 'down');
k.bees(15, [60, 140, 220, 300], 0.25);
k.swoop(19, 1, 7);
k.swoop(20, -1, 7);

// 2. 중형 + 사격형
k.add(26, 'm1', 120, 'hover');
k.add(28, 'm2', 240, 'hover');
for (let i = 0; i < 5; i++) k.row(31 + i * 1.8, 's2', [60 + (i % 2) * 40, 300 - (i % 2) * 40], 'down');
k.bees(42, [50, 310], 0.2);
k.bees(45, [120, 240], 0.2);

// 3. 눈보라 (소형 대량)
for (let i = 0; i < 5; i++) k.row(50 + i * 2, 's1', [40 + i * 10, 110 + i * 10, 180, 250 - i * 10, 320 - i * 10], 'down');
k.add(58, 'm2', 180, 'hover');
k.swoop(62, 1, 8, 's2');
k.bees(66, [70, 150, 210, 290], 0.3);

// 4. 중반: 1UP
k.add(74, 'm1', 90, 'hover');
k.add(76, 'm1', 270, 'hover', { drop: '1UP' });
k.column(80, 's1', 180, 10, 0.25, 'sine');
k.bees(86, [60, 300], 0.15);
k.row(90, 's2', [60, 120, 240, 300], 'down');
k.add(96, 'm2', 100, 'hover');
k.add(98, 'm2', 260, 'hover');

// 5. 후반
for (let i = 0; i < 6; i++) k.bees(106 + i * 2.2, [60 + ((i * 53) % 240)]);
for (let i = 0; i < 4; i++) k.swoop(110 + i * 3, i % 2 ? -1 : 1, 6, 's2');
k.add(124, 'm1', 180, 'hover');
for (let i = 0; i < 5; i++) k.row(128 + i * 2, 's2', [50 + i * 20, 180, 310 - i * 20], 'down');
k.add(140, 'm2', 90, 'hover');
k.add(142, 'm2', 270, 'hover');
k.bees(150, [60, 120, 180, 240, 300], 0.2);
k.column(156, 's1', 100, 8, 0.28, 'sine');
k.column(157, 's1', 260, 8, 0.28, 'sine');
k.row(166, 's2', [90, 180, 270], 'down');

export const STAGE4_TIMELINE = k.done();
