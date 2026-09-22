// --- 비공개 영역: 로그인 여부를 서버에 물어보고, 서버가 내려준 내용으로만 채운다 ---
async function loadPrivateArea() {
  const lockedBox = document.getElementById('privateLocked');
  const unlockedBox = document.getElementById('privateUnlocked');
  if (!lockedBox || !unlockedBox) return;

  try {
    const res = await fetch('/api/private', { credentials: 'include' });

    if (res.status === 401) {
      lockedBox.hidden = false;
      unlockedBox.hidden = true;
      unlockedBox.innerHTML = '';
      return;
    }

    if (!res.ok) throw new Error('unexpected status ' + res.status);

    const data = await res.json();
    unlockedBox.innerHTML = '';

    const greeting = document.createElement('p');
    greeting.className = 'private-greeting';
    greeting.textContent = `${data.handle} 님만 볼 수 있는 내용입니다.`;
    unlockedBox.appendChild(greeting);

    const list = document.createElement('div');
    list.className = 'private-items';
    data.items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'private-item';
      const h3 = document.createElement('h3');
      h3.textContent = item.title;
      const p = document.createElement('p');
      p.textContent = item.body;
      card.appendChild(h3);
      card.appendChild(p);
      list.appendChild(card);
    });
    unlockedBox.appendChild(list);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.textContent = '로그아웃';
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      loadPrivateArea();
    });
    unlockedBox.appendChild(logoutBtn);

    lockedBox.hidden = true;
    unlockedBox.hidden = false;
  } catch (err) {
    // 네트워크 오류 등 - 안전하게 잠긴 상태로 둔다
    lockedBox.hidden = false;
    unlockedBox.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', loadPrivateArea);

// --- 패스키 등록 / 로그인 ---
function setAuthMessage(text) {
  const el = document.getElementById('authMessage');
  if (el) el.textContent = text || '';
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    /* 응답 본문이 없을 수 있음 */
  }
  return { ok: res.ok, status: res.status, data };
}

document.addEventListener('DOMContentLoaded', () => {
  const registerBtn = document.getElementById('registerBtn');
  const loginBtn = document.getElementById('passkeyLoginBtn');
  const handleInput = document.getElementById('handleInput');
  const deviceNameInput = document.getElementById('deviceNameInput');

  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      if (typeof SimpleWebAuthnBrowser === 'undefined') {
        setAuthMessage('패스키 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
        return;
      }
      const handle = (handleInput.value || '').trim();
      const deviceName = (deviceNameInput.value || '').trim();

      registerBtn.disabled = true;
      setAuthMessage('등록을 준비하고 있어요…');

      try {
        const optRes = await postJSON('/api/register/options', { handle });
        if (!optRes.ok) {
          setAuthMessage((optRes.data && optRes.data.message) || '등록 준비에 실패했습니다.');
          return;
        }

        let attResp;
        try {
          attResp = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: optRes.data.options });
        } catch (err) {
          // 사용자가 기기 다이얼로그에서 취소했거나 인증기가 없는 경우
          console.error('startRegistration failed', err);
          setAuthMessage(
            `패스키 등록이 취소/실패했습니다. 서버에는 아무것도 저장되지 않았어요. (${err.name}: ${err.message})`
          );
          return;
        }

        const verifyRes = await postJSON('/api/register/verify', {
          userId: optRes.data.userId,
          deviceName,
          response: attResp,
        });

        if (!verifyRes.ok) {
          setAuthMessage((verifyRes.data && verifyRes.data.message) || '등록 검증에 실패했습니다.');
          return;
        }

        setAuthMessage('패스키 등록 완료! 자동으로 로그인됩니다.');
        await loadPrivateArea();
      } finally {
        registerBtn.disabled = false;
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      if (typeof SimpleWebAuthnBrowser === 'undefined') {
        setAuthMessage('패스키 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
        return;
      }
      loginBtn.disabled = true;
      setAuthMessage('로그인을 준비하고 있어요…');

      try {
        const optRes = await postJSON('/api/login/options', {});
        if (!optRes.ok) {
          setAuthMessage('로그인 준비에 실패했습니다.');
          return;
        }

        let authResp;
        try {
          authResp = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: optRes.data.options });
        } catch (err) {
          console.error('startAuthentication failed', err);
          setAuthMessage(`로그인이 취소/실패했습니다. (${err.name}: ${err.message})`);
          return;
        }

        const verifyRes = await postJSON('/api/login/verify', {
          response: authResp,
          challenge: optRes.data.options.challenge,
        });

        if (!verifyRes.ok) {
          setAuthMessage((verifyRes.data && verifyRes.data.message) || '로그인에 실패했습니다.');
          return;
        }

        setAuthMessage('');
        await loadPrivateArea();
      } finally {
        loginBtn.disabled = false;
      }
    });
  }
});

const recoveryBtn = document.getElementById('recoveryBtn');
const recoveryDetails = document.getElementById('recoveryDetails');

recoveryBtn.addEventListener('click', () => {
  const isOpen = recoveryBtn.getAttribute('aria-expanded') === 'true';
  recoveryBtn.setAttribute('aria-expanded', String(!isOpen));
  recoveryDetails.hidden = isOpen;
  recoveryBtn.querySelector('span').textContent = isOpen ? '+' : '−';
});
