// 게임방 WebSocket: 자리 배정·입장 알림, 게임 중계 (방장 상태 ↔ 게스트 입력)
// 첫 메시지로 토큰을 보낸다 (URL에는 roomId만)
import { API_BASE } from '../config.js';

// handlers: { onSeat(slot, members, started), onMembers(members), onFull(), onStarted(), onStart(msg),
//             onInput(msg), onSnapshot(msg), onPause(), onResume(), onHostLeft(), onClose(code), onError(error) }
export function connectRoom(roomId, token, handlers) {
  let closedByMe = false;
  let ws;
  try {
    ws = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/ws/room/${encodeURIComponent(roomId)}`);
  } catch {
    setTimeout(() => handlers.onClose?.(0), 0);
    return { send() { return false; }, close() {} };
  }
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token }));
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    switch (m.t) {
      case 'seat': handlers.onSeat?.(m.slot, m.members, m.started); break;
      case 'members': handlers.onMembers?.(m.members); break;
      case 'full': handlers.onFull?.(); break;
      case 'start': handlers.onStart?.(m); break;
      case 'in': handlers.onInput?.(m); break;
      case 'st': handlers.onSnapshot?.(m); break;
      case 'pause': handlers.onPause?.(); break;
      case 'resume': handlers.onResume?.(); break;
      case 'hostleft': handlers.onHostLeft?.(); break;
      case 'error': handlers.onError?.(m.error); break;
      default: break;
    }
  };
  ws.onclose = (e) => { if (!closedByMe) handlers.onClose?.(e.code); };
  ws.onerror = () => { /* onclose에서 처리 */ };

  return {
    send(msg) {
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
      return true;
    },
    close() {
      closedByMe = true;
      try { ws.close(1000, 'bye'); } catch { /* 무시 */ }
    },
  };
}
