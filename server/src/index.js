// 서버 입구 (Worker): 주소(Origin) 확인, CORS, Lobby로 전달
// 모든 친구·접속 데이터는 Lobby Durable Object 하나가 관리한다.
import { Lobby } from './lobby.js';
import { GameRoom } from './room.js';
import { ALLOWED_ORIGINS, ROOM_ID_RE, json, errorJson } from './util.js';

export { Lobby, GameRoom };

const LOBBY_NAME = 'main';

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // 상태 확인용 (배포 확인: 브라우저로 열면 {"ok":true})
    if (url.pathname === '/') return json({ ok: true, name: 'sky-squad-api' });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? corsHeaders(origin) : {} });
    }
    if (!allowed) return errorJson(403, 'origin', '허용되지 않은 주소에서 온 요청이에요.');

    // 게임방 WebSocket: /ws/room/:roomId → 그 방의 GameRoom
    const room = url.pathname.match(/^\/ws\/room\/([A-Z0-9]{6})$/);
    if (room) {
      if (!ROOM_ID_RE.test(room[1])) return errorJson(404, 'room_not_found', '방을 찾을 수 없어요.');
      return env.ROOM.getByName(room[1]).fetch(request);
    }

    const isSocket = url.pathname === '/ws/lobby';
    if (isSocket || url.pathname.startsWith('/api/')) {
      const res = await env.LOBBY.getByName(LOBBY_NAME).fetch(request);
      return isSocket ? res : withCors(res, origin); // WebSocket 응답(101)은 그대로
    }
    return withCors(errorJson(404, 'not_found', '없는 주소예요.'), origin);
  },
};
