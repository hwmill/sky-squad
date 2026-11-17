// 로비 WebSocket: 친구 접속 표시를 실시간으로 받는다.
// 연결 후 첫 메시지로 토큰을 보낸다 (URL에는 넣지 않음).
import { API_BASE, NET } from '../config.js';
import { backoffDelay } from './backoff.js';

// handlers: { onReady(friends), onPresence(userId, online), onFriend(friend), onUnfriend(userId),
//             onInvited(from, roomId), onStatus(connected), onAuthFail() }
export function createLobby(handlers) {
  let ws = null;
  let token = null;
  let pingTimer = 0;
  let retryTimer = 0;
  let attempt = 0;  // 연속 실패 횟수 (성공하면 0으로)
  let wanted = false;

  function connect(t) {
    token = t;
    wanted = true;
    open();
  }

  function open() {
    if (!API_BASE || !wanted || ws) return;
    clearTimeout(retryTimer);
    let sock;
    try {
      sock = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/ws/lobby`);
    } catch {
      scheduleRetry();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      sock.send(JSON.stringify({ t: 'auth', token }));
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'ping' }));
      }, NET.PING_MS);
    };
    sock.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ready') { attempt = 0; handlers.onStatus?.(true); handlers.onReady?.(m.friends || []); }
      else if (m.t === 'presence') handlers.onPresence?.(m.userId, m.online);
      else if (m.t === 'friend') handlers.onFriend?.(m.friend);
      else if (m.t === 'unfriend') handlers.onUnfriend?.(m.userId);
      else if (m.t === 'invited') handlers.onInvited?.(m.from, m.roomId);
      else if (m.t === 'error' && m.error === 'unauthorized') { wanted = false; handlers.onAuthFail?.(); }
    };
    sock.onclose = () => {
      clearInterval(pingTimer);
      if (ws === sock) ws = null;
      handlers.onStatus?.(false);
      scheduleRetry();
    };
    sock.onerror = () => { /* onclose에서 처리 */ };
  }

  // 1초 → 2초 → 4초 … 최대 30초
  function scheduleRetry() {
    clearTimeout(retryTimer);
    if (wanted) retryTimer = setTimeout(open, backoffDelay(attempt++, NET.RECONNECT_BASE_MS, NET.RECONNECT_MAX_MS));
  }

  function close() {
    wanted = false;
    attempt = 0;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (ws) { try { ws.close(1000, 'bye'); } catch { /* 무시 */ } ws = null; }
  }

  // 게임방 초대 보내기 등. 연결이 없으면 false
  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  return {
    connect,
    close,
    send,
    // 앱을 내렸다가 다시 열 때
    pause() { const t = token; close(); token = t; },
    resume() { if (token) connect(token); },
    get connected() { return Boolean(ws && ws.readyState === WebSocket.OPEN); },
  };
}
