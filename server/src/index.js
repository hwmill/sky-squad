// 서버 입구 (Worker): 주소(Origin) 확인, CORS, Lobby·GameRoom으로 전달
// 친구·접속 데이터는 Lobby Durable Object 하나가, 게임방은 방마다 GameRoom이 관리한다.
import { Lobby } from './lobby.js';
import { GameRoom } from './room.js';
import { ALLOWED_ORIGINS, ROOM_ID_RE, QUOTA_MESSAGE, json, errorJson } from './util.js';

export { Lobby, GameRoom };

const LOBBY_NAME = 'main';
// 서버 코드를 바꿀 때마다 올림 → 배포 주소(/)에서 새 코드가 반영됐는지 확인
const SERVER_VERSION = 6;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCors(res, origin) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

// Durable Object 호출 실패: 무료 한도 초과면 안내 문구, 아니면 일반 오류
// (한도 초과 때 오류 문구의 정확한 형태는 공식 문서에 없어 "limit/exceed/quota" 포함 여부로 판단 — 확인 필요)
function stubFailure(e, where) {
  const text = String(e && e.message ? e.message : e);
  console.error(`${where} 호출 실패`, text);
  return /limit|exceed|quota/i.test(text)
    ? errorJson(429, 'quota', QUOTA_MESSAGE)
    : errorJson(503, 'server_error', '서버에 잠시 문제가 생겼어요. 조금 뒤에 다시 해 주세요.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // 상태 확인용 (배포 확인: 브라우저로 열면 {"ok":true})
    if (url.pathname === '/') return json({ ok: true, name: 'sky-squad-api', version: SERVER_VERSION });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? corsHeaders(origin) : {} });
    }
    if (!allowed) return errorJson(403, 'origin', '허용되지 않은 주소에서 온 요청이에요.');

    // 게임방 WebSocket: /ws/room/:roomId → 그 방의 GameRoom
    const room = url.pathname.match(/^\/ws\/room\/([A-Z0-9]{6})$/);
    if (room) {
      if (!ROOM_ID_RE.test(room[1])) return errorJson(404, 'room_not_found', '방을 찾을 수 없어요.');
      try {
        return await env.ROOM.getByName(room[1]).fetch(request);
      } catch (e) {
        return stubFailure(e, 'GameRoom');
      }
    }

    const isSocket = url.pathname === '/ws/lobby';
    if (isSocket || url.pathname.startsWith('/api/')) {
      let res;
      try {
        res = await env.LOBBY.getByName(LOBBY_NAME).fetch(request);
      } catch (e) {
        res = stubFailure(e, 'Lobby');
      }
      return isSocket && res.status === 101 ? res : withCors(res, origin); // WebSocket 응답(101)은 그대로
    }
    return withCors(errorJson(404, 'not_found', '없는 주소예요.'), origin);
  },
};
