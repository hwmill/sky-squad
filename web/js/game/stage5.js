// 스테이지 5: 밤하늘 과자성 (약 3분) — 지금까지 나온 적이 모두, 가장 빽빽. 보스: 케이크 대마왕
import { makeTimeline } from './stage-kit.js';

const k = makeTimeline();

// 1. 성문 앞
k.row(2, 's1', [60, 120, 180, 240, 300], 'down');
k.bees(5, [90, 270], 0.3);
k.swoop(8, 1, 7);
k.swoop(9, -1, 7);
k.add(14, 'm1', 180, 'hover');
k.row(17, 's2', [70, 290], 'down');
k.bees(20, [60, 140, 220, 300], 0.25);

// 2. 포대 둘 + 사격형
k.add(26, 'm2', 100, 'hover');
k.add(26, 'm2', 260, 'hover');
for (let i = 0; i < 5; i++) k.row(30 + i * 2, 's2', [60 + i * 20, 300 - i * 20], 'down');
k.column(36, 's1', 180, 10, 0.25, 'sine');
k.bees(42, [50, 130, 230, 310], 0.2);

// 3. 중형 셋
k.add(48, 'm1', 70, 'hover');
k.add(50, 'm2', 180, 'hover');
k.add(52, 'm1', 290, 'hover');
for (let i = 0; i < 4; i++) k.swoop(56 + i * 2.5, i % 2 ? -1 : 1, 6, i % 2 ? 's2' : 's1');
k.bees(68, [70, 150, 210, 290], 0.3);

// 4. 중반: 1UP
k.row(74, 's1', [40, 100, 160, 220, 280, 320], 'down');
k.row(76, 's2', [70, 180, 290], 'down');
k.add(82, 'm2', 180, 'hover', { drop: '1UP' });
k.bees(88, [60, 300], 0.15);
k.bees(91, [120, 240], 0.15);
k.column(94, 's1', 90, 8, 0.28, 'sine');
k.column(95, 's1', 270, 8, 0.28, 'sine');
k.add(102, 'm1', 120, 'hover');
k.add(104, 'm1', 240, 'hover');

// 5. 후반: 총공격
for (let i = 0; i < 6; i++) k.row(110 + i * 1.8, 's2', [50 + (i % 3) * 40, 180, 310 - (i % 3) * 40], 'down');
k.add(116, 'm2', 90, 'hover');
k.add(118, 'm2', 270, 'hover');
for (let i = 0; i < 6; i++) k.swoop(124 + i * 2, i % 2 ? -1 : 1, 6);
k.bees(132, [50, 110, 170, 230, 290], 0.2);
k.add(140, 'm1', 180, 'hover');
for (let i = 0; i < 4; i++) k.bees(144 + i * 2.5, [80 + i * 60]);
k.row(156, 's2', [60, 120, 240, 300], 'down');
k.column(160, 's1', 120, 8, 0.28, 'sine');
k.column(161, 's1', 240, 8, 0.28, 'sine');
k.row(170, 's2', [90, 180, 270], 'down');

export const STAGE5_TIMELINE = k.done();
