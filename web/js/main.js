// 시작점: 화면 흐름 (타이틀 → 혼자 하기 → 게임 → 컨티뉴 → 결과) 과 앱 설치(서비스워커)
import { createWorld, startLoop, continueGame, giveUp } from './game/engine.js';
import { createRenderer } from './game/render.js';
import { createInput } from './game/input.js';
import { createSound } from './game/sound.js';
import { STAGE1 } from './game/rules.js';
import * as screens from './ui/screens.js';
import { createFriends } from './ui/friends.js';
import { isKakaoInApp, showKakaoGuide } from './ui/install-guide.js';

const BEST_KEY = 'sky:best';
const MY_SLOT = 1;
const params = new URLSearchParams(location.search);
// 개발 모드 (?debug=1): FPS 표시. &boss=1 이면 보스 직전부터 시작, 콘솔에서 window.__world로 상태 확인
const DEBUG = params.get('debug') === '1';
const DEBUG_BOSS = DEBUG && params.get('boss') === '1';
const DEBUG_BOSS_LEAD = 3; // 보스 등장 몇 초 전부터

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* 저장 불가 */ } }

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.view);
const sound = createSound();

let world = null;
let loop = null;
let idleRaf = 0;

// FPS 측정 (개발 모드)
let fps = 0;
let fpsFrames = 0;
let fpsT = 0;
function countFps(now) {
  fpsFrames++;
  if (now - fpsT >= 1000) { fps = fpsFrames; fpsFrames = 0; fpsT = now; }
}

// 타이틀 등 게임이 없을 때는 배경만 움직이게
function idle(now) {
  renderer.draw(null, now);
  idleRaf = requestAnimationFrame(idle);
}
function stopIdle() { cancelAnimationFrame(idleRaf); idleRaf = 0; }

function drawFrame(w, now) {
  const ev = w.events.splice(0);
  renderer.addEvents(ev);
  sound.handle(ev, MY_SLOT);
  if (DEBUG) countFps(now);
  renderer.draw(w, now, { slot: MY_SLOT, fps: DEBUG ? fps : 0 });
}

function watchState(w) {
  const me = w.players[MY_SLOT - 1];
  if (w.state === 'continue' && me.lives === 0 && !me.spectator) {
    screens.showContinue(Math.ceil(me.continueT));
  } else {
    screens.hideContinue();
  }
  if (w.state === 'over' || w.state === 'clear') finish(w);
}

function startSolo() {
  sound.unlock();
  stopIdle();
  if (loop) loop.pause();
  input.reset();
  world = createWorld({ playerCount: 1, seed: (Math.random() * 2 ** 31) | 0 });
  if (DEBUG_BOSS) {
    world.stage.t = STAGE1.BOSS_AT - DEBUG_BOSS_LEAD;
    world.stage.next = world.timeline.length;
  }
  if (DEBUG) window.__world = world;
  screens.hideAll();
  loop = startLoop({ world, readInputs: () => [input.read()], draw: drawFrame, onTick: watchState });
}

function finish(w) {
  loop.pause();
  // 마지막 사건(게임 오버·클리어 소리)까지 처리
  drawFrame(w, performance.now());
  const score = w.players[MY_SLOT - 1].score;
  const best = loadBest();
  const newBest = score > best;
  if (newBest) saveBest(score);
  screens.showResult({ cleared: w.state === 'clear', score, best: Math.max(best, score), newBest });
  idleRaf = requestAnimationFrame(idle);
}

function toTitle() {
  if (loop) loop.pause();
  world = null;
  screens.showTitle({ best: loadBest(), soundOn: sound.on, nickname: friends.account?.nickname });
  if (!idleRaf) idleRaf = requestAnimationFrame(idle);
}

// 온라인 기능 (등록·친구). 서버가 없어도 혼자 하기는 그대로 동작
const friends = createFriends({
  onBack: toTitle,
  onAccountChange: (a) => screens.setNickname(a?.nickname),
});

// 앱을 내리면 자동 일시정지 (컨티뉴 카운트다운도 멈춤)
function pauseGame() {
  if (!world || !loop || !loop.running) return;
  if (world.state === 'over' || world.state === 'clear') return;
  loop.pause();
  screens.showPause();
}
function resumeGame() {
  if (!world || !loop) return;
  sound.unlock();
  input.reset();
  screens.hideAll();
  loop.resume();
}

screens.bindButtons({
  solo: startSolo,
  friends: () => friends.open(),
  sound: () => { sound.unlock(); screens.setSoundLabel(sound.toggle()); },
  cont: () => { if (world && continueGame(world, MY_SLOT)) screens.hideContinue(); },
  giveUp: () => { if (world) giveUp(world, MY_SLOT); },
  resume: resumeGame,
  again: startSolo,
  toTitle,
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
    friends.pause();
  } else {
    friends.resume();
  }
});
window.addEventListener('resize', () => {
  renderer.resize();
  if (world && loop && !loop.running) renderer.draw(world, performance.now(), { slot: MY_SLOT });
});

renderer.resize();
toTitle();
// 카톡 안 브라우저면 Chrome 안내를 먼저. 그 외에는 초대 링크(?inv=)·첫 등록 처리
if (isKakaoInApp()) showKakaoGuide(() => friends.start());
else friends.start();

// PWA: 오프라인 캐시 (서비스워커). 실패해도 게임은 동작
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 무시 */ });
  });
}
