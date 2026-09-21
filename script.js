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

const recoveryBtn = document.getElementById('recoveryBtn');
const recoveryDetails = document.getElementById('recoveryDetails');

recoveryBtn.addEventListener('click', () => {
  const isOpen = recoveryBtn.getAttribute('aria-expanded') === 'true';
  recoveryBtn.setAttribute('aria-expanded', String(!isOpen));
  recoveryDetails.hidden = isOpen;
  recoveryBtn.querySelector('span').textContent = isOpen ? '+' : '−';
});
