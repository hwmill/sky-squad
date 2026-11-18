// 게임 규칙 숫자 (SPEC.md 6장). 규칙 숫자는 이 파일에만 둔다.
// 단위: 거리 = 논리 픽셀(360×640 세로 화면 기준), 시간 = 초, 속도 = 픽셀/초, 각도 = 도

export const VIEW = { W: 360, H: 640 };

// 고정 60Hz 계산. 한 화면 그리기 사이에 최대 5번까지 따라잡기
export const TICK = { HZ: 60, DT: 1 / 60, MAX_STEPS_PER_FRAME: 5 };

export const DISPLAY = { MAX_DPR: 2, HUD_H: 36 };

export const PLAYER = {
  START_LIVES: 3,
  START_BOMBS: 3,
  START_POWER: 1,
  MAX_LIVES: 5,
  MAX_BOMBS: 5,
  MIN_POWER: 1,
  MAX_POWER: 8,            // 2026-11-18 사용자 결정: 4단계 → 8단계
  RESPAWN_BOMBS: 3,        // 피격 후 폭탄을 이 개수까지 충전 (더 많으면 그대로)
  HIT_INVULN: 3,           // 피격·이어하기 후 무적 시간
  HITBOX_R: 4,             // 피격 판정 반지름 (그림보다 훨씬 작게)
  BODY_R: 12,              // 적 몸체와 부딪히는 판정
  PICKUP_R: 22,            // 아이템 줍는 반지름
  EDGE: 14,                // 화면 가장자리 여백
  RESPAWN_FROM_BOTTOM: 90, // 시작·부활 위치: 하단 중앙에서 이만큼 위
  BLINK_HZ: 12,            // 무적 깜박임 속도
  KEY_SPEED: 260,          // PC 키보드로 움직일 때 속도 (개발 확인용)
  SLOT_SPREAD: [0, -60, 60, -120], // 같이 할 때 시작 위치 옆 간격 (1P 가운데, 2P 왼쪽, 3P 오른쪽, 4P 더 왼쪽)
};

// 같이 하기 통신 (CLAUDE.md 규칙 8: 스냅샷 초당 15회, 입력 초당 10회를 넘기지 않음)
export const NETPLAY = {
  SNAPSHOT_HZ: 15,
  INPUT_HZ: 10,
  INTERP_DELAY_MS: 100, // 게스트 화면은 이만큼 과거를 두 스냅샷 사이로 보간해서 그림
  BUFFER: 4,            // 보관할 스냅샷 수
  GUEST_HOLD_MS: 15000, // 게스트가 끊겨도 자리를 지켜 주는 시간 (서버와 같은 값)
  HOST_HOLD_MS: 30000,  // 방장이 끊기거나 앱을 내렸을 때 기다리는 시간 (서버와 같은 값)
  STALE_MS: 3000,       // 게스트: 이 시간 동안 상태가 안 오면 연결이 끊긴 것으로 보고 다시 연결
};

export const BOMB = { DAMAGE: 50, INVULN: 2, DURATION: 2 };

export const SHOT = {
  RATE: 8,       // 초당 발사 횟수
  SPEED: 720,
  DAMAGE: 1,
  R: 4,
  MAX: 320,      // 화면 전체 내 총알 최대 개수 (4명 × 8단계도 끊기지 않게, 9단계에서 200 → 320)
  GUN_Y: -16,    // 비행기 중심에서 총구까지
  // 총알 단계별 발사 모양: dx = 옆 간격, a = 각도(0 = 위쪽)
  // 가운데는 나란히(a: 0) 쏴서 멀리 있는 보스에게도 다 맞게, 5·7·8단계는 옆으로 퍼지는 사선 탄 추가
  // (예전 4단계는 부채꼴이라 보스에게 가운데 1발만 맞았음 → 보스 처치 1분 넘게)
  PATTERNS: {
    1: [{ dx: 0, a: 0 }],
    2: [{ dx: -6, a: 0 }, { dx: 6, a: 0 }],
    3: [{ dx: -10, a: 0 }, { dx: 0, a: 0 }, { dx: 10, a: 0 }],
    4: [{ dx: -14, a: 0 }, { dx: -5, a: 0 }, { dx: 5, a: 0 }, { dx: 14, a: 0 }],
    5: [{ dx: -14, a: 0 }, { dx: -5, a: 0 }, { dx: 5, a: 0 }, { dx: 14, a: 0 }, { dx: 0, a: -12 }, { dx: 0, a: 12 }],
    6: [{ dx: -16, a: 0 }, { dx: -8, a: 0 }, { dx: 0, a: 0 }, { dx: 8, a: 0 }, { dx: 16, a: 0 }, { dx: 0, a: -12 }, { dx: 0, a: 12 }],
    7: [
      { dx: -16, a: 0 }, { dx: -8, a: 0 }, { dx: 0, a: 0 }, { dx: 8, a: 0 }, { dx: 16, a: 0 },
      { dx: 0, a: -12 }, { dx: 0, a: 12 }, { dx: 0, a: -24 }, { dx: 0, a: 24 },
    ],
    8: [
      { dx: -21, a: 0 }, { dx: -14, a: 0 }, { dx: -7, a: 0 }, { dx: 0, a: 0 }, { dx: 7, a: 0 }, { dx: 14, a: 0 }, { dx: 21, a: 0 },
      { dx: 0, a: -12 }, { dx: 0, a: 12 }, { dx: 0, a: -24 }, { dx: 0, a: 24 },
    ],
  },
};

