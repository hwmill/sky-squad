// 화면 전환: 타이틀, 컨티뉴(10초), 일시정지, 결과. index.html의 .screen 요소를 보이고 숨긴다
const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'continue', 'pause', 'result'];

export function showOnly(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
}

export function hideAll() {
  showOnly(null);
}

export function showTitle({ best, soundOn }) {
  $('titleBest').textContent = best ? `최고 점수 ${best.toLocaleString('ko-KR')}` : '';
  setSoundLabel(soundOn);
  showOnly('title');
}

export function setSoundLabel(on) {
  $('btnSound').textContent = on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
}

// 숫자만 바꾸고, 이미 보이는 중이면 다시 그리지 않음
export function showContinue(seconds) {
  $('continueCount').textContent = String(seconds);
  if ($('continue').hidden) showOnly('continue');
}

export function hideContinue() {
  if (!$('continue').hidden) $('continue').hidden = true;
}

export function showPause() {
  showOnly('pause');
}

export function showResult({ cleared, score, best, newBest }) {
  $('resultTitle').textContent = cleared ? '스테이지 클리어!' : '게임 오버';
  $('resultScore').textContent = score.toLocaleString('ko-KR');
  $('resultBest').textContent = newBest ? '🎉 최고 점수 갱신!' : `최고 점수 ${best.toLocaleString('ko-KR')}`;
  showOnly('result');
}

// 버튼 연결: handlers = { solo, sound, cont, giveUp, resume, again, toTitle }
export function bindButtons(h) {
  $('btnSolo').onclick = h.solo;
  $('btnSound').onclick = h.sound;
  $('btnContinue').onclick = h.cont;
  $('btnGiveUp').onclick = h.giveUp;
  $('pause').onclick = h.resume;
  $('btnAgain').onclick = h.again;
  $('btnTitle').onclick = h.toTitle;
}
