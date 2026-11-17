// 게임 계산의 중심: 세계(world) 상태를 만들고 1/60초씩 진행한다.
// stepWorld는 화면(DOM)을 쓰지 않으므로 Node에서 테스트할 수 있다.
// startLoop만 브라우저용 (requestAnimationFrame).
import { TICK, SHOT, ENEMY_SHOT, STAGE1 } from './rules.js';
import { createPool, moveBullets, sweepBullets } from './bullets.js';
import { createPlayer, isAlive, movePlayer, tickPlayer, useBomb, continuePlayer } from './player.js';
import { spawnEnemy, updateEnemies, removeDeadEnemies } from './enemies.js';
import { createBoss, updateBoss } from './boss.js';
import { updatePowerups } from './powerups.js';
import { handleCollisions } from './collision.js';
import { STAGE1_TIMELINE } from './stage1.js';

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
export function createWorld({ playerCount = 1, seed = 1, timeline = STAGE1_TIMELINE } = {}) {
  const players = [];
  for (let i = 0; i < playerCount; i++) players.push(createPlayer(i + 1));
  return {
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
  };
}

const NO_INPUT = { dx: 0, dy: 0, bomb: false };

function runStage(world, dt) {
  const st = world.stage;
  if (st.bossSpawned) return;
  st.t += dt;
  const tl = world.timeline;
  while (st.next < tl.length && tl[st.next].t <= st.t) spawnEnemy(world, tl[st.next++]);
  if (st.t >= STAGE1.BOSS_AT) {
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
  updatePowerups(world, dt);

  handleCollisions(world);

  sweepBullets(world);
  removeDeadEnemies(world);
  world.powerups = world.powerups.filter((u) => !u.dead);

  // 보스 처치 후 잠깐 뒤 클리어
  if (world.clearT > 0) {
    world.clearT -= dt;
    if (world.clearT <= 0) {
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
