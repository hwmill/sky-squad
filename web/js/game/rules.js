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
  MAX_POWER: 4,
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
};

export const BOMB = { DAMAGE: 50, INVULN: 2, DURATION: 2 };

export const SHOT = {
  RATE: 8,       // 초당 발사 횟수
  SPEED: 720,
  DAMAGE: 1,
  R: 4,
  MAX: 200,      // 내 총알 최대 개수
  GUN_Y: -16,    // 비행기 중심에서 총구까지
  // 총알 단계별 발사 모양: dx = 옆 간격, a = 각도(0 = 위쪽)
  PATTERNS: {
    1: [{ dx: 0, a: 0 }],
    2: [{ dx: -6, a: 0 }, { dx: 6, a: 0 }],
    3: [{ dx: 0, a: -8 }, { dx: 0, a: 0 }, { dx: 0, a: 8 }],
    4: [{ dx: 0, a: -16 }, { dx: 0, a: -8 }, { dx: 0, a: 0 }, { dx: 0, a: 8 }, { dx: 0, a: 16 }],
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
    hp: 30, r: 24, speed: 80, score: SCORE.MEDIUM,
    hoverY: 150, hoverTime: 4.5, leaveSpeed: 60,
    fireEvery: 1.4, fanCount: 5, fanSpread: 60, bulletSpeed: 130,
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