export const ENEMY_SHOT = { MAX: 300, R: 4, OFFSCREEN: 20 };

export const SCORE = { SMALL: 100, MEDIUM: 500, BOSS: 10000, POWER_MAX_BONUS: 1000 };

export const POWERUP = {
  R: 12,
  FALL_SPEED: 45,
  BOB_AMP: 16,        // 위아래로 흔들리는 폭
  BOB_SPEED: 2.5,     // 흔들림 속도 (라디안/초)
  P_CHANCE: 0.6,      // 중형 적 드롭: P 확률 (나머지는 B)
  ONEUP_PER_STAGE: 1,
  OFFSCREEN: 30,
};

export const CONTINUE = { SECONDS: 10, LIVES: 3, BOMBS: 3 };

// 같이 할 때 적 체력 = 기본 × (1 + 0.3 × (인원 − 1))
export const TEAM = { MAX_PLAYERS: 4, HP_SCALE_PER_EXTRA: 0.3 };

export const ENEMY = {
  SPAWN_Y: -30,
  OFFSCREEN: 60,
  DIAG: 0.7,        // 대각선 비행 속도 비율
  HIT_FLASH: 0.06,  // 맞았을 때 하얗게 번쩍이는 시간
  // s1: 소형(사격 없음) / s2: 소형(조준 사격) / m1: 중형(부채꼴 사격, 아이템 드롭)
  s1: { hp: 2, r: 12, speed: 150, score: SCORE.SMALL, sineAmp: 50, sineSpeed: 2.2 },
  s2: { hp: 4, r: 14, speed: 100, score: SCORE.SMALL, fireDelay: 0.8, fireEvery: 1.8, bulletSpeed: 150, fireMaxY: 0.7 },
  m1: {
    hp: 30, r: 24, speed: 80, score: SCORE.MEDIUM, medium: true,
    hoverY: 150, hoverTime: 4.5, leaveSpeed: 60,
    fireEvery: 1.4, fanCount: 5, fanSpread: 60, bulletSpeed: 130,
  },
  // 2차 8단계: 스테이지 2부터 등장
  // s3: 사탕벌 (내려오다 잠깐 멈칫한 뒤 플레이어가 있던 쪽으로 돌진, 사격 없음)
  s3: { hp: 2, r: 12, speed: 120, score: SCORE.SMALL, aimAfter: 0.9, rushSpeed: 290 },
  // m2: 도넛 포대 (내려와 머무르며 빙글빙글 도는 원형 탄, 처치 시 아이템)
  m2: {
    hp: 40, r: 24, speed: 70, score: SCORE.MEDIUM, medium: true,
    hoverY: 140, hoverTime: 6, leaveSpeed: 60,
    fireEvery: 1.6, ringCount: 10, ringTurn: 13, bulletSpeed: 105,
  },
};

