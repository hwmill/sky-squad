// 시작점: 화면 흐름과 게임 방식 관리
// - 혼자 하기(solo): 이 폰에서 계산·그리기
// - 같이 하기 방장(host): 이 폰이 게임 전체를 계산하고 초당 15회 상태를 보냄
// - 같이 하기 게스트(guest): 상태를 받아 보간해서 그리고, 내 비행기 위치를 초당 10회 보냄
import { createWorld, startLoop, continueGame, giveUp, nextRound, goToStage } from './game/engine.js';
import { isLastStage } from './game/stages.js';
import { updateRecords } from './game/records.js';
import { openShopScreen, localShop, showStageClear } from './ui/shop-screen.js';
import { openShop, buy as shopBuy, undo as shopUndo, itemById, shopStateOf, applyShopState } from './game/shop.js';
import { createRenderer } from './game/render.js';
import { createInput } from './game/input.js';
import { createSound } from './game/sound.js';
import { movePlayer } from './game/player.js';
import { VIEW, PLAYER, SHOT, NETPLAY, STAGES, RECORD, SHOP } from './game/rules.js';
import { encodeSnapshot, decodeSnapshot, createGuestView } from './net/sync.js';
import { connectRoom } from './net/room.js';
import { backoffDelay } from './net/backoff.js';
import { api, hasServer } from './net/api.js';
import { OFFLINE_MESSAGE, NET } from './config.js';
import * as screens from './ui/screens.js';
import { createFriends } from './ui/friends.js';
import { renderRoom, bindRoom, showInvite } from './ui/room.js';
import { isKakaoInApp, showKakaoGuide } from './ui/install-guide.js';
import { startPreview } from './ui/preview.js';

const params = new URLSearchParams(location.search);
// 개발 모드 (?debug=1): FPS 표시. &boss=1 이면 보스 직전부터 시작, 콘솔에서 window.__world로 상태 확인
const DEBUG = params.get('debug') === '1';
const DEBUG_BOSS = DEBUG && params.get('boss') === '1';
const DEBUG_BOSS_LEAD = 3; // 보스 등장 몇 초 전부터
// 개발 모드 &coins=500: 혼자 하기를 코인 500개로 시작 (상점 확인용)
const DEBUG_COINS = DEBUG ? Number(params.get('coins')) || 0 : 0;
// 개발 모드 &stage=4: 혼자 하기를 4번째 스테이지부터 (&boss=1과 같이 쓰면 그 스테이지 보스 직전)
const DEBUG_STAGE = DEBUG ? Math.min(STAGES.COUNT, Math.max(1, Math.floor(Number(params.get('stage')) || 1))) : 1;
// 개발 모드 &power=8: 총알 단계를 정해서 시작 (보스 처치 시간 확인용)
const DEBUG_POWER = DEBUG ? Math.min(PLAYER.MAX_POWER, Math.max(0, Math.floor(Number(params.get('power')) || 0))) : 0;
const NO_INPUT = { dx: 0, dy: 0, bomb: false };

// 최고 기록: 최고 점수(1차 키 'sky:best' 그대로) + 최고 도달 스테이지(새 키)
function loadRecords() {
  try {
    return {
      score: Number(localStorage.getItem(RECORD.BEST_SCORE_KEY)) || 0,
      stage: Number(localStorage.getItem(RECORD.BEST_STAGE_KEY)) || 0,
    };
  } catch { return { score: 0, stage: 0 }; }
}
// 이번 판 기록을 반영하고 { score, stage, newScore, newStage } 돌려줌 (갱신될 때만 저장)
function record(score, stage) {
  const r = updateRecords(loadRecords(), { score, stage });
  try {
    if (r.newScore) localStorage.setItem(RECORD.BEST_SCORE_KEY, String(r.score));
    if (r.newStage) localStorage.setItem(RECORD.BEST_STAGE_KEY, String(r.stage));
  } catch { /* 저장 불가 */ }
  return r;
}
const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.view);
const sound = createSound();

let mode = null;      // 'solo' | 'host' | 'guest' | null(메뉴)
let mySlot = 1;
let world = null;     // 혼자 하기·방장
let loop = null;
let guest = null;     // 게스트 화면 상태
let room = null;      // { id, conn, mySlot, members, invited, status }
let idleRaf = 0;
const guestInputs = new Map(); // 방장: 자리별 마지막 입력
let netEvents = [];            // 방장: 다음 스냅샷에 실을 효과 사건
let lastSnapAt = 0;
let stageClearTimer = 0;       // 혼자 하기: 클리어 결과 → 상점으로 넘어가는 타이머
let endingRaf = 0;             // 엔딩 장면 그리기
let coop = null;               // 같이 하기 방장: 클리어·상점 진행 { phase, shops, ready, deadline, timer, ui }

