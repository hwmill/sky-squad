// 대기실 화면 (1P~4P 자리, 친구 초대, 방장만 시작) + 초대 알림 팝업
import { TEAM } from '../game/rules.js';

const $ = (id) => document.getElementById(id);
// 1P 파랑, 2P 빨강, 3P 초록, 4P 노랑 (render.js와 같은 색)
const SLOT_COLOR = ['#4da3ff', '#ff5b5b', '#5fd068', '#ffd23f'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// state: { members, mySlot, friends: [{userId, nickname, online}], invited: Set, status }
export function renderRoom({ members, mySlot, friends, invited, status }) {
  const isHost = mySlot === 1;
  const bySlot = new Map(members.map((m) => [m.slot, m]));
  let html = '';
  for (let s = 1; s <= TEAM.MAX_PLAYERS; s++) {
    const m = bySlot.get(s);
    html += `<li style="--c:${SLOT_COLOR[s - 1]}">
      <span class="slot">${s}P</span>
      <span class="sname">${m ? esc(m.nickname) : '<i>비어 있음</i>'}</span>
      ${m && s === 1 ? '<span class="tag">방장</span>' : ''}${m && s === mySlot ? '<span class="tag me">나</span>' : ''}
    </li>`;
  }
  $('slots').innerHTML = html;
  $('roomStatus').textContent = status || (isHost ? '친구를 초대하고 시작을 누르세요.' : '방장이 시작하기를 기다리는 중…');

  $('btnStart').hidden = !isHost;
  $('roomInviteBox').hidden = !isHost;
  if (isHost) {
    const inRoom = new Set(members.map((m) => m.userId));
    const full = members.length >= TEAM.MAX_PLAYERS;
    const list = friends.filter((f) => !inRoom.has(f.userId));
    $('roomFriends').innerHTML = list.length
      ? list.map((f) => `<li>
          <span class="dot ${f.online ? 'on' : ''}"></span>
          <span class="fname">${esc(f.nickname)}</span>
          <button class="small" data-invite="${esc(f.userId)}" ${!f.online || full || invited.has(f.userId) ? 'disabled' : ''}>
            ${invited.has(f.userId) ? '초대함' : f.online ? '초대' : '접속 끊김'}</button>
        </li>`).join('')
      : '<li class="empty">초대할 친구가 없어요. 먼저 친구를 맺어 주세요.</li>';
  }
}

export function bindRoom({ onStart, onLeave, onInvite }) {
  $('btnStart').onclick = onStart;
  $('btnLeaveRoom').onclick = onLeave;
  $('roomFriends').onclick = (e) => {
    const b = e.target.closest('button[data-invite]');
    if (b && !b.disabled) onInvite(b.dataset.invite);
  };
}

// 친구가 초대했을 때 뜨는 팝업
export function showInvite(from, onAccept) {
  $('inviteText').textContent = `${from.nickname}님이 같이 하자고 해요!`;
  $('invite').hidden = false;
  $('btnInviteAccept').onclick = () => { $('invite').hidden = true; onAccept(); };
  $('btnInviteDecline').onclick = () => { $('invite').hidden = true; };
}
