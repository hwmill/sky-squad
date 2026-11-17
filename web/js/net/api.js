// REST 호출 (타임아웃 5초) + 내 계정 정보 저장
// 토큰은 URL에 넣지 않고 Authorization 헤더로만 보낸다.
import { API_BASE, NET, OFFLINE_MESSAGE, QUOTA_MESSAGE, SERVER_DOWN_MESSAGE } from '../config.js';

const ACCOUNT_KEY = 'sky:account';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const hasServer = () => Boolean(API_BASE);

export async function api(path, { method = 'GET', body, token } = {}) {
  if (!API_BASE) throw new ApiError(0, 'no_server', OFFLINE_MESSAGE);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NET.REST_TIMEOUT_MS);
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 무료 한도 초과: 서버가 quota로 알려 주거나, Cloudflare가 429로 막음
      if (res.status === 429 || data.error === 'quota') throw new ApiError(res.status, 'quota', QUOTA_MESSAGE);
      const msg = data.message || (res.status >= 500 ? OFFLINE_MESSAGE : '요청을 처리하지 못했어요.');
      throw new ApiError(res.status, data.error || `http_${res.status}`, msg);
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // 타임아웃·연결 실패. 폰은 인터넷에 연결돼 있는데 서버만 안 되면 사용량 초과일 수도 있음
    // (Cloudflare가 한도 초과로 막을 때는 CORS 헤더가 없어 브라우저가 429를 읽지 못함)
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    throw new ApiError(0, 'network', online ? SERVER_DOWN_MESSAGE : OFFLINE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}

// 내 계정 { userId, token, nickname, inviteCode } — 이 폰에만 저장
export function loadAccount() {
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
    return a && a.userId && a.token ? a : null;
  } catch {
    return null;
  }
}

export function saveAccount(a) {
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); } catch { /* 저장 불가 */ }
}

export function clearAccount() {
  try { localStorage.removeItem(ACCOUNT_KEY); } catch { /* 무시 */ }
}