// FPS 측정 (개발 모드)
let fps = 0;
let fpsFrames = 0;
let fpsT = 0;
function countFps(now) {
  fpsFrames++;
  if (now - fpsT >= 1000) { fps = fpsFrames; fpsFrames = 0; fpsT = now; }
}

// 메뉴 화면에서는 배경만 움직이게
function idle(now) {
  renderer.draw(null, now);
  idleRaf = requestAnimationFrame(idle);
}
function startIdle() { if (!idleRaf) idleRaf = requestAnimationFrame(idle); }
function stopIdle() { cancelAnimationFrame(idleRaf); idleRaf = 0; }

const myPlayer = (players) => players.find((p) => p.slot === mySlot);

// 진행 중인 게임을 모두 멈춤 (화면 전환 전)
function stopGames() {
  clearTimeout(stageClearTimer);
  cancelAnimationFrame(endingRaf);
  endingRaf = 0;
  closeCoop();
  if (loop) { loop.pause(); loop = null; }
  if (guest) { cancelAnimationFrame(guest.raf); guest = null; }
  screens.hideContinue();
}

// ===================================================================== 혼자 하기·방장
function drawFrame(w, now) {
  const ev = w.events.splice(0);
  if (mode === 'host') for (const e of ev) if (e.type !== 'shot') netEvents.push(e);
  renderer.addEvents(ev);
  sound.handle(ev, mySlot);
  if (DEBUG) countFps(now);
  renderer.draw(w, now, { slot: mySlot, fps: DEBUG ? fps : 0 });
}

function watchState(w) {
  const p = myPlayer(w.players);
  if (p && p.lives === 0 && !p.spectator && w.state !== 'over' && w.state !== 'clear') screens.showContinue(Math.ceil(p.continueT));
  else screens.hideContinue();
  if (mode === 'host') sendSnapshot(false);
  if (w.state === 'over' || w.state === 'clear') finish(w);
}

// 방장: 초당 15회까지만 상태 전송 (CLAUDE.md 규칙 8)
function sendSnapshot(force) {
  const now = performance.now();
  if (!room || !world) return;
  if (!force && now - lastSnapAt < 1000 / NETPLAY.SNAPSHOT_HZ) return;
  lastSnapAt = now;
  room.conn.send(encodeSnapshot(world, netEvents.splice(0)));
}

// 방장: 게스트 입력 반영. k(게스트가 아는 부활 번호)가 다르면 위치는 무시 (부활 직후 옛 위치로 튀지 않게)
function takeGuestInput(p) {
  const g = guestInputs.get(p.slot);
  if (!g) return NO_INPUT;
  const r = g.k === p.spawn && Number.isFinite(g.x) ? { x: g.x, y: g.y, bomb: g.bomb } : { dx: 0, dy: 0, bomb: g.bomb };
  g.bomb = false;
  return r;
}

function onHostInput(m) {
  if (mode !== 'host' || !world) return;
  const g = guestInputs.get(m.s) || { bomb: false };
  if (Number.isFinite(m.x) && Number.isFinite(m.y)) { g.x = m.x; g.y = m.y; g.k = m.k; }
  if (m.b) g.bomb = true;
  guestInputs.set(m.s, g);
  if (m.c) continueGame(world, m.s);
  if (m.g) giveUp(world, m.s);
}

function startLocalGame(slots, seed) {
  sound.unlock();
  stopIdle();
  stopGames();
  input.reset();
  world = createWorld({ slots, seed, economy: true }); // 코인·상점 (같이 하기는 방장이 판정)
  if (DEBUG_COINS && mode === 'solo') world.players[0].coins = DEBUG_COINS;
  if (DEBUG_POWER) for (const p of world.players) p.power = DEBUG_POWER;
  if (DEBUG_STAGE > 1 && mode === 'solo') goToStage(world, DEBUG_STAGE);
  if (DEBUG_BOSS) {
    world.stage.t = world.bossAt - DEBUG_BOSS_LEAD;
    world.stage.next = world.timeline.length;
  }
  if (DEBUG) window.__world = world;
  guestInputs.clear();
  netEvents = [];
  lastSnapAt = 0;
  screens.hideAll();
  const readInputs = () => world.players.map((p) => (p.slot === mySlot ? input.read() : takeGuestInput(p)));
  loop = startLoop({ world, readInputs, draw: drawFrame, onTick: watchState });
}

function startSolo() {
  leaveRoom();
  mode = 'solo';
  mySlot = 1;
  startLocalGame([1], (Math.random() * 2 ** 31) | 0);
}

function finish(w) {
  loop.pause();
  drawFrame(w, performance.now()); // 마지막 사건(게임 오버·클리어 소리)까지 처리
  if (mode === 'solo' && w.state === 'clear') { stageClear(w); return; }
  if (mode === 'host' && room && w.state === 'clear') { hostStageClear(w); return; }
  if (mode === 'host' && room) {
    sendSnapshot(true);
    room.conn.send({ t: 'end' }); // 서버: 다시 시작할 수 있게
  }
  showMyResult(w.state === 'clear', myPlayer(w.players)?.score || 0);
}