export const BOSS = {
  HP: 900,
  R: 46,
  START_Y: -80,
  ENTER_Y: 130,
  ENTER_SPEED: 45,
  SWAY_RANGE: 100,
  SWAY_SPEED: 0.6,     // 라디안/초
  PHASE2_AT: 0.5,      // 체력 50% 이하에서 패턴 변경
  PATTERN_TIME: 5,     // 공격 패턴 하나를 유지하는 시간
  PHASE2_RATE: 0.7,    // 2페이즈 발사 간격 배율 (작을수록 빠름)
  CLEAR_DELAY: 3,      // 보스 처치 후 결과 화면까지
  // 3가지 공격 패턴
  AIMED: { every: 0.9, count: 3, spread: 14, speed: 170 },  // 조준 3갈래
  SPIRAL: { every: 0.09, arms: 2, turn: 200, speed: 120 },  // 회전 나선
  RING: { every: 1.5, count: 18, speed: 105 },              // 원형 퍼짐
  PHASE1: ['AIMED', 'SPIRAL'],
  PHASE2: ['RING', 'SPIRAL', 'AIMED'],
};

export const STAGE1 = { BOSS_AT: 170 }; // 스테이지 시작 후 보스 등장 시각

export const BOMB_BUTTON = { D: 64, MARGIN: 18, TOUCH_EXTRA: 8 };

// ---------------------------------------------------------------- 2차 (SPEC-v2)
// 코인 (SPEC-v2 3장). 이번 판에서만 쓰고 새 게임이면 0. 이어하기해도 유지
export const COIN = {
  SMALL: 1,          // 소형 적 (떨어진 코인을 주워야 획득)
  MEDIUM: 5,         // 중형 적 (큰 코인 1개)
  BOSS: 50,          // 보스: 살아 있는 전원이 각자 바로 받음
  CLEAR_BONUS: 100,  // 스테이지 클리어: 살아 있는 전원이 각자
  NOMISS_BONUS: 50,  // 그 스테이지에서 목숨을 안 잃으면 추가
  LIFE: 4,           // 떨어진 코인이 사라지기까지
  BLINK_AT: 3,       // 이 시각부터 깜박여서 곧 사라짐을 알림
  R: 7,              // 코인 크기 (줍기 판정은 PLAYER.PICKUP_R과 합산)
  MAGNET_R: 70,      // 이 거리 안이면 자동으로 끌려옴
  MAGNET_SPEED: 380,
  POP_SPEED: 50,     // 떨어질 때 살짝 튀어 오르는 속도
  GRAVITY: 240,
  FALL_MAX: 130,     // 4초 동안 화면 위쪽에서 아래쪽 플레이어 근처까지 내려오도록
  MAX: 120,          // 화면에 동시에 있는 코인 최대 개수
};

// 상점 상품 (SPEC-v2 3장). prices[i] = i번째 구매 가격. max는 아래 shop.js가 상품마다 판정
export const SHOP = {
  ITEMS: [
    { id: 'power', name: '총알 파워업', desc: '총알 단계 +1', prices: [150] },
    { id: 'rapid', name: '빠른 연사', desc: '발사 속도 +15%', prices: [120, 200, 300] },
    { id: 'wings', name: '날쌘 날개', desc: '이동 속도 +10%', prices: [100, 180] },
    { id: 'bomb', name: '폭탄', desc: '폭탄 +1', prices: [80] },
    { id: 'life', name: '생명', desc: '목숨 +1 (상점마다 1개)', prices: [300] },
    { id: 'shield', name: '보호막', desc: '다음 스테이지 피격 1회 막기', prices: [150] },
    { id: 'magnet', name: '큰 자석', desc: '코인 끌어오는 거리 2배', prices: [100] },
  ],
  RAPID_STEP: 0.15,    // 빠른 연사 1회당 발사 속도 +15%
  WINGS_STEP: 0.1,     // 날쌘 날개 1회당 이동 속도 +10%
  MAGNET_MULT: 2,
  LIFE_PER_VISIT: 1,
  SHIELD_INVULN: 1.5,  // 보호막이 막아 준 뒤 잠깐 무적 (연달아 맞지 않게)
  RESULT_SECONDS: 3,   // 클리어 결과 화면을 보여 주는 시간
  MULTI_SECONDS: 45,   // 같이 하기 상점 시간 (모두 준비 완료를 누르면 더 일찍 끝남)
};

// 스테이지가 오를 때마다 (SPEC-v2 4장): 적 체력 +20%, 적 탄 속도 +8% (스테이지 n은 1 + 0.2 × (n − 1))
export const DIFFICULTY = { HP_PER_STAGE: 0.2, SHOT_SPEED_PER_STAGE: 0.08 };

// 스테이지 1~5 (SPEC-v2 4장). 등장표는 stage1.js ~ stage5.js, 묶음은 stages.js
export const STAGES = {
  COUNT: 5,
  BOSS_AT: [STAGE1.BOSS_AT, 175, 175, 180, 185], // 스테이지 시작 후 보스 등장 시각
  TITLE_SECONDS: 2,                              // "STAGE 2 · 노을 구름" 표시 시간
};

