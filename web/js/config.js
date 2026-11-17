// 공개 설정만 둔다 (비밀값 금지).
// 서버(Worker) 주소: 배포 후 `wrangler deploy`가 알려 주는 주소를 PROD_API_BASE에 적는다.
// 비어 있으면 온라인 기능(친구)은 "연결할 수 없어요"로 표시되고, 혼자 하기는 그대로 된다.
const PROD_API_BASE = 'https://sky-squad-api.terry96.workers.dev';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// 로컬 개발: 화면은 python -m http.server 8080, 서버는 wrangler dev (기본 8787)
export const API_BASE = isLocal ? `http://${location.hostname}:8787` : PROD_API_BASE;

// 초대 링크에 쓰는 게임 주소
export const SITE_URL = isLocal ? `${location.origin}/` : 'https://hwmill.github.io/sky-squad/';

export const NET = {
  REST_TIMEOUT_MS: 5000,   // REST 응답 대기 최대 5초
  PING_MS: 25000,          // 로비 연결 유지 신호 간격 (서버는 60초 무응답이면 끊김 처리)
  RECONNECT_BASE_MS: 1000, // 로비 재연결: 1초 → 2초 → 4초 …
  RECONNECT_MAX_MS: 30000, // … 최대 30초 간격
  ROOM_RETRY_BASE_MS: 500, // 게임방 재연결: 대기 시간(15·30초) 안에 짧은 간격으로 여러 번
  ROOM_RETRY_MAX_MS: 4000,
};

export const OFFLINE_MESSAGE = '온라인 기능에 연결할 수 없어요. 혼자 하기는 계속할 수 있어요.';
// 무료 한도는 UTC 0시(한국 오전 9시)에 초기화
export const QUOTA_MESSAGE = '오늘 온라인 사용량을 다 썼어요. 오전 9시 이후에 다시 해 주세요.';
// 인터넷은 되는데 서버만 연결이 안 될 때 (서버 장애이거나 사용량 초과)
export const SERVER_DOWN_MESSAGE = '서버에 연결할 수 없어요. 오늘 온라인 사용량을 다 썼다면 오전 9시 이후에 다시 해 주세요. 혼자 하기는 계속할 수 있어요.';
