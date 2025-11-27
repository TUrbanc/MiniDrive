function setupLogin({ redirectOnSuccess = '/drive' } = {}) {
  const form = document.getElementById('loginForm');
  const msg  = document.getElementById('loginMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const r = await postJson('/auth/login', { username, password });
      if (r.token) setToken(r.token);
      msg.textContent = 'Prijava uspešna.'; msg.className = 'msg ok';
      location.href = redirectOnSuccess;
    } catch (err) {
      msg.textContent = err.message; msg.className = 'msg error';
    }
  });
}