// 혼자 하기 클리어: 결과 3초 → 상점 → 다음 스테이지. 스테이지 5를 깨면 엔딩
function stageClear(w) {
  const p = myPlayer(w.players);
  const rec = record(p.score, w.round);
  if (isLastStage(w.round)) { showEnding(p.score, rec); return; }
  stageClearTimer = showStageClear({
    round: w.round,
    score: p.score,
    stageCoins: p.stageCoins,
    nomiss: !p.missed,
    best: rec.score,
    newBest: rec.newScore,
  }, () => {
    if (world !== w || !loop) return;
    const ui = openShopScreen(localShop(p, {
      onBuy: () => {
        sound.handle([{ type: 'powerup' }], mySlot);
        renderer.draw(w, performance.now(), { slot: mySlot }); // 뒤 화면의 코인 수도 갱신
      },
      onDone: () => {
        ui.close();
        if (world !== w || !loop) return;
        nextRound(w);
        record(p.score, w.round); // 새 스테이지에 도착 = 최고 도달 스테이지 후보
        input.reset();
        screens.hideAll();
        loop.resume(); // 화면에 "STAGE 2 · 노을 구름" 제목이 2초 나옴
      },
    }));
  });
}

// ===================================================================== 같이 하기: 클리어 → 상점 → 다음 스테이지 (9단계)
// 방장이 모두의 코인·구매를 판정한다. 상점 중에는 게임이 멈춰 스냅샷도 보내지 않고, 바뀔 때만 shopst를 보냄
const secondsLeft = (deadline) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

function closeCoop() {
  if (!coop) return;
  clearTimeout(coop.timer);
  if (coop.ui) coop.ui.close();
  coop = null;
}

function hostStageClear(w) {
  const p = myPlayer(w.players);
  const rec = record(p.score, w.round);
  const last = isLastStage(w.round);
  const coins = {};
  const nomiss = {};
  for (const q of w.players) { coins[q.slot] = q.stageCoins; nomiss[q.slot] = q.missed ? 0 : 1; }
  sendSnapshot(true);
  room.conn.send({ t: 'ev', e: 'clear', stage: w.round, last: last ? 1 : 0, coins, nomiss });
  if (last) {
    room.conn.send({ t: 'end' }); // 서버: 다시 시작할 수 있게
    showEnding(p.score, rec);
    return;
  }
  coop = { phase: 'clear', timer: 0 };
  stageClearTimer = showStageClear({
    round: w.round, score: p.score, stageCoins: p.stageCoins, nomiss: !p.missed, best: rec.score, newBest: rec.newScore,
  }, () => hostOpenShop(w));
}

// 다음 스테이지에 함께 갈 사람: 관전 중이 아니고 자리에 연결돼 있는 사람
function shopMembers() {
  if (!world || !room) return [];
  return world.players
    .filter((q) => !q.spectator && room.members.some((m) => m.slot === q.slot && !m.away))
    .map((q) => q.slot);
}

function shopLabel(deadline, readyList, mine) {
  const sec = secondsLeft(deadline);
  const need = shopMembers().length || readyList.length;
  if (mine) return `친구를 기다리는 중… (${readyList.length}/${need} 준비) ${sec}초`;
  return `준비 완료 ✔ (${sec}초)`;
}

function sendShopState() {
  if (!coop || coop.phase !== 'shop' || !room) return;
  const p = {};
  for (const slot of shopMembers()) {
    const q = world.players.find((x) => x.slot === slot);
    p[slot] = shopStateOf(coop.shops.get(slot), q);
  }
  room.conn.send({ t: 'shopst', p, ready: [...coop.ready], n: Object.keys(p).length, left: coop.deadline - Date.now() });
}

function hostOpenShop(w) {
  if (world !== w || !room || !coop) return;
  const shops = new Map(w.players.map((q) => [q.slot, openShop()]));
  coop = { phase: 'shop', shops, ready: new Set(), deadline: Date.now() + SHOP.MULTI_SECONDS * 1000, timer: 0, ui: null };
  room.conn.send({ t: 'shop', open: true, left: SHOP.MULTI_SECONDS * 1000 });
  sendShopState();
  const me = myPlayer(w.players);
  const myShop = shops.get(mySlot);
  const c = coop;
  coop.ui = openShopScreen({
    player: () => me,
    shop: () => myShop,
    buy(id) {
      const r = shopBuy(myShop, me, id);
      if (r.ok) { sound.handle([{ type: 'powerup' }], mySlot); sendShopState(); }
      return r;
    },
    undo() { const id = shopUndo(myShop, me); if (id) sendShopState(); return id; },
    next() { c.ready.add(mySlot); sendShopState(); checkShopDone(w); },
    nextLabel: () => shopLabel(c.deadline, [...c.ready], c.ready.has(mySlot)),
    locked: () => c.ready.has(mySlot),
  });
  coop.timer = setTimeout(() => hostCloseShop(w), SHOP.MULTI_SECONDS * 1000);
}

