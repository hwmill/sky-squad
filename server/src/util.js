// 공통 도구: 허용 주소, ID·토큰 생성, 해시, JSON 응답, 입력 검증

// 화면이 열리는 주소만 허용 (배포 주소 + 로컬 개발)
export const ALLOWED_ORIGINS = [
  'https://hwmill.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

export const LIMITS = {
  BODY_MAX: 4096,          // 요청 본문·WebSocket 메시지 최대 크기(바이트)
  AUTH_TIMEOUT_MS: 5000,   // WebSocket 연결 후 이 안에 {t:"auth"}가 없으면 끊음
  PING_TIMEOUT_MS: 60000,  // 이 시간 동안 아무 메시지가 없으면 접속 끊김으로 봄 (화면은 25초마다 ping)
  HOST_MSG_MAX: 65536,     // 방장 스냅샷 최대 크기 (적 탄이 많으면 수 KB)
  ROOM_EMPTY_TTL_MS: 10 * 60 * 1000, // 아무도 들어오지 않은 방은 10분 뒤 정리
  MAX_PLAYERS: 4,
};

// 닉네임: 1~8자, 한글·영문·숫자만
const NICK_RE = /^[가-힣A-Za-z0-9]{1,8}$/;
export const isValidNickname = (s) => typeof s === 'string' && NICK_RE.test(s);

// ID에 쓰는 글자. 초대 코드는 헷갈리는 0/O/1/I/L을 뺀 대문자·숫자
const ID_ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const USER_ID_RE = /^[a-z0-9]{12}$/;
export const ROOM_ID_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

// 치우침 없는 무작위 문자열 (crypto 난수 + 거절 샘플링)
export function randomString(len, alpha) {
  const max = 256 - (256 % alpha.length);
  let out = '';
  while (out.length < len) {
    const buf = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of buf) {
      if (b < max) out += alpha[b % alpha.length];
      if (out.length === len) break;
    }
  }
  return out;
}

export const newUserId = () => randomString(12, ID_ALPHA);
export const newInviteCode = () => randomString(8, CODE_ALPHA);
export const newRoomId = () => randomString(6, CODE_ALPHA);

// 토큰: 무작위 32바이트, base64url
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 서버에는 토큰 대신 SHA-256 해시만 저장
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

// 오류 형식: { error: "코드", message: "한국어 설명" }
export const errorJson = (status, error, message) => json({ error, message }, status);

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 요청 본문 JSON 읽기 (4KB 초과·형식 오류는 400)
export async function readJson(request) {
  const text = await request.text();
  if (text.length > LIMITS.BODY_MAX) throw new HttpError(400, 'too_large', '요청이 너무 커요.');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'bad_json', '요청 형식이 잘못됐어요.');
  }
}
