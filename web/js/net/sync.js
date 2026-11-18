// 같이 하기 동기화: 방장 세계 → 짧은 스냅샷, 게스트는 스냅샷 사이를 보간해서 그린다.
// 화면(DOM)을 쓰지 않으므로 Node에서 테스트할 수 있다.
import { SHOT, ENEMY, NETPLAY } from '../game/rules.js';

const STATES = ['play', 'continue', 'over', 'clear'];
const ETYPES = ['s1', 's2', 'm1', 's3', 'm2']; // 뒤에만 추가 (번호가 바뀌지 않게)
const BKINDS = ['pudding', 'octopus', 'waffleShip', 'cottonStorm', 'cakeKing'];
const UKINDS = ['P', 'B', '1UP'];
const r = Math.round;
const DEG = Math.PI / 180;

// 방장: 세계 → {t:"st", ...} (숫자는 반올림한 짧은 배열)
// events: 지난 스냅샷 이후의 효과 사건 (폭발·보스 등장 등, 발사음 제외). 따로 보내지 않고 함께 실어 메시지 수를 줄인다
export function encodeSnapshot(world, events = []) {
  const shots = [];
  for (const s of world.shots.list) shots.push(r(s.x), r(s.y), r(Math.atan2(s.vx, -s.vy) / DEG));
  const eshots = [];
  for (const b of world.eshots.list) eshots.push(r(b.x), r(b.y), r(b.vx), r(b.vy));
  const b = world.boss;
  return {
    t: 'st',
    f: world.frame,
    s: STATES.indexOf(world.state),
    p: world.players.map((p) => [
      p.slot, r(p.x), r(p.y), p.lives, p.bombs, p.power, p.score,
      r(p.invuln * 10), p.bombT > 0 ? 1 : 0, Math.ceil(p.continueT), p.spectator ? 1 : 0, p.spawn,
    ]),
    e: world.enemies.filter((e) => !e.dead).map((e) => [e.id, ETYPES.indexOf(e.type), r(e.x), r(e.y), r((100 * e.hp) / e.maxHp), e.hitT > 0 ? 1 : 0]),
    b: b && !b.dead ? [r(b.x), r(b.y), r((100 * b.hp) / b.maxHp), b.phase, b.entering ? 1 : 0, b.hitT > 0 ? 1 : 0, Math.max(0, BKINDS.indexOf(b.kind))] : 0,
    u: world.powerups.map((u) => [UKINDS.indexOf(u.kind), r(u.x), r(u.y)]),
    m: shots,
    q: eshots,
    v: events,
  };
}

// 게스트: 스냅샷 → 읽기 쉬운 객체
export function decodeSnapshot(m) {
  const shots = [];
  for (let i = 0; i + 2 < m.m.length; i += 3) shots.push({ x: m.m[i], y: m.m[i + 1], a: m.m[i + 2] });
  const eshots = [];
  for (let i = 0; i + 3 < m.q.length; i += 4) eshots.push({ x: m.q[i], y: m.q[i + 1], vx: m.q[i + 2], vy: m.q[i + 3] });
  return {
    frame: m.f,
    state: STATES[m.s] || 'play',
    players: m.p.map((a) => ({
      slot: a[0], x: a[1], y: a[2], lives: a[3], bombs: a[4], power: a[5], score: a[6],
      invuln: a[7] / 10, bombT: a[8], continueT: a[9], spectator: a[10] === 1, spawn: a[11],
    })),
    enemies: m.e.map((a) => ({ id: a[0], type: ETYPES[a[1]], x: a[2], y: a[3], hp: a[4], hit: a[5] })),
    boss: m.b ? { x: m.b[0], y: m.b[1], hp: m.b[2], phase: m.b[3], entering: m.b[4] === 1, hit: m.b[5], kind: BKINDS[m.b[6]] || 'pudding' } : null,
    powerups: m.u.map((a) => ({ kind: UKINDS[a[0]], x: a[1], y: a[2] })),
    shots,
    eshots,
    events: Array.isArray(m.v) ? m.v : [],
  };
}

const lerp = (a, b, k) => a + (b - a) * k;

