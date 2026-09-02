const recoveryBtn = document.getElementById('recoveryBtn');
const recoveryDetails = document.getElementById('recoveryDetails');

recoveryBtn.addEventListener('click', () => {
  const isOpen = recoveryBtn.getAttribute('aria-expanded') === 'true';
  recoveryBtn.setAttribute('aria-expanded', String(!isOpen));
  recoveryDetails.hidden = isOpen;
  recoveryBtn.querySelector('span').textContent = isOpen ? '+' : '−';
});
