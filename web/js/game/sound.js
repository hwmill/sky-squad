// 효과음: 소리 파일 없이 WebAudio로 직접 합성한다.
// 브라우저 정책상 첫 터치 이후에만 소리가 난다 (unlock).
const STORE_KEY = 'sky:sound';
const SHOT_GAP = 0.11; // 발사음 최소 간격(초) — 너무 시끄럽지 않게

function load(key, d) { try { const v = localStorage.getItem(key); return v === null ? d : v; } catch { return d; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch { /* 저장 불가 */ } }

export function createSound() {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let on = load(STORE_KEY, '1') === '1';
  let lastShot = 0;

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      // 폭발음용 잡음 (1초)
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  // 음 하나: 주파수 f0 → f1로 미끄러지며 dur초 동안
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, cutoff) {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  const fx = {
    shot() {
      if (ac.currentTime - lastShot < SHOT_GAP) return;
      lastShot = ac.currentTime;
      tone('square', 1200, 700, 0.04, 0.025);
    },
    explode(size) { noise(0.18 + 0.2 * size, 0.18 + 0.12 * size, 1800 - 400 * size); },
    hit() { tone('sawtooth', 500, 60, 0.6, 0.18); noise(0.5, 0.25, 1200); },
    bomb() { noise(1.0, 0.45, 900); tone('sine', 160, 40, 0.9, 0.35); },
    powerup() { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.09, 0.12, i * 0.07)); },
    boss() { for (let i = 0; i < 3; i++) { tone('square', 440, 440, 0.18, 0.08, i * 0.45); tone('square', 330, 330, 0.18, 0.08, i * 0.45 + 0.2); } },
    bossDown() { noise(1.4, 0.5, 1500); tone('sine', 220, 30, 1.3, 0.3); },
    clear() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.14, i * 0.15)); },
    gameover() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.12, i * 0.25)); },
  };

  // 게임 사건 목록을 받아 해당 소리를 낸다. mySlot: 내 비행기 발사음만 내기
  function handle(events, mySlot = 1) {
    if (!on || !ac || ac.state !== 'running') return;
    for (const ev of events) {
      switch (ev.type) {
        case 'shot': if (ev.slot === mySlot) fx.shot(); break;
        case 'explode': fx.explode(ev.size || 1); break;
        case 'hit': fx.hit(); break;
        case 'bomb': fx.bomb(); break;
        case 'powerup': fx.powerup(); break;
        case 'boss': fx.boss(); break;
        case 'bossDown': fx.bossDown(); break;
        case 'clear': fx.clear(); break;
        case 'gameover': fx.gameover(); break;
        default: break;
      }
    }
  }

  return {
    unlock,
    handle,
    get on() { return on; },
    toggle() {
      on = !on;
      save(STORE_KEY, on ? '1' : '0');
      return on;
    },
  };
}
