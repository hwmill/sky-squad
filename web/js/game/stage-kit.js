// 적 등장표를 짧게 쓰는 도우미 (stage2.js ~ stage5.js)
// 한 줄 = { t: 등장 시각(초), type: s1|s2|s3|m1|m2, x, pattern: down|sine|diag|hover|rush, dir, drop }
import { VIEW } from './rules.js';

export function makeTimeline() {
  const L = [];
  const add = (t, type, x, pattern, extra = {}) => L.push({ t: Math.round(t * 100) / 100, type, x, pattern, ...extra });
  const k = {
    add,
    // 같은 자리에서 n마리가 gap초 간격으로
    column: (t, type, x, n, gap, pattern, extra) => { for (let i = 0; i < n; i++) add(t + i * gap, type, x, pattern, extra); },
    // 여러 자리에서 동시에
    row: (t, type, xs, pattern, extra) => { for (const x of xs) add(t, type, x, pattern, extra); },
    // 화면 위 모서리에서 대각선으로 가로지르기 (dir 1: 왼쪽→오른쪽)
    swoop: (t, dir, n, type = 's1') => k.column(t, type, dir > 0 ? -20 : VIEW.W + 20, n, 0.35, 'diag', { dir }),
    // 사탕벌 무리: 여러 자리에서 조금씩 시간차로 내려와 돌진
    bees: (t, xs, gap = 0.3) => xs.forEach((x, i) => add(t + i * gap, 's3', x, 'rush')),
    done: () => L.sort((a, b) => a.t - b.t),
  };
  return k;
}
