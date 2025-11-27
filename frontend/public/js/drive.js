function requireTokenOrRedirect() {
  const t = localStorage.getItem('token');
  if (!t) location.href = '/';
}

function humanKB(n) { return (n / 1024).toFixed(1) + ' KB'; }

// helper: create button with SVG icon from /public/icons
function createIconButton(iconName, label, extraClasses = []) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('icon-btn', ...extraClasses);
  btn.title = label;

  const img = document.createElement('img');
  img.src = `/icons/${iconName}.svg`;
  img.alt = label;
  img.className = 'icon-img';

  btn.appendChild(img);
  return btn;
}

async function downloadFile(fileId, filename) {
  try {
    const res = await fetch(`${API_BASE}/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Prenos ni uspel.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'datoteka';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'Prenos ni uspel.');
  }
}

async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    alert('Kopirano v odložišče.');
  } catch {
    prompt('Kopiraj URL:', txt);
  }
}

function renderCommentsUI(fileId) {
  const box = document.createElement('div');
  box.className = 'comments';

  // Input area: textarea above, send button below (aligned right)
  const inputWrapper = document.createElement('div');
  inputWrapper.style.display = 'flex';
  inputWrapper.style.flexDirection = 'column';
  inputWrapper.style.gap = '6px';
  inputWrapper.style.marginBottom = '8px';

  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.placeholder = 'Napiši komentar...';

  const sendRow = document.createElement('div');
  sendRow.style.display = 'flex';
  sendRow.style.justifyContent = 'flex-end';

  const btn = document.createElement('button');
  btn.textContent = 'Pošlji komentar';
  btn.style.width = 'auto';
  btn.style.marginTop = '0';

  sendRow.appendChild(btn);
  inputWrapper.appendChild(ta);
  inputWrapper.appendChild(sendRow);

  const list = document.createElement('div');
  list.className = 'comments-list';
  list.textContent = 'Nalagam komentarje...';

  box.appendChild(inputWrapper);
  box.appendChild(list);

  async function refreshComments() {
    try {
      const data = await listComments(fileId);
      list.textContent = '';
      if (!data.comments || !data.comments.length) {
        list.textContent = 'Ni komentarjev.';
      } else {
        data.comments.forEach(c => {
          const li = document.createElement('div');
          li.textContent = `${new Date(c.created_at).toLocaleString()} — ${c.author || 'uporabnik'}: ${c.body}`;
          list.appendChild(li);
        });
      }
    } catch (e) {
      list.textContent = e.message || 'Napaka nalaganja komentarjev.';
    }
  }

  btn.onclick = async () => {
    const val = ta.value.trim();
    if (!val) return;
    try {
      await addComment(fileId, val);
      ta.value = '';
      await refreshComments();
    } catch (e) {
      alert(e.message || 'Napaka pri dodajanju komentarja.');
    }
  };

  // Initial load
  refreshComments();

  return box;
}

function renderActionsForOwned(file) {
  const wrap = document.createElement('div');
  wrap.className = 'actions-owned';

  // Share to user (green)
  const btnShare  = createIconButton('share', 'Daj v skupno rabo');
  btnShare.onclick = async () => {
    const user = prompt('Uporabniško ime prejemnika:');
    if (!user) return;
    try {
      await shareFileToUser(file.id, user, true);
      alert('Skupna raba dodana.');
    } catch (e) {
      alert(e.message || 'Napaka pri skupni rabi.');
    }
  };
  wrap.appendChild(btnShare);

  // Create link share (green)
  const btnLink   = createIconButton('link-share', 'Link za prenos');
  btnLink.onclick = async () => {
    try {
      const days = prompt('Veljavnost (dni) – prazno = brez omejitve:');
      const maxd = prompt('Največje št. prenosov – prazno = brez omejitve:');
      const { url } = await createLinkShare(
        file.id,
        days ? Number(days) : null,
        maxd ? Number(maxd) : null
      );
      await copyText(url);
    } catch (e) {
      alert(e.message || 'Napaka pri ustvarjanju linka.');
    }
  };
  wrap.appendChild(btnLink);

  // Delete file (red)
  const btnDelete = createIconButton('delete', 'Izbriši');
  btnDelete.onclick = async () => {
    const ok = confirm('Res želiš izbrisati to datoteko?');
    if (!ok) return;
    try {
      await authDelete(`/files/${file.id}`);
      await loadFiles();
    } catch (e) {
      alert(e.message || 'Napaka pri brisanju datoteke.');
    }
  };
  wrap.appendChild(btnDelete);

  return wrap;
}

function renderRow(file, isShared = false) {
  const row = document.createElement('div');
  row.className = 'file-row';

  const top = document.createElement('div');
  top.className = 'file-top';

  const left = document.createElement('div');

  const titleEl = document.createElement('div');
  titleEl.className = 'file-title';
  titleEl.textContent = file.original_name;
  left.appendChild(titleEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'file-meta';

  const sizeVal = file.size_bytes ?? file.sizeBytes ?? file.size ?? 0;
  const sizeSpan = document.createElement('span');
  sizeSpan.textContent = humanKB(sizeVal);
  metaEl.appendChild(sizeSpan);

  const created = file.created_at || file.createdAt;
  if (created) {
    const dateSpan = document.createElement('span');
    dateSpan.textContent = new Date(created).toLocaleString();
    metaEl.appendChild(dateSpan);
  }

  if (isShared) {
    const sharedSpan = document.createElement('span');
    sharedSpan.textContent = 'v skupni rabi';
    metaEl.appendChild(sharedSpan);
  }

  left.appendChild(metaEl);
  top.appendChild(left);

  const right = document.createElement('div');
  right.className = 'actions';

  const fileId = file.id ?? file.file_id;

  // Single download button (works for both owned and shared)
  const btnDl = createIconButton('download', 'Prenesi');
  btnDl.onclick = () => downloadFile(fileId, file.original_name);
  right.appendChild(btnDl);

  // Comments toggle
  const btnC = createIconButton('comment', 'Komentarji');
  let commentsOpen = false;
  let commentsBox = null;
  btnC.onclick = () => {
    if (!commentsOpen) {
      commentsBox = renderCommentsUI(fileId);
      row.appendChild(commentsBox);
      commentsOpen = true;
    } else if (commentsBox) {
      row.removeChild(commentsBox);
      commentsBox = null;
      commentsOpen = false;
    }
  };
  right.appendChild(btnC);

  // Owner-only actions: share, link, delete
  if (!isShared) {
    right.appendChild(renderActionsForOwned(file));
  }

  top.appendChild(right);
  row.appendChild(top);

  return row;
}

async function loadFiles() {
  const ownList = document.getElementById('fileList');
  const sharedList = document.getElementById('sharedList');
  ownList.textContent = 'Nalagam...';
  sharedList.textContent = 'Nalagam...';

  try {
    const own = await authGet('/files');
    const incoming = await listIncomingShares();

    ownList.textContent = '';
    sharedList.textContent = '';

    if (!own.files || !own.files.length) {
      ownList.textContent = 'Ni datotek.';
    } else {
      own.files.forEach(f => ownList.appendChild(renderRow(f, false)));
    }

    if (!incoming.items || !incoming.items.length) {
      sharedList.textContent = 'Ni deljenih datotek.';
    } else {
      incoming.items.forEach(s => {
        const f = {
          id: s.file_id,
          original_name: s.original_name,
          size_bytes: s.size_bytes,
          created_at: s.created_at
        };
        sharedList.appendChild(renderRow(f, true));
      });
    }
  } catch (err) {
    ownList.textContent = err.message || 'Napaka nalaganja.';
    sharedList.textContent = '';
  }
}

function initDrive() {
  requireTokenOrRedirect();
  loadFiles();

  const fileInput = document.getElementById('fileInput');
  const uploadMsg = document.getElementById('uploadMsg');
  const fileLabelSpan = document.getElementById('fileInputLabel');
  const fakeWrapper = document.querySelector('.file-input-fake');

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (fileLabelSpan) {
        fileLabelSpan.textContent = file.name;
      }
      if (fakeWrapper) {
        fakeWrapper.classList.add('has-file');
      }

      if (uploadMsg) {
        uploadMsg.textContent = '';
        uploadMsg.className = 'msg';
      }

      try {
        const fd = new FormData();
        fd.append('file', file);
        await authUpload('/files/upload', fd);

        if (uploadMsg) {
          uploadMsg.textContent = 'Nalaganje uspešno.';
          uploadMsg.className = 'msg ok';
        }

        fileInput.value = '';
        if (fileLabelSpan) {
          fileLabelSpan.textContent = 'Izberite datoteko…';
        }
        if (fakeWrapper) {
          fakeWrapper.classList.remove('has-file');
        }

        await loadFiles();
      } catch (err) {
        if (uploadMsg) {
          uploadMsg.textContent = err.message || 'Napaka pri nalaganju.';
          uploadMsg.className = 'msg error';
        }
      }
    });
  }
}
