// 공개 설정만 둔다 (비밀값 금지).
// 서버(Worker) 주소: 배포 후 `wrangler deploy`가 알려 주는 주소를 PROD_API_BASE에 적는다.
// 비어 있으면 온라인 기능(친구)은 "연결할 수 없어요"로 표시되고, 혼자 하기는 그대로 된다.
const PROD_API_BASE = '';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// 로컬 개발: 화면은 python -m http.server 8080, 서버는 wrangler dev (기본 8787)
export const API_BASE = isLocal ? `http://${location.hostname}:8787` : PROD_API_BASE;

// 초대 링크에 쓰는 게임 주소
export const SITE_URL = isLocal ? `${location.origin}/` : 'https://hwmill.github.io/sky-squad/';

export const NET = {
  REST_TIMEOUT_MS: 5000,   // REST 응답 대기 최대 5초
  PING_MS: 25000,          // 로비 연결 유지 신호 간격 (서버는 60초 무응답이면 끊김 처리)
  RECONNECT_MS: 5000,      // 로비 연결이 끊기면 다시 시도하는 간격 (4단계에서 점점 늘리는 방식으로 개선)
};

export const OFFLINE_MESSAGE = '온라인 기능에 연결할 수 없어요. 혼자 하기는 계속할 수 있어요.';
