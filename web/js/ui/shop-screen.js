// 상점 화면 (SPEC-v2 3장 상점 흐름). 판정은 game/shop.js, 여기는 보여 주기와 버튼만
// - 상품 카드 7개(2열). 살 수 없는 상품은 회색 + 이유
// - 실수 방지: 카드를 누르면 아래에 "구매" 버튼이 한 번 더 뜸
// - 상점을 나가기 전까지 마지막 구매 "되돌리기"
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

// p: 내 플레이어, onBuy(id): 소리 등, onDone(): 다음 스테이지로
export function openShopScreen(p, { onBuy, onDone }) {
  const shop = openShop();
  let selected = null;

  function render() {
    $('shopWho').textContent = `${playerChar(p.slot).name}의 코인`;
    $('shopCoins').textContent = `🪙 ${p.coins.toLocaleString('ko-KR')}`;
    const ul = $('shopItems');
    ul.replaceChildren();
    for (const it of SHOP.ITEMS) {
      const st = itemState(shop, p, it.id);
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
    if (selected) {
      buyBtn.hidden = false;
      buyBtn.textContent = `‘${itemById(selected).name}’ 구매 (🪙 ${itemState(shop, p, selected).price})`;
    } else {
      buyBtn.hidden = true;
    }
    const last = shop.history[shop.history.length - 1];
    $('btnShopUndo').hidden = !last;
    if (last) $('btnShopUndo').textContent = `↩ 되돌리기 (${itemById(last.id).name})`;
  }

  $('btnShopBuy').onclick = () => {
    if (!selected) return;
    const id = selected;
    const r = buy(shop, p, id);
    selected = null;
    if (r.ok) { toast(`${itemById(id).name}을(를) 샀어요!`); if (onBuy) onBuy(id); } else toast(r.reason);
    render();
  };
  $('btnShopUndo').onclick = () => {
    const id = undo(shop, p);
    if (id) toast(`${itemById(id).name} 구매를 되돌렸어요.`);
    render();
  };
  $('btnShopNext').onclick = () => {
    $('btnShopNext').onclick = null; // 두 번 눌림 방지
    onDone();
  };

  render();
  showOnly('shop');
}

// 클리어 결과 화면 (SHOP.RESULT_SECONDS초 뒤 then())
export function showStageClear({ round, score, stageCoins, nomiss, best, newBest }, then) {
  $('scTitle').textContent = `${round}번째 클리어!`;
  $('scScore').textContent = score.toLocaleString('ko-KR');
  $('scCoins').textContent = `얻은 코인 🪙 +${stageCoins.toLocaleString('ko-KR')}`;
  $('scNomiss').textContent = nomiss ? '✨ 노미스 보너스 +50 포함!' : '';
  $('scBest').textContent = newBest ? '🎉 최고 점수 갱신!' : `최고 점수 ${best.toLocaleString('ko-KR')}`;
  showOnly('stageclear');
  return setTimeout(then, SHOP.RESULT_SECONDS * 1000);
}