// (방장) 게스트의 buy·undo·ready 요청 판정
function onShopRequest(m) {
  if (mode !== 'host' || !coop || coop.phase !== 'shop' || coop.ready.has(m.s)) return;
  const q = world.players.find((x) => x.slot === m.s);
  const shop = coop.shops.get(m.s);
  if (!q || !shop || q.spectator) return;
  if (m.t === 'buy' && itemById(m.item)) shopBuy(shop, q, m.item);
  else if (m.t === 'undo') shopUndo(shop, q);
  else if (m.t === 'ready') coop.ready.add(m.s);
  sendShopState();
  if (coop.ui) coop.ui.refresh();
  checkShopDone(world);
}

function checkShopDone(w) {
  if (!coop || coop.phase !== 'shop') return;
  const need = shopMembers();
  if (need.every((s) => coop.ready.has(s))) hostCloseShop(w);
}

function hostCloseShop(w) {
  if (!coop || coop.phase !== 'shop' || world !== w) return;
  closeCoop();
  if (room) room.conn.send({ t: 'shop', open: false });
  nextRound(w);
  record(myPlayer(w.players).score, w.round);
  input.reset();
  screens.hideAll();
  lastSnapAt = 0;
  if (loop) loop.resume();
}

// ----------------------------------------------------------------- 게스트 쪽
function onGuestEvent(m) {
  if (!guest || m.e !== 'clear') return;
  const latest = guest.view.latest;
  const me = latest ? myPlayer(latest.players) : null;
  const score = me ? me.score : 0;
  const rec = record(score, m.stage);
  guest.paused = true; // 상점이 끝날 때까지 입력·끊김 확인 멈춤
  screens.hideContinue();
  if (m.last) {
    guest.ended = true;
    cancelAnimationFrame(guest.raf);
    showEnding(score, rec);
    return;
  }
  guest.coop = { phase: 'clear' };
  showStageClear({
    round: m.stage, score, stageCoins: (m.coins && m.coins[mySlot]) || 0, nomiss: Boolean(m.nomiss && m.nomiss[mySlot]),
    best: rec.score, newBest: rec.newScore,
  }); // 상점은 방장이 열어 줌
}

function onGuestShop(m) {
  if (!guest) return;
  if (!m.open) {
    if (guest.coop && guest.coop.ui) guest.coop.ui.close();
    guest.coop = null;
    guest.paused = false;
    guest.view.clear(); // 지난 스테이지 화면과 섞이지 않게
    guest.lastSnapAt = performance.now();
    input.reset();
    screens.hideAll();
    return;
  }
  guest.paused = true;
  if (guest.coop && guest.coop.phase === 'shop') { // 다시 연결됐을 때 등: 시간만 맞춤
    guest.coop.deadline = Date.now() + m.left;
    screens.showOnly('shop');
    guest.coop.ui.refresh();
    return;
  }
  const c = {
    phase: 'shop',
    deadline: Date.now() + m.left,
    ready: [],
    sentReady: false,
    joined: false, // 방장이 보낸 상태에 내 자리가 있어야 살 수 있음 (관전 중이면 없음)
    p: { slot: mySlot, coins: 0, power: 1, rapidLv: 0, wingsLv: 0, bombs: 0, lives: 0, shieldNext: 0, magnetBig: false },
    shop: { history: [], lifeBought: 0 },
    ui: null,
  };
  guest.coop = c;
  c.ui = openShopScreen({
    player: () => c.p,
    shop: () => c.shop,
    // 결과는 방장이 보낸 shopst로 화면에 반영. 연결이 끊겨 못 보냈으면 안내만
    buy(id) { if (!sendShop({ t: 'buy', item: id })) return { ok: false, reason: NOT_SENT }; return null; },
    undo() { sendShop({ t: 'undo' }); return null; },
    next() { if (sendShop({ t: 'ready' })) c.sentReady = true; },
    nextLabel: () => {
      if (!c.joined) return `관전 중이에요 (${secondsLeft(c.deadline)}초)`;
      const mine = c.sentReady || c.ready.includes(mySlot);
      return mine ? `친구를 기다리는 중… (${c.ready.length}/${c.need || '?'} 준비) ${secondsLeft(c.deadline)}초` : `준비 완료 ✔ (${secondsLeft(c.deadline)}초)`;
    },
    locked: () => !c.joined || c.sentReady || c.ready.includes(mySlot),
  });
}

