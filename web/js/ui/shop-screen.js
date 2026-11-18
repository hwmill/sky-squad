// 상점 화면 (SPEC-v2 3장 상점 흐름). 판정은 game/shop.js, 여기는 보여 주기와 버튼만
// - 상품 카드 7개(2열). 살 수 없는 상품은 회색 + 이유
// - 실수 방지: 카드를 누르면 아래에 "구매" 버튼이 한 번 더 뜸
// - 상점을 나가기 전까지 마지막 구매 "되돌리기"
// - 같이 하기(9단계): 게스트는 방장에게 요청만 보내고, 방장이 보낸 결과로 화면을 다시 그림
import { SHOP } from '../game/rules.js';
import { openShop, itemState, buy, undo, itemById } from '../game/shop.js';
import { playerChar } from '../game/sprites.js';
import { showOnly, toast } from './screens.js';

const $ = (id) => document.getElementById(id);

// 지금 가진 정도 (카드 아래 작은 글씨)
function levelText(p, id) {
  switch (id) {
    case 'power': return `지금 ${p.power}단계`;
    case 'rapid': return `${p.rapidLv} / ${itemById('rapid').prices.length}회`;
    case 'wings': return `${p.wingsLv} / ${itemById('wings').prices.length}회`;
    case 'bomb': return `지금 ${p.bombs}개`;
    case 'life': return `지금 ${p.lives}개`;
    case 'shield': return p.shieldNext ? '준비됨' : '';
    case 'magnet': return p.magnetBig ? '가지고 있음' : '';
    default: return '';
  }
}

// 혼자 하기용 컨트롤러: 이 폰에서 바로 판정
export function localShop(p, { onBuy, onDone }) {
  const shop = openShop();
  return {
    player: () => p,
    shop: () => shop,
    buy(id) { const r = buy(shop, p, id); if (r.ok && onBuy) onBuy(id); return r; },
    undo: () => undo(shop, p),
    next: onDone,
    nextLabel: () => '다음 스테이지로 ▶',
    locked: () => false,
  };
}

// ctrl: {
//   player(), shop()  화면에 보여 줄 플레이어·상점 (게스트는 방장이 보낸 상태로 만든 사본)
//   buy(id)           → { ok, reason } (바로 판정) 또는 null (방장 판정을 기다림)
//   undo()            → 되돌린 상품 id 또는 null (방장 판정이면 null)
//   next()            혼자: 다음 스테이지 / 같이: 준비 완료
//   nextLabel()       아래 버튼 글자 (남은 시간·준비 인원)
//   locked()          준비 완료를 누른 뒤에는 더 사지 못함
// }
// 돌려주는 값: { refresh() 다시 그리기, close() 타이머 정리 }
export function openShopScreen(ctrl) {
  let selected = null;

  function render() {
    const p = ctrl.player();
    const shop = ctrl.shop();
    const locked = ctrl.locked();
    $('shopWho').textContent = `${playerChar(p.slot).name}의 코인`;
    $('shopCoins').textContent = `🪙 ${p.coins.toLocaleString('ko-KR')}`;
    const ul = $('shopItems');
    ul.replaceChildren();
    for (const it of SHOP.ITEMS) {
      const st = locked ? { price: itemState(shop, p, it.id).price, canBuy: false, reason: '준비 완료' } : itemState(shop, p, it.id);
      if (selected === it.id && !st.canBuy) selected = null;
      const li = document.createElement('li');
      li.className = `item${st.canBuy ? '' : ' off'}${selected === it.id ? ' sel' : ''}`;
      const name = document.createElement('b');
      name.textContent = it.name;
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = it.desc;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = st.canBuy ? `🪙 ${st.price}` : st.reason;
      const lv = document.createElement('span');
      lv.className = 'lv';
      lv.textContent = levelText(p, it.id);
      li.append(name, desc, price, lv);
      li.onclick = () => {
        if (!st.canBuy) { toast(st.reason); return; }
        selected = selected === it.id ? null : it.id;
        render();
      };
      ul.append(li);
    }
    const buyBtn = $('btnShopBuy');
    buyBtn.hidden = !selected;
    if (selected) buyBtn.textContent = `‘${itemById(selected).name}’ 구매 (🪙 ${itemState(shop, p, selected).price})`;
    const last = shop.history[shop.history.length - 1];
    $('btnShopUndo').hidden = !last || locked;
    if (last) $('btnShopUndo').textContent = `↩ 되돌리기 (${itemById(last.id).name})`;
    renderNext();
  }

  function renderNext() {
    const btn = $('btnShopNext');
    btn.textContent = ctrl.nextLabel();
    btn.disabled = ctrl.locked();
  }

  $('btnShopBuy').onclick = () => {
    if (!selected) return;
    const id = selected;
    selected = null;
    const r = ctrl.buy(id);
    if (r) toast(r.ok ? `${itemById(id).name}을(를) 샀어요!` : r.reason);
    render();
  };
  $('btnShopUndo').onclick = () => {
    const id = ctrl.undo();
    if (id) toast(`${itemById(id).name} 구매를 되돌렸어요.`);
    render();
  };
  $('btnShopNext').onclick = () => {
    if (ctrl.locked()) return;
    ctrl.next();
    render();
  };

  render();
  showOnly('shop');
  const timer = setInterval(renderNext, 500); // 남은 시간 표시
  return {
    refresh: render,
    close() { clearInterval(timer); $('btnShopNext').onclick = null; },
  };
}

// 클리어 결과 화면 (SHOP.RESULT_SECONDS초 뒤 then(), then이 없으면 그대로 둠 — 같이 하기 게스트는 방장 신호를 기다림)
export function showStageClear({ round, score, stageCoins, nomiss, best, newBest }, then) {
  $('scTitle').textContent = `STAGE ${round} 클리어!`;
  $('scScore').textContent = score.toLocaleString('ko-KR');
  $('scCoins').textContent = `얻은 코인 🪙 +${stageCoins.toLocaleString('ko-KR')}`;
  $('scNomiss').textContent = nomiss ? '✨ 노미스 보너스 +50 포함!' : '';
  $('scBest').textContent = newBest ? '🎉 최고 점수 갱신!' : `최고 점수 ${best.toLocaleString('ko-KR')}`;
  showOnly('stageclear');
  return then ? setTimeout(then, SHOP.RESULT_SECONDS * 1000) : 0;
}
