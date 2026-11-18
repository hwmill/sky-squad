// 게임 계산의 중심: 세계(world) 상태를 만들고 1/60초씩 진행한다.
// stepWorld는 화면(DOM)을 쓰지 않으므로 Node에서 테스트할 수 있다.
// startLoop만 브라우저용 (requestAnimationFrame).
import { TICK, SHOT, ENEMY_SHOT, STAGE1, DIFFICULTY, PLAYER, RANK } from './rules.js';
import { createPool, moveBullets, sweepBullets, clearPool } from './bullets.js';
import { createPlayer, isAlive, movePlayer, tickPlayer, useBomb, continuePlayer, placeAtStart } from './player.js';
import { updateCoins, collectCoins, giveClearBonus } from './coins.js';
import { spawnEnemy, updateEnemies, removeDeadEnemies } from './enemies.js';
import { createBoss, updateBoss, updateLasers } from './boss.js';
import { updatePowerups } from './powerups.js';
import { handleCollisions } from './collision.js';
import { STAGE1_TIMELINE } from './stage1.js';
import { stageInfo } from './stages.js';

// 같은 seed면 같은 결과가 나오는 난수 (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// state: play(진행) / continue(전원 목숨 0, 카운트다운 중 멈춤) / over(게임 오버) / clear(보스 처치)
// slots: 같이 할 때 자리 번호 목록 (예: [1, 2, 4]). 없으면 1..playerCount
// economy: 코인·상점 사용 (SPEC-v2). 7단계는 혼자 하기만 켬, 같이 하기는 9단계에서
export function createWorld({ playerCount = 1, slots = null, seed = 1, timeline = STAGE1_TIMELINE, economy = false } = {}) {
  const list = slots && slots.length ? slots : Array.from({ length: playerCount }, (_, i) => i + 1);
  const players = list.map((slot) => createPlayer(slot));
  return {
    nextId: 1,        // 적마다 붙이는 번호 (게스트 화면 보간용)
    t: 0,
    frame: 0,
    state: 'play',
    players,
    shots: createPool(SHOT.MAX),
    eshots: createPool(ENEMY_SHOT.MAX),
    enemies: [],
    boss: null,
    powerups: [],
    events: [],       // 소리·효과용 사건. 그리는 쪽이 꺼내 쓰고 비운다
    rng: makeRng(seed),
    stage: { t: 0, next: 0, oneUps: 0, bossSpawned: false },
    timeline,
    clearT: 0,
    economy,
    coins: [],        // 떨어진 코인
    round: 1,         // 몇 번째 스테이지 (1~5)
    bossAt: STAGE1.BOSS_AT,
    bossKind: 'pudding',
    lasers: [],       // 번개 솜사탕 레이저
    hpMul: 1,         // 적 체력 배율 (스테이지)
    shotMul: 1,       // 적 탄 속도 배율 (스테이지)
    rank: 0,          // 파워에 따른 강함 0~1 (rankOf). 체력·발사 빈도·탄 속도에 곱함
  };
}

// 파워에 따른 강함 0~1: 살아 있는(관전 아닌) 사람들의 평균 총알 단계로
export function rankOf(players) {
  const live = players.filter((p) => p.lives > 0 && !p.spectator);
  if (!live.length) return 0;
  const avg = live.reduce((a, p) => a + p.power, 0) / live.length;
  return Math.max(0, Math.min(1, (avg - RANK.FROM_POWER) / (PLAYER.MAX_POWER - RANK.FROM_POWER)));
}

// 난이도 배율: 스테이지 n은 적 체력 ×(1 + 0.2(n−1)), 적 탄 속도 ×(1 + 0.08(n−1))
export const stageHpMul = (n) => 1 + DIFFICULTY.HP_PER_STAGE * (n - 1);
export const stageShotMul = (n) => 1 + DIFFICULTY.SHOT_SPEED_PER_STAGE * (n - 1);

// n번째 스테이지로 (등장표·보스·배율을 바꾸고 화면을 비움). 점수·코인·상점 효과는 유지
// timeline을 주면 그 등장표로 (테스트용)
export function goToStage(world, n, timeline = null) {
  const info = stageInfo(n);
  world.round = info.no;
  world.hpMul = stageHpMul(info.no);
  world.shotMul = stageShotMul(info.no);
  world.timeline = timeline || info.timeline;
  world.bossAt = info.bossAt;
  world.bossKind = info.boss;
  world.stage = { t: 0, next: 0, oneUps: 0, bossSpawned: false };
  world.enemies = [];
  world.boss = null;
  world.powerups = [];
  world.coins = [];
  world.lasers = [];
  clearPool(world.shots);
  clearPool(world.eshots);
  world.clearT = 0;
  world.state = 'play';
}