const NOT_SENT = '연결이 끊겼어요. 다시 연결되면 눌러 주세요.';
function sendShop(msg) {
  const ok = Boolean(room && room.conn && !room.recon && room.conn.send(msg));
  if (!ok) screens.toast(NOT_SENT);
  return ok;
}

function onGuestShopState(m) {
  const c = guest && guest.coop;
  if (!c || c.phase !== 'shop') return;
  const mine = m.p && m.p[mySlot];
  c.joined = Boolean(mine);
  if (mine) applyShopState(c.p, c.shop, mine);
  c.ready = Array.isArray(m.ready) ? m.ready : [];
  c.need = m.n || 0;
  if (Number.isFinite(m.left)) c.deadline = Date.now() + m.left;
  if ($('shop').hidden) screens.showOnly('shop'); // 연결이 끊겼다 돌아온 뒤 등
  c.ui.refresh();
}

// 엔딩: 과자성 장면 + 최종 점수 + 처음부터
function showEnding(score, rec) {
  stopIdle();
  screens.showEnding({ score, best: rec.score, newBest: rec.newScore, bestStage: rec.stage });
  const frame = (now) => {
    renderer.drawEnding(now, [mySlot]);
    endingRaf = requestAnimationFrame(frame);
  };
  endingRaf = requestAnimationFrame(frame);
}

function showMyResult(cleared, score) {
  const rec = record(score, world && mode !== 'guest' ? world.round : 1);
  screens.showResult({
    cleared, score, best: rec.score, newBest: rec.newScore,
    bestStage: rec.stage, newStage: rec.newStage, multi: mode !== 'solo',
  });
  startIdle();
}

// ===================================================================== 게스트
function startGuestGame() {
  sound.unlock();
  stopIdle();
  stopGames();
  input.reset();
  mode = 'guest';
  screens.hideAll();
  guest = {
    view: createGuestView(),
    local: { x: VIEW.W / 2, y: VIEW.H - PLAYER.RESPAWN_FROM_BOTTOM, lives: 1 }, // 내 비행기 (손가락으로 바로 움직임)
    lastSpawn: -1,
    bomb: false,
    cont: false,
    give: false,
    lastSend: 0,
    sentX: null,
    sentY: null,
    lastShot: 0,
    lastSnapAt: performance.now(), // 마지막으로 상태를 받은 시각 (끊김 감지용)
    paused: false,
    ended: false,
    raf: 0,
  };
  if (DEBUG) window.__guest = guest;
  guest.raf = requestAnimationFrame(guestFrame);
}

function onGuestSnapshot(msg) {
  if (!guest || guest.ended) return;
  const s = decodeSnapshot(msg);
  // 상점(클리어 결과) 중인데 게임이 다시 움직이는 상태가 옴 = 내가 끊긴 사이 상점이 끝남 → 게임으로
  if (guest.coop && s.state === 'play') onGuestShop({ open: false });
  guest.lastSnapAt = performance.now();
  guest.view.push(s, guest.lastSnapAt);
  renderer.addEvents(s.events);
  sound.handle(s.events, mySlot);
  const p = myPlayer(s.players);
  // 부활하면 방장이 정한 시작 위치로 맞춤
  if (p && p.spawn !== guest.lastSpawn) {
    guest.local.x = p.x;
    guest.local.y = p.y;
    guest.lastSpawn = p.spawn;
  }
  if (s.state === 'clear') { // 스테이지 클리어: 방장의 ev(결과)·shop(상점) 신호를 기다림
    guest.paused = true;
    screens.hideContinue();
    return;
  }
  if (s.state === 'over') {
    guest.ended = true;
    cancelAnimationFrame(guest.raf);
    screens.hideContinue();
    showMyResult(false, p ? p.score : 0);
  }
}

