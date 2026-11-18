// 밸런스 측정 (SPEC-v2 10단계): 자동 조종 봇으로 스테이지별 맞은 횟수·코인·보스 시간을 잰다
// 사람과 같지는 않지만 스테이지끼리 비교하는 기준으로 쓴다. 숫자를 바꾼 뒤 전후를 비교할 때 사용
//
//   node tools/balance.mjs [손가락속도=4] [반응프레임=6] [반복=4] [chase|nochase] [fixed]
//   아이 기준: node tools/balance.mjs 3 10 12 chase fixed   (스테이지마다 목숨 3·총알 1/3/5/7/8로 따로)
//   이어서 1→5: node tools/balance.mjs 3 10 8                (상점에서 파워업→생명→폭탄 순으로 삼)
//   코인 하한:  node tools/balance.mjs 3 10 8 nochase        (코인을 쫓지 않을 때 얻는 코인)
//   풀파워:     ALL8=1 node tools/balance.mjs 3 10 12 chase fixed  (모든 스테이지 총알 8단계로)
const root = new URL('../web/js/game/', import.meta.url).href;
const { createWorld, stepWorld, nextRound, continueGame, goToStage } = await import(root + 'engine.js');
const { openShop, buy, itemState } = await import(root + 'shop.js');
const { VIEW, TICK } = await import(root + 'rules.js');
const { laserActive } = await import(root + 'boss.js');

const SKILL = { speed: Number(process.argv[2] || 4), react: Number(process.argv[3] || 6), look: 0.35 };
const SEEDS = Number(process.argv[4] || 4);
const CHASE = process.argv[5] !== 'nochase';
const FIXED = process.argv[6] === 'fixed'; // 스테이지마다 같은 조건(목숨 3, 총알 1·3·5·7·8)으로 따로

function danger(w, x, y) {
  let d = 0;
  for (const b of w.eshots.list) {
    for (const k of [0, SKILL.look * 0.5, SKILL.look]) {
      const bx = b.x + b.vx * k;
      const by = b.y + b.vy * k;
      const r2 = (bx - x) ** 2 + (by - y) ** 2;
      if (r2 < 45 * 45) d += 400 / (r2 + 30);
    }
  }
  for (const e of w.enemies) { const r2 = (e.x - x) ** 2 + (e.y - y) ** 2; if (r2 < (e.r + 24) ** 2) d += 300 / (r2 + 30); }
  for (const l of w.lasers || []) if (Math.abs(l.x - x) < l.w + 14) d += l.t > l.warn * 0.4 ? 50 : 5;
  return d;
}

function bot(w, p, mem) {
  if (mem.frame++ % SKILL.react === 0) {
    let target = null;
    const coin = w.coins.reduce((a, c) => (!a || Math.abs(c.x - p.x) + Math.abs(c.y - p.y) < Math.abs(a.x - p.x) + Math.abs(a.y - p.y) ? c : a), null);
    if (CHASE && coin && coin.y > 250) target = coin;
    else if (w.boss && !w.boss.dead) target = { x: w.boss.x, y: 520 };
    else {
      const e = w.enemies.filter((q) => q.y > 0 && q.y < 400).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      target = e ? { x: e.x, y: 540 } : { x: VIEW.W / 2, y: 540 };
    }
    let best = null;
    for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dy of [-1, 0, 1]) {
      const nx = p.x + dx * SKILL.speed * SKILL.react;
      const ny = Math.min(600, Math.max(300, p.y + dy * SKILL.speed * SKILL.react));
      const score = danger(w, nx, ny) * 10 + Math.abs(target.x - nx) * 0.25 + Math.abs(target.y - ny) * 0.05;
      if (!best || score < best.s) best = { s: score, dx, dy };
    }
    mem.dx = best.dx * SKILL.speed;
    mem.dy = best.dy * SKILL.speed;
  }
  return { dx: mem.dx || 0, dy: mem.dy || 0, bomb: danger(w, p.x, p.y) > 60 && p.bombs > 0 };
}

function shopBuy(p) {
  const shop = openShop();
  for (const id of ['power', 'power', 'life', 'power', 'bomb', 'rapid', 'power']) if (itemState(shop, p, id).canBuy) buy(shop, p, id);
}

const rows = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = createWorld({ seed: seed * 97, economy: true });
  const p = w.players[0];
  const mem = { frame: 0 };
  for (let stage = 1; stage <= 5; stage++) {
    if (FIXED) {
      if (stage > 1) goToStage(w, stage);
      Object.assign(p, { lives: 3, bombs: 3, power: process.env.ALL8 ? 8 : [1, 3, 5, 7, 8][stage - 1], rapidLv: 0, wingsLv: 0, spectator: false, invuln: 2 });
    }
    let hits = 0;
    let bossHits = 0;
    const typeHits = {};
    let conts = 0;
    let bossT = 0;
    let shotSum = 0;
    let frames = 0;
    const startCoins = p.coins;
    const powerIn = p.power;
    for (let f = 0; f < 600 * TICK.HZ && w.state !== 'clear'; f++) {
      const before = p.lives;
      const px = p.x, py = p.y;
      stepWorld(w, [bot(w, p, mem)]);
      if (p.lives < before) { hits++; if (w.boss) bossHits++; else { const e = w.enemies.find((q) => (q.x - px) ** 2 + (q.y - py) ** 2 < (q.r * 0.7 + 16) ** 2); const k = e ? `몸:${e.type}` : '탄'; typeHits[k] = (typeHits[k] || 0) + 1; } }
      if (w.state === 'continue') { continueGame(w, 1); conts++; }
      if (w.boss && !w.boss.dead && !w.boss.entering) bossT += TICK.DT;
      shotSum += w.eshots.list.length; frames++;
      w.events.length = 0;
    }
    const r = (rows[stage] ||= { hits: 0, conts: 0, coins: 0, bossT: 0, power: 0, n: 0, shots: 0 });
    r.shots += shotSum / frames;
    r.hits += hits;
    r.bossHits = (r.bossHits || 0) + bossHits;
    r.types = r.types || {}; for (const [k, v] of Object.entries(typeHits)) r.types[k] = (r.types[k] || 0) + v; r.conts += conts; r.coins += p.coins - startCoins; r.bossT += bossT; r.power += powerIn; r.n++;
    if (stage < 5 && !FIXED) { shopBuy(p); nextRound(w); }
  }
}
for (const [s, r] of Object.entries(rows)) {
  console.log(`스테이지 ${s}: 맞은 횟수 ${(r.hits / r.n).toFixed(1)} (보스전 ${(r.bossHits / r.n).toFixed(1)}), 이어하기 ${(r.conts / r.n).toFixed(1)}, 얻은 코인 ${(r.coins / r.n).toFixed(0)}, 보스 ${(r.bossT / r.n).toFixed(0)}초, 시작 총알 P${(r.power / r.n).toFixed(1)}, 평균 적 탄 ${(r.shots / r.n).toFixed(0)}개, 보스 전 원인 ${JSON.stringify(Object.fromEntries(Object.entries(r.types || {}).map(([k, v]) => [k, +(v / r.n).toFixed(1)])))}`);
}
