'use strict';

const $ = (sel) => document.querySelector(sel);

const state = {
  user: null,
  notes: [],
  editingId: null,
  authMode: 'signin',
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  return { ok: res.ok, status: res.status, data };
}

function fmtDate(ms) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  $('#auth-submit').textContent = mode === 'signin' ? 'Sign in' : 'Sign up';
  $('#auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('#auth-error').textContent = '';
}

function showAuthView() {
  $('#auth-view').classList.remove('hidden');
  $('#notes-view').classList.add('hidden');
  $('#user-badge').classList.add('hidden');
}

function showNotesView() {
  $('#auth-view').classList.add('hidden');
  $('#notes-view').classList.remove('hidden');
  $('#user-badge').classList.remove('hidden');
  $('#user-email').textContent = state.user ? state.user.email : '';
}

function renderNotes() {
  const list = $('#notes-list');
  list.innerHTML = '';
  if (!state.notes.length) {
    $('#notes-empty').classList.remove('hidden');
    return;
  }
  $('#notes-empty').classList.add('hidden');
  for (const note of state.notes) {
    const el = document.createElement('article');
    el.className = 'note';
    el.innerHTML = `
      <div class="note-header">
        <h3 class="note-title">${escape(note.title)}</h3>
        <div class="note-actions">
          <button data-action="edit" data-id="${note.id}">Edit</button>
          <button data-action="delete" data-id="${note.id}" class="danger">Delete</button>
        </div>
      </div>
      ${note.body ? `<p class="note-body">${escape(note.body)}</p>` : ''}
      <div class="note-meta">Updated ${fmtDate(note.updated_at)}</div>
    `;
    list.appendChild(el);
  }
}

async function loadNotes() {
  const { ok, data } = await api('/api/notes');
  if (ok) {
    state.notes = data.notes || [];
    renderNotes();
  }
}

function resetComposer() {
  state.editingId = null;
  $('#composer-title').textContent = 'New note';
  $('#note-title').value = '';
  $('#note-body').value = '';
  $('#note-submit').textContent = 'Save note';
  $('#note-cancel').classList.add('hidden');
  $('#note-error').textContent = '';
}

function editNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  state.editingId = id;
  $('#composer-title').textContent = 'Edit note';
  $('#note-title').value = note.title;
  $('#note-body').value = note.body;
  $('#note-submit').textContent = 'Update note';
  $('#note-cancel').classList.remove('hidden');
  $('#note-title').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  const { ok } = await api(`/api/notes/${id}`, { method: 'DELETE' });
  if (ok) await loadNotes();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const err = $('#auth-error');
  err.textContent = '';
  const submit = $('#auth-submit');
  submit.disabled = true;
  try {
    const path = state.authMode === 'signin' ? '/api/login' : '/api/signup';
    const { ok, data } = await api(path, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!ok) {
      err.textContent = (data && data.error) || 'Something went wrong';
      return;
    }
    state.user = data;
    showNotesView();
    resetComposer();
    await loadNotes();
  } finally {
    submit.disabled = false;
  }
}

async function handleNoteSubmit(e) {
  e.preventDefault();
  const title = $('#note-title').value.trim();
  const body = $('#note-body').value;
  const err = $('#note-error');
  err.textContent = '';
  if (!title) {
    err.textContent = 'Title required';
    return;
  }
  const submit = $('#note-submit');
  submit.disabled = true;
  try {
    let res;
    if (state.editingId) {
      res = await api(`/api/notes/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, body }),
      });
    } else {
      res = await api('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title, body }),
      });
    }
    if (!res.ok) {
      err.textContent = (res.data && res.data.error) || 'Save failed';
      return;
    }
    resetComposer();
    await loadNotes();
  } finally {
    submit.disabled = false;
  }
}

async function handleLogout() {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  state.notes = [];
  showAuthView();
}

async function init() {
  // Tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => setAuthMode(t.dataset.tab));
  });
  $('#auth-form').addEventListener('submit', handleAuthSubmit);
  $('#note-form').addEventListener('submit', handleNoteSubmit);
  $('#note-cancel').addEventListener('click', resetComposer);
  $('#logout-btn').addEventListener('click', handleLogout);
  $('#notes-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') editNote(id);
    else if (btn.dataset.action === 'delete') deleteNote(id);
  });

  // Check auth status
  const { ok, data } = await api('/api/me');
  if (ok) {
    state.user = data;
    showNotesView();
    await loadNotes();
  } else {
    showAuthView();
  }
}

init();