function guestFrame(now) {
  if (!guest) return;
  // 네트워크가 끊겨도 브라우저는 늦게 알아챔 → 상태가 3초간 안 오면 직접 끊고 다시 연결
  if (room && !room.recon && !guest.paused && now - guest.lastSnapAt > NETPLAY.STALE_MS) {
    room.conn.drop();
    reconnect(room);
  }
  const latest = guest.view.latest;
  const p = latest ? myPlayer(latest.players) : null;
  const alive = Boolean(p && p.lives > 0);
  if (p) guest.local.wingsLv = p.wingsLv; // 날쌘 날개 (내 비행기는 내 폰에서 움직이므로)
  const inp = input.read();
  if (alive && !guest.paused) {
    movePlayer(guest.local, inp);
    if (inp.bomb) guest.bomb = true;
    // 내 발사음은 내 폰에서 바로 (방장은 발사 사건을 보내지 않음)
    if (now - guest.lastShot >= 1000 / SHOT.RATE) { guest.lastShot = now; sound.handle([{ type: 'shot', slot: mySlot }], mySlot); }
  }

  // 초당 10회까지만, 바뀐 게 있을 때만 전송 (CLAUDE.md 규칙 8)
  if (latest && room && now - guest.lastSend >= 1000 / NETPLAY.INPUT_HZ) {
    const x = Math.round(guest.local.x);
    const y = Math.round(guest.local.y);
    if (x !== guest.sentX || y !== guest.sentY || guest.bomb || guest.cont || guest.give) {
      const msg = { t: 'in', x, y, k: guest.lastSpawn };
      if (guest.bomb) msg.b = 1;
      if (guest.cont) msg.c = 1;
      if (guest.give) msg.g = 1;
      room.conn.send(msg);
      guest.lastSend = now;
      guest.sentX = x;
      guest.sentY = y;
      guest.bomb = false;
      guest.cont = false;
      guest.give = false;
    }
  }

  // 이어하기를 누른 뒤 방장 응답(목숨 3)이 올 때까지는 다시 띄우지 않음
  if (alive) guest.contWait = false;
  if (p && p.lives === 0 && !p.spectator && !guest.contWait) screens.showContinue(Math.max(0, p.continueT));
  else screens.hideContinue();

  if (DEBUG) countFps(now);
  const view = guest.view.build(now, mySlot, alive ? guest.local : null);
  renderer.draw(view, now, { slot: mySlot, fps: DEBUG ? fps : 0 });
  guest.raf = requestAnimationFrame(guestFrame);
}

// ===================================================================== 게임방 (대기실)
async function openMulti() {
  if (!hasServer()) { screens.toast(OFFLINE_MESSAGE); return; }
  if (!friends.account) { friends.open(); return; } // 닉네임부터
  try {
    const { roomId } = await api('/api/rooms', { method: 'POST', token: friends.account.token });
    joinRoom(roomId);
  } catch (e) {
    screens.toast(e.message);
  }
}

function joinRoom(roomId) {
  stopGames();
  leaveRoom();
  mode = null;
  room = { id: roomId, conn: null, mySlot: 0, members: [], invited: new Set(), status: '게임방에 들어가는 중…', recon: null };
  if (DEBUG) window.__room = room;
  showRoom();
  openConn(room);
}

// 연결 하나 열기. 처리기는 '지금 연결'에서 온 이벤트만 처리 (예전 시도의 연결이 늦게 붙어도 무시)
function openConn(r) {
  if (r.conn) r.conn.close(); // 이전 연결·시도는 정리 (onClose 안 부름)
  const h = roomHandlers(r);
  const conn = connectRoom(r.id, friends.account.token, h);
  for (const k of Object.keys(h)) {
    const fn = h[k];
    h[k] = (...args) => { if (room === r && r.conn === conn) fn(...args); };
  }
  r.conn = conn;
}

// 연결이 끊겼을 때 서버가 자리를 지켜 주는 시간(게스트 15초·방장 30초) 안에 다시 연결
const FATAL_CLOSE = {
  4001: '게임방에 들어갈 수 없어요. (등록 정보 확인 실패)',
  4003: '다른 화면에서 이 게임방에 들어갔어요.',
  4004: '방이 꽉 찼어요. (최대 4명)',
  4005: '이미 게임이 시작된 방이에요.',
};

function reconnect(r) {
  if (room !== r) return;
  if (!r.recon) {
    const hold = mode === 'host' ? NETPLAY.HOST_HOLD_MS : NETPLAY.GUEST_HOLD_MS;
    r.recon = { attempt: 0, until: Date.now() + hold, timer: 0 };
    // 게임 중이면 멈추고 안내
    if (mode === 'host' && loop && loop.running) loop.pause();
    if (mode === 'guest' && guest) guest.paused = true;
    if (mode) screens.showPause('연결이 끊겼어요. 다시 연결하는 중…');
    else { r.status = '연결이 끊겼어요. 다시 연결하는 중…'; refreshRoom(); }
  }
  const rc = r.recon;
  const left = rc.until - Date.now();
  if (left <= 0) {
    exitWithNotice('연결이 끊겼어요', '다시 연결하지 못해서 게임에서 나왔어요. 인터넷 연결을 확인해 주세요.');
    return;
  }
  const delay = Math.min(backoffDelay(rc.attempt++, NET.ROOM_RETRY_BASE_MS, NET.ROOM_RETRY_MAX_MS), left);
  clearTimeout(rc.timer);
  rc.timer = setTimeout(() => { if (room === r) openConn(r); }, delay);
}

