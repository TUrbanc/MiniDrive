const API_BASE = 'http://mywgbox.duckdns.org:8080/api';

function setToken(t){ localStorage.setItem('token', t); }
function getToken(){ return localStorage.getItem('token') || ''; }
function clearToken(){ localStorage.removeItem('token'); }

async function postJson(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || 'Napaka' }; }
  if (!res.ok) throw new Error(body.error || 'Zahteva ni uspela');
  return body;
}

async function authGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || 'Napaka' }; }
  if (!res.ok) throw new Error(body.error || 'Zahteva ni uspela');
  return body;
}

async function authUpload(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || 'Napaka' }; }
  if (!res.ok) throw new Error(body.error || 'Pošiljanje ni uspelo');
  return body;
}


async function authPost(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify(data || {})
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || 'Napaka' }; }
  if (!res.ok) throw new Error(body.error || 'Zahteva ni uspela');
  return body;
}


async function authDelete(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: data ? JSON.stringify(data) : undefined
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || 'Napaka' }; }
  if (!res.ok) throw new Error(body.error || 'Zahteva ni uspela');
  return body;
}


// ---- Sharing & comments helpers ----
async function shareToUser(fileId, targetUsername, canDownload = true) {
  return await authPost('/shares/user', { fileId, targetUsername, canDownload });
}
async function listSharesForFile(fileId) {
  return await authGet(`/shares/file/${fileId}`);
}
async function revokeUserShare(fileId, targetUsername) {
  return await authDelete('/shares/user', { fileId, targetUsername });
}
async function createLinkShare(fileId, expiresInDays = null, maxDownloads = null) {
  return await authPost('/shares/link', { fileId, expiresInDays, maxDownloads });
}
async function listLinkShares(fileId) {
  return await authGet(`/shares/link/${fileId}`);
}
async function deleteLinkShare(id) {
  return await authDelete(`/shares/link/${id}`);
}
async function listComments(fileId) {
  return await authGet(`/files/${fileId}/comments`);
}
async function addComment(fileId, body) {
  return await authPost(`/files/${fileId}/comments`, { body });
}



async function listIncomingShares() {
  return await authGet('/shares/incoming');
}


async function shareFileToUser(fileId, targetUsername, canDownload = true) {
  return await authPost('/shares/user', { fileId, targetUsername, canDownload });
}
