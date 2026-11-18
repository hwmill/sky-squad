// 스테이지 2: 노을 구름 (약 3분) — 사탕벌·도넛 포대를 처음 소개 (아이도 목숨 3개로 깰 수 있게 순하게). 보스: 문어 사탕왕
import { makeTimeline } from './stage-kit.js';

const k = makeTimeline();

// 1. 도입: 소형 + 사탕벌 맛보기
k.column(2, 's1', 120, 5, 0.4, 'sine');
k.column(4, 's1', 240, 5, 0.4, 'sine');
k.bees(9, [80, 280]);
k.row(13, 's1', [60, 150, 210, 300], 'down');
k.bees(16, [120, 240]);
k.swoop(19, 1, 6);

// 2. 사격형 + 중형
k.add(24, 'm1', 180, 'hover');
k.row(27, 's2', [70, 290], 'down');
k.bees(30, [60, 180, 300]);
k.swoop(33, -1, 6);
k.row(36, 's2', [120, 240], 'down');
k.column(40, 's1', 90, 6, 0.35, 'sine');
k.column(40, 's1', 270, 6, 0.35, 'sine');

// 3. 도넛 포대 첫 등장
k.add(48, 'm2', 180, 'hover');
k.bees(52, [50, 310], 0.5);
k.row(56, 's1', [40, 100, 160, 220, 280, 320], 'down');
k.add(62, 'm1', 90, 'hover');
k.add(64, 'm1', 270, 'hover');
for (let i = 0; i < 4; i++) k.row(68 + i * 2.2, 's2', [80 + i * 15, 280 - i * 15], 'down');

// 4. 중반: 1UP 중형
k.swoop(78, 1, 7);
k.swoop(81, -1, 7);
k.bees(85, [90, 270], 0.4); // 10단계: 4마리 → 2마리
k.add(92, 'm1', 180, 'hover', { drop: '1UP' });
k.column(96, 's1', 120, 7, 0.3, 'sine');
k.column(97, 's1', 240, 7, 0.3, 'sine');
k.row(104, 's2', [90, 180, 270], 'down');

// 5. 후반
k.add(110, 'm1', 100, 'hover'); // 10단계: 도넛 포대는 48초 1대만
k.add(113, 'm1', 260, 'hover');
for (let i = 0; i < 3; i++) k.bees(118 + i * 4, [80 + i * 100]); // 10단계: 5 → 3
for (let i = 0; i < 4; i++) k.swoop(122 + i * 3, i % 2 ? -1 : 1, 5);
k.row(136, 's2', [60, 140, 220, 300], 'down');
k.add(142, 'm1', 180, 'hover');
k.bees(148, [100, 260], 0.4); // 10단계: 4 → 2
k.column(152, 's1', 100, 8, 0.3, 'sine');
k.column(153, 's1', 260, 8, 0.3, 'sine');
k.row(162, 's2', [100, 180, 260], 'down');

export const STAGE2_TIMELINE = k.done();