// 게스트 화면용: 받은 스냅샷을 모아 두고, 그릴 시각에 맞는 '세계 모양' 객체를 만든다 (render.js가 그대로 그림)
export function createGuestView() {
  const buf = []; // { t: 받은 시각(ms), snap }

  function push(snap, t) {
    buf.push({ t, snap });
    while (buf.length > NETPLAY.BUFFER) buf.shift();
  }

  // localMe: 내 비행기 위치 {x, y} (내 손가락 입력으로 바로 움직이는 값), mySlot: 내 자리
  function build(now, mySlot, localMe) {
    if (!buf.length) return null;
    const rt = now - NETPLAY.INTERP_DELAY_MS;
    // rt를 감싸는 두 스냅샷 A ≤ rt ≤ B. 없으면 가장 최근 것 하나로
    let A = buf[0];
    let B = null;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= rt && rt <= buf[i + 1].t) { A = buf[i]; B = buf[i + 1]; break; }
    }
    if (!B && rt > buf[buf.length - 1].t) A = buf[buf.length - 1];
    const k = B ? (rt - A.t) / Math.max(1, B.t - A.t) : 0;
    const sa = A.snap;
    const sb = B ? B.snap : null;
    const latest = buf[buf.length - 1].snap;

    // 적: 같은 번호끼리 보간 (B에만 있는 새 적은 B 위치, A에만 있는(사라진) 적은 그리지 않음)
    const enemies = [];
    const src = sb ? sb.enemies : sa.enemies;
    for (const e of src) {
      const prev = sb ? sa.enemies.find((q) => q.id === e.id) : null;
      const x = prev ? lerp(prev.x, e.x, k) : e.x;
      const y = prev ? lerp(prev.y, e.y, k) : e.y;
      enemies.push({ id: e.id, type: e.type, x, y, r: ENEMY[e.type].r, hp: e.hp, maxHp: 100, hitT: e.hit ? 1 : 0, dead: false });
    }

    let boss = null;
    const bb = sb ? sb.boss : sa.boss;
    if (bb) {
      const ba = sb && sa.boss ? sa.boss : null;
      boss = {
        x: ba ? lerp(ba.x, bb.x, k) : bb.x, y: ba ? lerp(ba.y, bb.y, k) : bb.y,
        hp: bb.hp, maxHp: 100, phase: bb.phase, entering: bb.entering, hitT: bb.hit ? 1 : 0, dead: false, kind: bb.kind,
      };
    }

    // 총알: A 시점 위치에서 속도로 앞당겨 그림 (번호가 없어서 짝 맞추기 대신)
    const age = Math.max(0, (rt - A.t) / 1000);
    const shots = sa.shots.map((s) => {
      const vx = Math.sin(s.a * DEG) * SHOT.SPEED;
      const vy = -Math.cos(s.a * DEG) * SHOT.SPEED;
      return { x: s.x + vx * age, y: s.y + vy * age, vx, vy };
    });
    const eshots = sa.eshots.map((b) => ({ x: b.x + b.vx * age, y: b.y + b.vy * age, vx: b.vx, vy: b.vy }));

    const powerups = sb && sb.powerups.length === sa.powerups.length
      ? sb.powerups.map((u, i) => ({ kind: u.kind, x: lerp(sa.powerups[i].x, u.x, k), y: lerp(sa.powerups[i].y, u.y, k) }))
      : sa.powerups.map((u) => ({ ...u }));

    // 플레이어: 위치는 보간, 목숨·점수 등은 가장 최근 값. 내 비행기는 내 입력 위치
    const players = latest.players.map((p) => {
      const pa = sa.players.find((q) => q.slot === p.slot);
      const pb = sb ? sb.players.find((q) => q.slot === p.slot) : null;
      let x = p.x;
      let y = p.y;
      if (pa && pb && pa.spawn === pb.spawn) { x = lerp(pa.x, pb.x, k); y = lerp(pa.y, pb.y, k); } else if (pa) { x = pa.x; y = pa.y; }
      if (p.slot === mySlot && localMe) { x = localMe.x; y = localMe.y; }
      return { ...p, x, y };
    });

    return {
      state: latest.state,
      players,
      enemies,
      boss,
      powerups,
      shots: { list: shots },
      eshots: { list: eshots },
      events: [],
    };
  }

  return { push, build, get latest() { return buf.length ? buf[buf.length - 1].snap : null; }, clear() { buf.length = 0; } };
}