// 다음 스테이지 시작 (상점에서 "다음 스테이지로")
export function nextRound(world, timeline = null) {
  goToStage(world, world.round + 1, timeline);
  for (const p of world.players) {
    p.stageCoins = 0;
    p.missed = false;
    p.shield = p.shieldNext; // 산 보호막은 이번 스테이지에서만
    p.shieldNext = 0;
    if (!isAlive(p)) continue;
    placeAtStart(p);
    p.invuln = PLAYER.HIT_INVULN;
    p.bombT = 0;
    p.fireT = 0;
  }
  world.events.push({ type: 'round', round: world.round });
}

const NO_INPUT = { dx: 0, dy: 0, bomb: false };

function runStage(world, dt) {
  const st = world.stage;
  if (st.bossSpawned) return;
  st.t += dt;
  const tl = world.timeline;
  while (st.next < tl.length && tl[st.next].t <= st.t) spawnEnemy(world, tl[st.next++]);
  if (st.t >= world.bossAt) {
    st.bossSpawned = true;
    world.boss = createBoss(world);
    world.events.push({ type: 'boss' });
  }
}

// inputs[i] = i번째 플레이어(slot i+1)의 입력 { dx, dy, bomb } 또는 { x, y, bomb }
export function stepWorld(world, inputs = []) {
  if (world.state === 'over' || world.state === 'clear') return;
  const dt = TICK.DT;
  const { players } = world;

  // 목숨 0인 사람의 이어하기 카운트다운. 시간이 다 되면 관전만
  for (const p of players) {
    if (p.lives === 0 && !p.spectator) {
      p.continueT -= dt;
      if (p.continueT <= 0) { p.continueT = 0; p.spectator = true; }
    }
  }

  // 살아 있는 사람이 없으면 멈추고 카운트다운만 (모두 시간이 다 되면 게임 오버)
  if (!players.some(isAlive)) {
    if (players.some((p) => !p.spectator)) {
      world.state = 'continue';
    } else {
      world.state = 'over';
      world.events.push({ type: 'gameover' });
    }
    return;
  }

  world.state = 'play';
  world.t += dt;
  world.frame++;
  world.rank = rankOf(players);
  runStage(world, dt);

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const input = inputs[i] || NO_INPUT;
    movePlayer(p, input);
    if (input.bomb) useBomb(world, p);
    tickPlayer(world, p, dt);
  }

  moveBullets(world, dt);
  updateEnemies(world, dt);
  if (world.boss) updateBoss(world, world.boss, dt);
  updateLasers(world, dt);
  updatePowerups(world, dt);
  if (world.economy) updateCoins(world, dt);

  handleCollisions(world);
  if (world.economy) collectCoins(world);

  sweepBullets(world);
  removeDeadEnemies(world);
  world.powerups = world.powerups.filter((u) => !u.dead);

  // 보스 처치 후 잠깐 뒤 클리어
  if (world.clearT > 0) {
    world.clearT -= dt;
    if (world.clearT <= 0) {
      giveClearBonus(world); // 클리어 보너스 + 노미스 보너스 (economy일 때만)
      world.state = 'clear';
      world.events.push({ type: 'clear' });
    }
  }
}

// 이어하기 (컨티뉴 화면에서 누름)
export function continueGame(world, slot) {
  const p = world.players.find((q) => q.slot === slot);
  if (!p || p.lives > 0 || p.spectator) return false;
  continuePlayer(p);
  world.state = 'play';
  return true;
}

// 그만하기: 바로 관전 처리 (혼자면 다음 계산에서 게임 오버)
export function giveUp(world, slot) {
  const p = world.players.find((q) => q.slot === slot);
  if (!p || p.lives > 0) return;
  p.continueT = 0;
  p.spectator = true;
}

// ---------------------------------------------------------------------
// 브라우저용 루프: 고정 60Hz로 계산하고, 화면은 그릴 수 있을 때마다 그린다
// ---------------------------------------------------------------------
export function startLoop({ world, readInputs, draw, onTick }) {
  let acc = 0;
  let last = performance.now();
  let running = true;
  let rafId = 0;

  function frame(now) {
    if (!running) return;
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (acc >= TICK.DT && steps < TICK.MAX_STEPS_PER_FRAME) {
      stepWorld(world, readInputs());
      acc -= TICK.DT;
      steps++;
    }
    if (steps === TICK.MAX_STEPS_PER_FRAME) acc = 0; // 너무 밀리면 따라잡기 포기 (느린 화면 방지)
    draw(world, now);
    if (onTick) onTick(world);
    if (running) rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return {
    pause() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    resume() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      rafId = requestAnimationFrame(frame);
    },
    get running() { return running; },
  };
}
