// 다시 연결할 때 기다리는 시간: 1초 → 2초 → 4초 … 최대 30초 (서버에 몰리지 않게)
export function backoffDelay(attempt, base = 1000, max = 30000) {
  return Math.min(max, base * 2 ** Math.max(0, attempt));
}
