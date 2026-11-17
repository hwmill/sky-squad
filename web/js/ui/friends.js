// 온라인 기능 화면: 닉네임 등록, 친구 목록(접속 표시), 친구 초대·삭제, 초대 링크(?inv=) 처리
import { api, hasServer, loadAccount, saveAccount, clearAccount } from '../net/api.js';
import { createLobby } from '../net/lobby.js';
import { SITE_URL, OFFLINE_MESSAGE } from '../config.js';
import { showOnly, toast } from './screens.js';

const $ = (id) => document.getElementById(id);
const NICK_RE = /^[가-힣A-Za-z0-9]{1,8}$/; // 서버와 같은 규칙 (1~8자, 한글·영문·숫자)
const LATER_KEY = 'sky:regLater';

function getLater() { try { return localStorage.getItem(LATER_KEY) === '1'; } catch { return false; } }
function setLater() { try { localStorage.setItem(LATER_KEY, '1'); } catch { /* 무시 */ } }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// onBack: 타이틀로 / onAccountChange(account|null): 타이틀 인사말 갱신
export function createFriends({ onBack, onAccountChange }) {
  let account = loadAccount();
  let pendingInvite = null;
  let regMode = 'register'; // 'register' | 'rename'
  let lobbyUp = false;
  let restFailed = false;
  const friends = new Map(); // userId → { userId, nickname, online }

  const lobby = createLobby({
    onReady(list) { friends.clear(); for (const f of list) friends.set(f.userId, f); renderList(); },
    onPresence(id, online) { const f = friends.get(id); if (f) { f.online = online; renderList(); } },
    onFriend(f) { friends.set(f.userId, f); renderList(); },
    onUnfriend(id) { friends.delete(id); renderList(); },
    onStatus(up) { lobbyUp = up; if (up) restFailed = false; renderStatus(); },
    onAuthFail() {
      // 서버에 내 계정이 없음 (서버 데이터 초기화 등) → 다시 등록하게
      clearAccount();
      account = null;
      friends.clear();
      onAccountChange(null);
      toast('등록 정보를 찾을 수 없어요. 닉네임을 다시 정해 주세요.');
    },
  });

  // ------------------------------------------------------------ 시작
  // 반환값: 등록 화면을 띄웠으면 true
  function start() {
    const params = new URLSearchParams(location.search);
    const inv = params.get('inv');
    if (inv) {
      // 주소에서 초대 코드를 지워 둠 (새로고침해도 다시 처리되지 않게)
      params.delete('inv');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
    }
    if (account && hasServer()) lobby.connect(account.token);
    if (inv) return handleInvite(inv);
    if (!account && hasServer() && !getLater()) {
      showRegister('register');
      return true;
    }
    return false;
  }

  function handleInvite(code) {
    if (!hasServer()) { toast(OFFLINE_MESSAGE); return false; }
    if (account) { acceptInvite(code); return false; }
    pendingInvite = code;
    showRegister('invite');
    return true;
  }

  async function acceptInvite(code) {
    try {
      const { friend } = await api('/api/friends/accept', { method: 'POST', token: account.token, body: { inviteCode: code } });
      friends.set(friend.userId, friend);
      renderList();
      toast(`${friend.nickname}님과 친구가 됐어요`);
    } catch (e) {
      toast(e.message);
    }
  }

  // ------------------------------------------------------------ 닉네임 등록·변경
  function showRegister(mode) {
    regMode = mode === 'rename' ? 'rename' : 'register';
    $('regTitle').textContent = regMode === 'rename' ? '닉네임 바꾸기' : '닉네임 정하기';
    $('regMsg').textContent = mode === 'invite'
      ? '친구 초대를 받았어요! 닉네임을 정하면 바로 친구가 돼요.'
      : regMode === 'rename' ? '친구들에게 보이는 이름이에요.' : '친구와 같이 하려면 닉네임이 필요해요.';
    $('regNick').value = regMode === 'rename' && account ? account.nickname : '';
    $('regError').textContent = '';
    $('btnRegister').textContent = regMode === 'rename' ? '바꾸기' : '시작하기';
    $('btnRegLater').textContent = regMode === 'rename' ? '취소' : '나중에 하기';
    $('btnRegister').disabled = false;
    showOnly('register');
  }

  async function submitRegister() {
    const nickname = $('regNick').value.trim();
    if (!NICK_RE.test(nickname)) {
      $('regError').textContent = '1~8자의 한글·영문·숫자로 정해 주세요. (띄어쓰기·기호는 안 돼요)';
      return;
    }
    $('btnRegister').disabled = true;
    $('regError').textContent = '';
    try {
      if (regMode === 'rename') {
        await api('/api/me', { method: 'PATCH', token: account.token, body: { nickname } });
        account = { ...account, nickname };
        saveAccount(account);
        onAccountChange(account);
        showFriends();
        return;
      }
      const r = await api('/api/register', { method: 'POST', body: { nickname } });
      account = { userId: r.userId, token: r.token, nickname, inviteCode: r.inviteCode };
      saveAccount(account);
      onAccountChange(account);
      lobby.connect(account.token);
      if (pendingInvite) {
        const code = pendingInvite;
        pendingInvite = null;
        await acceptInvite(code);
      }
      showFriends();
    } catch (e) {
      $('regError').textContent = e.message;
      $('btnRegister').disabled = false;
    }
  }

  function regLater() {
    if (regMode === 'rename') { showFriends(); return; }
    setLater();
    pendingInvite = null;
    onBack();
  }

  // ------------------------------------------------------------ 친구 화면
  function open() {
    if (!hasServer()) { toast(OFFLINE_MESSAGE); return; }
    if (!account) { showRegister('register'); return; }
    showFriends();
  }

  async function showFriends() {
    $('myNick').textContent = account.nickname;
    renderList();
    renderStatus();
    showOnly('friends');
    // 로비 연결과 별개로 최신 목록을 한 번 받아 옴
    try {
      const { friends: list } = await api('/api/friends', { token: account.token });
      friends.clear();
      for (const f of list) friends.set(f.userId, f);
      restFailed = false;
      renderList();
    } catch (e) {
      if (e.status === 401) { lobby.close(); clearAccount(); account = null; onAccountChange(null); showRegister('register'); return; }
      restFailed = true;
    }
    renderStatus();
  }

  function renderStatus() {
    const el = $('friendsStatus');
    if (restFailed || (!lobbyUp && account)) {
      el.textContent = restFailed ? OFFLINE_MESSAGE : '서버에 연결하는 중…';
      el.className = 'status warn';
    } else {
      el.textContent = '';
      el.className = 'status';
    }
  }

  function renderList() {
    const list = [...friends.values()].sort((a, b) => (b.online - a.online) || a.nickname.localeCompare(b.nickname, 'ko'));
    $('friendList').innerHTML = list.length
      ? list.map((f) => `<li>
          <span class="dot ${f.online ? 'on' : ''}"></span>
          <span class="fname">${esc(f.nickname)}</span>
          <span class="fstate">${f.online ? '접속 중' : '접속 끊김'}</span>
          <button class="small" data-del="${esc(f.userId)}">삭제</button>
        </li>`).join('')
      : '<li class="empty">아직 친구가 없어요. 초대 링크를 보내 보세요!</li>';
  }

  const inviteUrl = () => `${SITE_URL}?inv=${account.inviteCode}`;

  async function share() {
    const url = inviteUrl();
    const text = `${account.nickname}님이 sky-squad에 초대했어요! 같이 비행기 게임 해요 ✈️\n(Chrome으로 열어 주세요)`;
    if (navigator.share) {
      try { await navigator.share({ title: 'sky-squad', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    copy();
  }

  async function copy() {
    const url = inviteUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('초대 링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.');
    } catch {
      toast(`초대 링크: ${url}`);
    }
  }

  async function resetInvite() {
    if (!confirm('새 링크를 만들면 예전에 보낸 초대 링크는 쓸 수 없어요. 새로 만들까요?')) return;
    try {
      const { inviteCode } = await api('/api/invite-code/reset', { method: 'POST', token: account.token });
      account = { ...account, inviteCode };
      saveAccount(account);
      toast('새 초대 링크를 만들었어요.');
    } catch (e) {
      toast(e.message);
    }
  }

  async function remove(userId) {
    const f = friends.get(userId);
    if (!f || !confirm(`${f.nickname}님을 친구에서 삭제할까요?`)) return;
    try {
      await api(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE', token: account.token });
      friends.delete(userId);
      renderList();
    } catch (e) {
      toast(e.message);
    }
  }

  // ------------------------------------------------------------ 버튼 연결
  $('btnRegister').onclick = submitRegister;
  $('regNick').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submitRegister(); });
  $('btnRegLater').onclick = regLater;
  $('btnRename').onclick = () => showRegister('rename');
  $('btnShare').onclick = share;
  $('btnCopy').onclick = copy;
  $('btnResetInvite').onclick = resetInvite;
  $('btnFriendsClose').onclick = onBack;
  $('friendList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-del]');
    if (b) remove(b.dataset.del);
  });

  return {
    start,
    open,
    get account() { return account; },
    // 앱을 내리면 연결을 끊어 친구에게 '접속 끊김'으로 보이게, 돌아오면 다시 연결
    pause() { lobby.pause(); },
    resume() { if (account && hasServer()) lobby.resume(); },
  };
}