// 다시 연결됐을 때 이어서
function resumeAfterReconnect(r) {
  clearTimeout(r.recon.timer);
  r.recon = null;
  screens.toast('다시 연결됐어요.');
  if (mode === 'host' && world && loop && coop) {
    // 클리어 결과·상점 중이었으면 그 화면으로 (게임은 상점이 끝날 때 다시 움직임)
    if (coop.phase === 'shop') {
      screens.showOnly('shop');
      coop.ui.refresh();
      r.conn.send({ t: 'shop', open: true, left: coop.deadline - Date.now() });
      sendShopState();
    } else {
      screens.showOnly('stageclear');
    }
  } else if (mode === 'host' && world && loop) {
    if (!document.hidden) {
      screens.hideAll();
      r.conn.send({ t: 'resume' });
      loop.resume();
    }
  } else if (mode === 'guest' && guest && guest.coop) {
    guest.lastSnapAt = performance.now();
    screens.showOnly(guest.coop.phase === 'shop' ? 'shop' : 'stageclear');
    if (guest.coop.ui) guest.coop.ui.refresh();
  } else if (mode === 'guest' && guest) {
    guest.paused = false;
    guest.lastSnapAt = performance.now();
    screens.hideAll();
  } else {
    refreshRoom();
  }
}

function exitWithNotice(title, text) {
  stopGames();
  leaveRoom();
  mode = null;
  screens.showNotice(title, text, toTitle);
  startIdle();
}

const nickOf = (r, slot) => r.members.find((m) => m.slot === slot)?.nickname || `${slot}P`;

function roomHandlers(r) {
  return {
    onSeat(slot, members) {
      r.mySlot = slot;
      mySlot = slot;
      r.members = members;
      r.status = '';
      if (r.recon) resumeAfterReconnect(r);
      refreshRoom();
    },
    onMembers(members) {
      const gone = r.members.filter((m) => !members.some((n) => n.slot === m.slot));
      r.members = members;
      // 15초 안에 돌아오지 않아 자리에서 빠진 사람의 비행기는 제거
      if (mode === 'host' && world) {
        for (const m of gone) {
          const p = world.players.find((q) => q.slot === m.slot);
          if (p) { p.lives = 0; p.spectator = true; p.continueT = 0; }
        }
        // 상점 중이면 준비 인원이 바뀜 (돌아오지 않은 사람은 구매 없이 다음 스테이지에서 제외)
        if (coop && coop.phase === 'shop') { sendShopState(); checkShopDone(world); }
      }
      refreshRoom();
    },
    onFull() { screens.toast('방이 꽉 찼어요. (최대 4명)'); exitRoom(); },
    onError(err) {
      if (err === 'started' && r.recon) {
        exitWithNotice('게임에서 빠졌어요', '연결이 오래 끊겨서 자리가 정리됐어요.');
        return;
      }
      screens.toast(err === 'started' ? '이미 게임이 시작된 방이에요.' : '게임방에 들어갈 수 없어요.');
      exitRoom();
    },
    onStart() { if (r.mySlot !== 1) startGuestGame(); },
    onInput: onHostInput,
    onSnapshot: onGuestSnapshot,
    onPause() {
      if (!guest) return;
      guest.paused = true;
      screens.showPause('방장이 잠시 자리를 비웠어요. 기다려 주세요…');
    },
    onResume() {
      if (!guest || r.recon || guest.coop) return;
      guest.paused = false;
      guest.lastSnapAt = performance.now();
      screens.hideAll();
    },
    // 방장 연결이 끊김 → 30초 기다림
    onHostAway() {
      if (!guest) return;
      guest.paused = true;
      screens.showPause('방장 연결이 끊겼어요. 30초 동안 기다릴게요…');
    },
    onHostBack() { screens.toast('방장이 돌아왔어요.'); }, // 실제로 다시 움직이는 건 방장의 resume 때
    // (방장에게) 게스트 연결 끊김·돌아옴
    onAway(slot) { screens.toast(`${nickOf(r, slot)}님 연결이 끊겼어요. 15초 기다릴게요.`); },
    onBack(slot) {
      screens.toast(`${nickOf(r, slot)}님이 돌아왔어요.`);
      if (coop && coop.phase === 'shop') { // 돌아온 사람에게 상점을 다시 열어 줌
        r.conn.send({ t: 'shop', open: true, left: coop.deadline - Date.now() });
        sendShopState();
      }
    },
    onEvent: onGuestEvent,
    onShop: onGuestShop,
    onShopState: onGuestShopState,
    onShopRequest,
    onHostLeft() {
      if (room !== r) return;
      if (r.mySlot === 1) exitWithNotice('게임이 끝났어요', '오래 자리를 비워서 게임방이 닫혔어요.');
      else exitWithNotice('방장이 나갔어요', '방장이 30초 안에 돌아오지 않아 게임이 끝났어요.');
    },
    onClose(code) {
      if (room !== r) return;
      if (code === 4006) return; // 방 종료 (hostleft에서 처리)
      if (FATAL_CLOSE[code]) { exitWithNotice('게임방에서 나왔어요', FATAL_CLOSE[code]); return; }
      reconnect(r);
    },
  };
}

