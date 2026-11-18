// 시작점: 화면 흐름과 게임 방식 관리
// - 혼자 하기(solo): 이 폰에서 계산·그리기
// - 같이 하기 방장(host): 이 폰이 게임 전체를 계산하고 초당 15회 상태를 보냄
// - 같이 하기 게스트(guest): 상태를 받아 보간해서 그리고, 내 비행기 위치를 초당 10회 보냄
import { createWorld, startLoop, continueGame, giveUp, nextRound } from './game/engine.js';
import { openShopScreen, showStageClear } from './ui/shop-screen.js';
import { createRenderer } from './game/render.js';
import { createInput } from './game/input.js';
import { createSound } from './game/sound.js';
import { movePlayer } from './game/player.js';
import { VIEW, PLAYER, SHOT, STAGE1, NETPLAY } from './game/rules.js';
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

const BEST_KEY = 'sky:best';
const params = new URLSearchParams(location.search);
// 개발 모드 (?debug=1): FPS 표시. &boss=1 이면 보스 직전부터 시작, 콘솔에서 window.__world로 상태 확인
const DEBUG = params.get('debug') === '1';
const DEBUG_BOSS = DEBUG && params.get('boss') === '1';
const DEBUG_BOSS_LEAD = 3; // 보스 등장 몇 초 전부터
// 개발 모드 &coins=500: 혼자 하기를 코인 500개로 시작 (상점 확인용)
const DEBUG_COINS = DEBUG ? Number(params.get('coins')) || 0 : 0;
// 개발 모드 &power=8: 총알 단계를 정해서 시작 (보스 처치 시간 확인용)
const DEBUG_POWER = DEBUG ? Math.min(PLAYER.MAX_POWER, Math.max(0, Math.floor(Number(params.get('power')) || 0))) : 0;
const NO_INPUT = { dx: 0, dy: 0, bomb: false };

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* 저장 불가 */ } }
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
  world = createWorld({ slots, seed, economy: mode === 'solo' }); // 코인·상점은 혼자 하기만 (같이 하기는 9단계)
  if (DEBUG_COINS && mode === 'solo') world.players[0].coins = DEBUG_COINS;
  if (DEBUG_POWER) for (const p of world.players) p.power = DEBUG_POWER;
  if (DEBUG_BOSS) {
    world.stage.t = STAGE1.BOSS_AT - DEBUG_BOSS_LEAD;
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
  if (mode === 'host' && room) {
    sendSnapshot(true);
    room.conn.send({ t: 'end' }); // 서버: 다시 시작할 수 있게
  }
  showMyResult(w.state === 'clear', myPlayer(w.players)?.score || 0);
}

// 혼자 하기 클리어: 결과 3초 → 상점 → 다음 스테이지 (7단계: 스테이지 1을 난이도 +1로 다시)
function stageClear(w) {
  const p = myPlayer(w.players);
  const best = loadBest();
  const newBest = p.score > best;
  if (newBest) saveBest(p.score);
  stageClearTimer = showStageClear({
    round: w.round,
    score: p.score,
    stageCoins: p.stageCoins,
    nomiss: !p.missed,
    best: Math.max(best, p.score),
    newBest,
  }, () => {
    if (world !== w || !loop) return;
    openShopScreen(p, {
      onBuy: () => {
        sound.handle([{ type: 'powerup' }], mySlot);
        renderer.draw(w, performance.now(), { slot: mySlot }); // 뒤 화면의 코인 수도 갱신
      },
      onDone: () => {
        if (world !== w || !loop) return;
        nextRound(w);
        input.reset();
        screens.hideAll();
        loop.resume();
        screens.toast(`${w.round}번째 스테이지! 적이 조금 더 단단해졌어요`);
      },
    });
  });
}

function showMyResult(cleared, score) {
  const best = loadBest();
  const newBest = score > best;
  if (newBest) saveBest(score);
  screens.showResult({ cleared, score, best: Math.max(best, score), newBest, multi: mode !== 'solo' });
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
  if (s.state === 'over' || s.state === 'clear') {
    guest.ended = true;
    cancelAnimationFrame(guest.raf);
    screens.hideContinue();
    showMyResult(s.state === 'clear', p ? p.score : 0);
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
  if (mode === 'host' && world && loop) {
    if (!document.hidden) {
      screens.hideAll();
      r.conn.send({ t: 'resume' });
      loop.resume();
    }
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
      if (!guest || r.recon) return;
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
    onBack(slot) { screens.toast(`${nickOf(r, slot)}님이 돌아왔어요.`); },
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
  screens.showTitle({ best: loadBest(), soundOn: sound.on, nickname: friends.account?.nickname });
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