// 스테이지 2~5 보스 (스테이지 1 푸딩 대장은 위의 BOSS). 체력은 기본값, 여기에 인원 보정·난이도 배율을 곱함
// phases: 체력 비율이 at 이하가 되면 그 단계로 (첫 단계 at: 1). list: 차례로 바꾸는 공격, rate: 발사 간격 배율
export const BOSSES = {
  // 문어 사탕왕: 다리 8개에서 회전 탄
  octopus: {
    HP: 1000, R: 44, SWAY_RANGE: 110, SWAY_SPEED: 0.7,
    phases: [
      { at: 1, list: ['LEGS', 'AIMED'], rate: 1 },
      { at: 0.5, list: ['LEGS_REV', 'RING', 'LEGS'], rate: 0.8 },
    ],
    LEGS: { every: 0.3, arms: 8, turn: 30, speed: 110 },      // 초당 약 27발 (아이도 피할 수 있게)
    LEGS_REV: { every: 0.24, arms: 8, turn: -40, speed: 120 },
    AIMED: { every: 0.8, count: 5, spread: 12, speed: 170 },
    RING: { every: 1.3, count: 20, speed: 110 },
  },
  // 와플 거북선: 등껍질 포대 4개를 하나씩 부숴야 몸통에 피해가 들어감
  waffleShip: {
    HP: 550, R: 48, SWAY_RANGE: 80, SWAY_SPEED: 0.5,
    TURRET: { hp: 120, r: 13, every: 1.3, speed: 165, spots: [[-30, -20], [30, -20], [-34, 14], [34, 14]] },
    phases: [
      { at: 1, list: ['TURRETS'], rate: 1 },            // 포대가 남아 있는 동안
      { at: 1, list: ['RING', 'SPIRAL'], rate: 0.85 },  // 포대를 다 부순 뒤 (체력과 상관없이)
    ],
    TURRETS: { every: 0.35 }, // 살아 있는 포대가 돌아가며 조준 사격
    RING: { every: 1.2, count: 22, speed: 115 },
    SPIRAL: { every: 0.08, arms: 3, turn: 170, speed: 125 },
  },
  // 번개 솜사탕: 경고선이 먼저 나오고 잠시 뒤 세로 번개 레이저
  cottonStorm: {
    HP: 950, R: 44, SWAY_RANGE: 120, SWAY_SPEED: 0.8,
    phases: [
      { at: 1, list: ['LASER', 'AIMED'], rate: 1 },
      { at: 0.5, list: ['LASER2', 'RING', 'LASER2'], rate: 0.85 },
    ],
    LASER: { every: 2.4, count: 1, warn: 1.1, dur: 0.6, width: 18 },
    LASER2: { every: 2.0, count: 2, warn: 1.0, dur: 0.6, width: 18 },
    AIMED: { every: 0.7, count: 3, spread: 16, speed: 180 },
    RING: { every: 1.1, count: 16, speed: 120 },
  },
  // 케이크 대마왕: 3단 케이크. 한 단이 부서질 때마다(체력 2/3, 1/3) 패턴이 바뀜
  cakeKing: {
    HP: 1200, R: 50, SWAY_RANGE: 90, SWAY_SPEED: 0.55,
    phases: [
      { at: 1, list: ['AIMED', 'RING'], rate: 1 },
      { at: 2 / 3, list: ['SPIRAL', 'AIMED', 'RING'], rate: 0.85 },
      { at: 1 / 3, list: ['SPIRAL2', 'RING2', 'AIMED'], rate: 0.75 },
    ],
    AIMED: { every: 0.75, count: 5, spread: 11, speed: 175 },
    RING: { every: 1.4, count: 20, speed: 105 },
    SPIRAL: { every: 0.09, arms: 3, turn: 150, speed: 120 },
    SPIRAL2: { every: 0.08, arms: 4, turn: -170, speed: 130 },
    RING2: { every: 1.0, count: 26, speed: 120 },
  },
};

// 최고 기록 (SPEC-v2 4장). 기존 최고 점수 키 'sky:best'는 바꾸지 않고, 최고 도달 스테이지는 새 키
export const RECORD = { BEST_SCORE_KEY: 'sky:best', BEST_STAGE_KEY: 'sky:bestStage' };