function showRoom() {
  screens.showOnly('room');
  refreshRoom();
  startIdle();
}

function refreshRoom() {
  if (!room || $('room').hidden) return;
  renderRoom({ members: room.members, mySlot: room.mySlot, friends: friends.friendList(), invited: room.invited, status: room.status });
}

function hostStart() {
  if (!room || room.mySlot !== 1) return;
  const slots = room.members.map((m) => m.slot);
  const seed = (Math.random() * 2 ** 31) | 0;
  room.invited.clear();
  mode = 'host';
  mySlot = 1;
  room.conn.send({ t: 'start', seed, slots });
  startLocalGame(slots, seed);
}

function inviteFriend(userId) {
  if (!room) return;
  if (friends.invite(userId, room.id)) {
    room.invited.add(userId);
    screens.toast('초대를 보냈어요.');
  } else {
    screens.toast(OFFLINE_MESSAGE);
  }
  refreshRoom();
}

function leaveRoom() {
  if (!room) return;
  const r = room;
  room = null;
  if (r.recon) clearTimeout(r.recon.timer);
  if (r.conn) r.conn.close();
}

function exitRoom() {
  stopGames();
  leaveRoom();
  mode = null;
  toTitle();
}

// ===================================================================== 공통 화면
function toTitle() {
  stopGames();
  world = null;
  if (room) leaveRoom();
  mode = null;
  const rec = loadRecords();
  screens.showTitle({ best: rec.score, bestStage: rec.stage, soundOn: sound.on, nickname: friends.account?.nickname });
  startIdle();
}

// 온라인 기능 (등록·친구·초대). 서버가 없어도 혼자 하기는 그대로 동작
const friends = createFriends({
  onBack: toTitle,
  onAccountChange: (a) => screens.setNickname(a?.nickname),
  onInvited: (from, roomId) => showInvite(from, () => joinRoom(roomId)),
  onFriendsChange: () => refreshRoom(),
});

// 앱을 내리면 자동 일시정지 (방장이면 게스트도 함께 멈춤)
function pauseGame() {
  if (mode === 'guest' || !world || !loop || !loop.running) return;
  if (world.state === 'over' || world.state === 'clear') return;
  loop.pause();
  if (mode === 'host' && room) room.conn.send({ t: 'pause' });
  screens.showPause();
}
function resumeGame() {
  if (mode === 'guest' || !world || !loop || loop.running) return;
  if (room && room.recon) return; // 다시 연결되면 자동으로 이어짐
  sound.unlock();
  input.reset();
  screens.hideAll();
  if (mode === 'host' && room) room.conn.send({ t: 'resume' });
  loop.resume();
}

screens.bindButtons({
  solo: startSolo,
  multi: openMulti,
  friends: () => friends.open(),
  sound: () => { sound.unlock(); screens.setSoundLabel(sound.toggle()); },
  cont: () => {
    if (mode === 'guest' && guest) { guest.cont = true; guest.contWait = true; screens.hideContinue(); return; }
    if (world && continueGame(world, mySlot)) screens.hideContinue();
  },
  giveUp: () => {
    if (mode === 'guest' && guest) { guest.give = true; return; }
    if (world) giveUp(world, mySlot);
  },
  resume: resumeGame,
  again: () => { if (room) { stopGames(); mode = null; showRoom(); } else startSolo(); },
  endAgain: startSolo, // 엔딩 → 처음부터
  toTitle: () => (room ? exitRoom() : toTitle()),
});
bindRoom({ onStart: hostStart, onLeave: exitRoom, onInvite: inviteFriend });

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
  if (world && loop && !loop.running) renderer.draw(world, performance.now(), { slot: mySlot });
});

renderer.resize();
if (params.get('preview') === 'chars') {
  // 캐릭터 미리보기 (?preview=chars): 메뉴·온라인 기능 없이 그림만
  startPreview(canvas); // 화면 크기 변경은 아래 resize 처리기가 그대로 맞춤
} else {
  toTitle();
  // 카톡 안 브라우저면 Chrome 안내를 먼저. 그 외에는 초대 링크(?inv=)·첫 등록 처리
  if (isKakaoInApp()) showKakaoGuide(() => friends.start());
  else friends.start();
}

// PWA: 오프라인 캐시 (서비스워커). 실패해도 게임은 동작
// 새 버전을 받아 두면 "새 버전이 있어요 [새로고침]" → 누르면 교체 후 다시 열기
if ('serviceWorker' in navigator) {
  let updateRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const offer = (w) => {
        if (!w || !navigator.serviceWorker.controller) return; // 처음 설치는 안내 없음
        screens.showUpdate(() => {
          updateRequested = true;
          w.postMessage({ type: 'SKIP_WAITING' });
        });
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // 앱을 다시 열 때마다 새 버전 확인
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => { /* 무시 */ });
  });
}
