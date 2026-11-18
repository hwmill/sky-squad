// 스테이지 1~5 묶음 (SPEC-v2 2·4장): 이름(배경 테마), 적 등장표, 보스 종류, 보스 등장 시각
import { STAGES } from './rules.js';
import { STAGE1_TIMELINE } from './stage1.js';
import { STAGE2_TIMELINE } from './stage2.js';
import { STAGE3_TIMELINE } from './stage3.js';
import { STAGE4_TIMELINE } from './stage4.js';
import { STAGE5_TIMELINE } from './stage5.js';

export const STAGE_LIST = [
  { no: 1, name: '맑은 하늘', theme: 'sky', boss: 'pudding', timeline: STAGE1_TIMELINE },
  { no: 2, name: '노을 구름', theme: 'sunset', boss: 'octopus', timeline: STAGE2_TIMELINE },
  { no: 3, name: '바다 위', theme: 'sea', boss: 'waffleShip', timeline: STAGE3_TIMELINE },
  { no: 4, name: '눈 내리는 산', theme: 'snow', boss: 'cottonStorm', timeline: STAGE4_TIMELINE },
  { no: 5, name: '밤하늘 과자성', theme: 'night', boss: 'cakeKing', timeline: STAGE5_TIMELINE },
].map((s, i) => ({ ...s, bossAt: STAGES.BOSS_AT[i] }));

// n번째 스테이지 정보 (1부터). 범위를 벗어나면 가까운 쪽
export const stageInfo = (n) => STAGE_LIST[Math.min(STAGE_LIST.length, Math.max(1, n)) - 1];
export const isLastStage = (n) => n >= STAGES.COUNT;
