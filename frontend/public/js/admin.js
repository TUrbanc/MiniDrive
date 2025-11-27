function setupRegister() {
  const form = document.getElementById('regForm');
  const msg  = document.getElementById('regMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try {
      const secret   = document.getElementById('secret').value;
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      await postJson('/admin/register', { secret, username, password });
      msg.textContent = 'Registracija uspešna.'; msg.className = 'msg ok';
      form.reset();
      loadUsers(); // refresh list if visible
    } catch (err) {
      msg.textContent = err.message; msg.className = 'msg error';
    }
  });
}

function setupAdminUsers() {
  document.getElementById('refreshUsers').addEventListener('click', (e) => {
    e.preventDefault();
    loadUsers();
  });
  loadUsers();
}

async function loadUsers() {
  const box = document.getElementById('usersList');
  box.textContent = 'Nalagam...';
  try {
    const secret = document.getElementById('secret').value;
    const r = await postJson('/admin/users/list', { secret });
    if (!r.users || !r.users.length) { box.textContent = 'Ni uporabnikov.'; return; }
    const wrap = document.createElement('div');
    r.users.forEach(u => {
      const row = document.createElement('div');
      row.style.display='flex'; row.style.justifyContent='space-between';
      row.style.padding='6px 0'; row.style.borderBottom='1px solid #30363d';
      const left = document.createElement('div');
      left.textContent = `#${u.id} • ${u.username} • datotek: ${u.file_count} • ${new Date(u.created_at).toLocaleString()}`;
      const del = document.createElement('button');
      del.className='secondary';
      del.textContent='Izbriši';
      del.onclick = async () => {
        if (!confirm(`Izbrisati uporabnika ${u.username}?`)) return;
        const secret = document.getElementById('secret').value;
        await postJson('/admin/users/delete', { secret, userId: u.id });
        loadUsers();
      };
      const right = document.createElement('div');
      right.appendChild(del);
      row.appendChild(left); row.appendChild(right);
      wrap.appendChild(row);
    });
    box.innerHTML=''; box.appendChild(wrap);
  } catch (e) {
    box.textContent = e.message || 'Napaka.';
  }
}
