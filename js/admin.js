// ── Admin State ───────────────────────────────────────────────
const Admin = {
  posts: [],
  sections: [],
  requests: [],
  subscribers: [],
  editingPostId: null,
  editor: null, // Quill instance
  activeTab: 'posts',
};

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  const c = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div'); el.className = 'toast-container';
    el.id = 'toast-container'; document.body.appendChild(el); return el;
  })();
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3200);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Theme ─────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('blog_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('blog_theme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── Auth Check ────────────────────────────────────────────────
function checkAuth() {
  if (API.isAdmin()) {
    showPanel('dashboard');
  } else {
    const creds = localStorage.getItem('admin:setup_checked');
    showPanel('login');
  }
}

// ── Panel Switching ───────────────────────────────────────────
function showPanel(name) {
  $$('[data-panel]').forEach(p => p.classList.add('hidden'));
  const target = $(`[data-panel="${name}"]`);
  if (target) target.classList.remove('hidden');
  if (name === 'dashboard') {
    switchTab(Admin.activeTab);
  }
}

// ── Login ─────────────────────────────────────────────────────
async function doAdminLogin() {
  const username = $('#admin-username')?.value.trim();
  const password = $('#admin-password')?.value;
  const errEl = $('#login-error');
  if (!username || !password) { showErr(errEl, 'Fill in all fields'); return; }
  try {
    await API.adminLogin(username, password);
    showPanel('dashboard');
    loadAllData();
    toast('Welcome back! 👋', 'success');
  } catch (e) { showErr(errEl, e.message); }
}

// ── Setup ─────────────────────────────────────────────────────
async function doSetup() {
  const secret = $('#setup-secret')?.value;
  const username = $('#setup-username')?.value.trim();
  const pw = $('#setup-pw')?.value;
  const pw2 = $('#setup-pw2')?.value;
  const errEl = $('#setup-error');
  if (!secret || !username || !pw) { showErr(errEl, 'All fields required'); return; }
  if (pw !== pw2) { showErr(errEl, 'Passwords do not match'); return; }
  if (pw.length < 8) { showErr(errEl, 'Password must be at least 8 characters'); return; }
  try {
    await API.adminSetup(username, pw, secret);
    showPanel('dashboard');
    loadAllData();
    toast('Admin account created! 🎉', 'success');
  } catch (e) { showErr(errEl, e.message); }
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearErr(el) { if (el) el.classList.add('hidden'); }

// ── Data Loading ──────────────────────────────────────────────
async function loadAllData() {
  try {
    const [posts, sections, requests, subscribers] = await Promise.all([
      API.getPosts(), API.getSections(),
      API.getAccessRequests(), API.getSubscribers().catch(() => [])
    ]);
    Admin.posts = posts;
    Admin.sections = sections;
    Admin.requests = requests;
    Admin.subscribers = subscribers;

    // Update badge
    const badge = $('#requests-badge');
    if (badge) {
      badge.textContent = requests.length || '';
      badge.classList.toggle('hidden', !requests.length);
    }

    // Re-render current tab
    renderTab(Admin.activeTab);
  } catch (e) {
    console.error('Load failed:', e);
    if (e.message.includes('401')) {
      API.clearToken();
      showPanel('login');
    }
  }
}

// ── Tabs ──────────────────────────────────────────────────────
function switchTab(tab) {
  Admin.activeTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab));
  renderTab(tab);
}

function renderTab(tab) {
  switch (tab) {
    case 'posts':    renderPostsTab(); break;
    case 'sections': renderSectionsTab(); break;
    case 'requests': renderRequestsTab(); break;
    case 'site':     renderSiteTab(); break;
    case 'subscribers': renderSubscribersTab(); break;
  }
}

// ── Posts Tab ─────────────────────────────────────────────────
function renderPostsTab() {
  const container = $('#posts-list');
  if (!container) return;
  if (!Admin.posts.length) {
    container.innerHTML = `<div class="a-empty"><div style="font-size:2rem;margin-bottom:8px">✍️</div><p>No posts yet. Create your first one!</p></div>`;
    return;
  }
  container.innerHTML = Admin.posts.map(p => {
    const sec = Admin.sections.find(s => s.id === p.sectionId);
    return `<div class="a-post-row">
      <div class="a-post-thumb" style="background-image:url(${p.coverImage})"></div>
      <div class="a-post-info">
        <div class="a-post-title">${p.title}</div>
        <div class="a-post-meta">${fmtDate(p.createdAt)}${sec ? ` · ${sec.name}` : ''}</div>
      </div>
      <div class="a-post-actions">
        <button class="btn btn-outline btn-sm" onclick="editPost('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}','${escAttr(p.title)}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function escAttr(s) { return (s||'').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

async function deletePost(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    await API.deletePost(id);
    toast('Post deleted', '');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Post Editor ───────────────────────────────────────────────
function openNewPost() {
  Admin.editingPostId = null;
  showPostEditor(null);
}

async function editPost(id) {
  try {
    const post = await API.getPost(id);
    Admin.editingPostId = id;
    showPostEditor(post);
  } catch (e) { toast(e.message, 'error'); }
}

function showPostEditor(post) {
  showPanel('post-editor');

  // Fill title
  const titleInput = $('#post-title-input');
  if (titleInput) titleInput.value = post?.title || '';

  // Fill section select
  const secSelect = $('#post-section-select');
  if (secSelect) {
    secSelect.innerHTML = `<option value="">— No section —</option>` +
      Admin.sections.map(s => `<option value="${s.id}" ${post?.sectionId === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
  }

  // Cover image preview
  const preview = $('#cover-preview');
  const noImg = $('#cover-no-img');
  if (post?.coverImage) {
    if (preview) { preview.src = post.coverImage; preview.classList.remove('hidden'); }
    if (noImg) noImg.classList.add('hidden');
  } else {
    if (preview) preview.classList.add('hidden');
    if (noImg) noImg.classList.remove('hidden');
  }
  $('#editor-heading').textContent = post ? 'Edit Post' : 'New Post';

  // Init Quill
  initEditor(post?.content || '');
}

function initEditor(content) {
  const editorEl = document.getElementById('editor-container');
  if (!editorEl) return;
  // Destroy previous instance
  if (Admin.editor) {
    editorEl.innerHTML = '';
    Admin.editor = null;
  }
  Admin.editor = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Write your post here...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'link'],
        [{ align: [] }],
        ['clean'],
      ],
    },
  });
  if (content) Admin.editor.root.innerHTML = content;
}

// Cover image upload
document.addEventListener('change', async (e) => {
  if (e.target.id === 'cover-file-input') {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
    try {
      toast('Uploading image...', '');
      const result = await API.uploadImage(file);
      const preview = $('#cover-preview');
      const noImg = $('#cover-no-img');
      if (preview) { preview.src = result.url; preview.classList.remove('hidden'); }
      if (noImg) noImg.classList.add('hidden');
      // Store URL for submission
      document.getElementById('cover-img-url').value = result.url;
      toast('Image uploaded ✓', 'success');
    } catch (er) { toast('Image upload failed: ' + er.message, 'error'); }
  }

  // Section banner upload
  if (e.target.id === 'section-banner-input') {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Uploading banner...', '');
      const result = await API.uploadImage(file);
      document.getElementById('section-banner-url').value = result.url;
      const preview = document.getElementById('section-banner-preview');
      if (preview) { preview.src = result.url; preview.classList.remove('hidden'); }
      toast('Banner uploaded ✓', 'success');
    } catch (er) { toast('Upload failed: ' + er.message, 'error'); }
  }

  // Site banner upload
  if (e.target.id === 'site-banner-input') {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Uploading banner...', '');
      const result = await API.uploadImage(file);
      document.getElementById('site-banner-url').value = result.url;
      const preview = document.getElementById('site-banner-preview');
      if (preview) { preview.src = result.url; preview.classList.remove('hidden'); }
      toast('Banner uploaded ✓', 'success');
    } catch (er) { toast('Upload failed: ' + er.message, 'error'); }
  }
});

async function savePost() {
  const title = $('#post-title-input')?.value.trim();
  const sectionId = $('#post-section-select')?.value || null;
  const coverImg = $('#cover-img-url')?.value || ($('#cover-preview')?.src !== window.location.href ? $('#cover-preview')?.src : null);
  const content = Admin.editor?.root.innerHTML || '';
  const errEl = $('#post-save-error');

  if (!title) { showErr(errEl, 'Post title is required'); return; }
  if (!coverImg) { showErr(errEl, 'A cover image is required'); return; }
  if (!content || content === '<p><br></p>') { showErr(errEl, 'Post content cannot be empty'); return; }

  const data = { title, content, coverImage: coverImg, sectionId };
  try {
    if (Admin.editingPostId) {
      await API.updatePost(Admin.editingPostId, data);
      toast('Post updated ✓', 'success');
    } else {
      await API.createPost(data);
      toast('Post published! ✨', 'success');
    }
    showPanel('dashboard');
    loadAllData();
  } catch (e) { showErr(errEl, e.message); }
}

function cancelEditor() {
  showPanel('dashboard');
  Admin.editingPostId = null;
}

// ── Sections Tab ──────────────────────────────────────────────
function renderSectionsTab() {
  const container = $('#sections-list');
  if (!container) return;
  if (!Admin.sections.length) {
    container.innerHTML = `<div class="a-empty"><div style="font-size:2rem;margin-bottom:8px">📂</div><p>No sections yet.</p></div>`;
    return;
  }
  container.innerHTML = Admin.sections.map((s, i) => `
    <div class="a-section-row" data-id="${s.id}">
      <div class="a-section-handle">⠿</div>
      <div class="a-section-info">
        <div class="a-section-name">${s.name}</div>
        <div class="a-section-meta">${(s.posts||[]).length} posts</div>
      </div>
      <div class="a-post-actions">
        <button class="btn btn-outline btn-sm" onclick="editSection('${s.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSection('${s.id}','${escAttr(s.name)}')">Delete</button>
      </div>
    </div>`).join('');
}

function openNewSection() {
  showSectionModal(null);
}

function editSection(id) {
  const sec = Admin.sections.find(s => s.id === id);
  if (sec) showSectionModal(sec);
}

function showSectionModal(sec) {
  const modal = document.getElementById('section-modal');
  if (!modal) return;
  document.getElementById('section-modal-title').textContent = sec ? 'Edit Section' : 'New Section';
  document.getElementById('section-name-input').value = sec?.name || '';
  document.getElementById('section-desc-input').value = sec?.description || '';
  document.getElementById('section-banner-url').value = sec?.banner || '';
  const preview = document.getElementById('section-banner-preview');
  if (preview) {
    if (sec?.banner) { preview.src = sec.banner; preview.classList.remove('hidden'); }
    else preview.classList.add('hidden');
  }
  modal.dataset.editId = sec?.id || '';
  modal.classList.remove('hidden');
}

async function saveSectionModal() {
  const modal = document.getElementById('section-modal');
  const id = modal?.dataset.editId;
  const name = document.getElementById('section-name-input')?.value.trim();
  const description = document.getElementById('section-desc-input')?.value.trim();
  const banner = document.getElementById('section-banner-url')?.value || null;
  if (!name) { toast('Section name required', 'error'); return; }
  try {
    if (id) {
      await API.updateSection(id, { name, description, banner });
      toast('Section updated ✓', 'success');
    } else {
      await API.createSection({ name, description, banner });
      toast('Section created ✓', 'success');
    }
    modal.classList.add('hidden');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteSection(id, name) {
  if (!confirm(`Delete section "${name}"? Posts won't be deleted but will be unsectioned.`)) return;
  try {
    await API.deleteSection(id);
    toast('Section deleted', '');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Access Requests Tab ───────────────────────────────────────
function renderRequestsTab() {
  const container = $('#requests-list');
  if (!container) return;
  if (!Admin.requests.length) {
    container.innerHTML = `<div class="a-empty"><div style="font-size:2rem;margin-bottom:8px">✅</div><p>No pending requests. All clear!</p></div>`;
    return;
  }
  container.innerHTML = Admin.requests.map(r => `
    <div class="a-request-row">
      <div class="a-request-avatar">${(r.firstName||'?')[0].toUpperCase()}</div>
      <div class="a-request-info">
        <div class="a-request-name">${r.firstName} ${r.lastName}</div>
        <div class="a-request-email">${r.email}</div>
        <div class="a-request-date">Requested ${fmtDate(r.requestedAt)}</div>
      </div>
      <div class="a-post-actions">
        <button class="btn btn-primary btn-sm" onclick="approveRequest('${r.id}')">Approve</button>
        <button class="btn btn-danger btn-sm" onclick="denyRequest('${r.id}','${escAttr(r.firstName)}')">Deny</button>
      </div>
    </div>`).join('');
}

async function approveRequest(id) {
  try {
    await API.approveRequest(id);
    toast('Approved! Email sent ✓', 'success');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

async function denyRequest(id, name) {
  if (!confirm(`Deny ${name}'s request? This cannot be undone.`)) return;
  try {
    await API.denyRequest(id);
    toast('Request denied', '');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Subscribers Tab ───────────────────────────────────────────
function renderSubscribersTab() {
  const container = $('#subscribers-list');
  if (!container) return;
  if (!Admin.subscribers.length) {
    container.innerHTML = `<div class="a-empty"><p>No subscribers yet.</p></div>`;
    return;
  }
  container.innerHTML = Admin.subscribers.map(v => `
    <div class="a-request-row">
      <div class="a-request-avatar">${(v.firstName||'?')[0].toUpperCase()}</div>
      <div class="a-request-info">
        <div class="a-request-name">${v.firstName} ${v.lastName}</div>
        <div class="a-request-email">${v.email}</div>
        <div class="a-request-date">Approved ${fmtDate(v.approvedAt)}</div>
      </div>
      <div class="a-post-actions">
        <button class="btn btn-danger btn-sm" onclick="removeSubscriber('${v.email}','${escAttr(v.firstName)}')">Revoke</button>
      </div>
    </div>`).join('');
}

async function removeSubscriber(email, name) {
  if (!confirm(`Revoke ${name}'s access? They will no longer be able to log in.`)) return;
  try {
    await API.removeSubscriber(email);
    toast('Access revoked', '');
    loadAllData();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Site Config Tab ───────────────────────────────────────────
async function renderSiteTab() {
  try {
    const config = await API.getSiteConfig();
    const fields = ['site-title', 'site-subtitle', 'site-description', 'site-venmo', 'site-donate-msg'];
    const keys = ['title', 'subtitle', 'description', 'venmoHandle', 'donateMessage'];
    fields.forEach((f, i) => {
      const el = document.getElementById(f);
      if (el) el.value = config[keys[i]] || '';
    });
    if (config.bannerImage) {
      document.getElementById('site-banner-url').value = config.bannerImage;
      const preview = document.getElementById('site-banner-preview');
      if (preview) { preview.src = config.bannerImage; preview.classList.remove('hidden'); }
    }
  } catch (e) { console.error(e); }
}

async function saveSiteConfig() {
  const keys = { 'site-title': 'title', 'site-subtitle': 'subtitle', 'site-description': 'description', 'site-venmo': 'venmoHandle', 'site-donate-msg': 'donateMessage' };
  const data = {};
  Object.entries(keys).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) data[key] = el.value.trim();
  });
  const bannerUrl = document.getElementById('site-banner-url')?.value;
  if (bannerUrl) data.bannerImage = bannerUrl;
  try {
    await API.updateSiteConfig(data);
    toast('Site settings saved ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  initTheme();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Login form enter key
  document.getElementById('admin-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doAdminLogin();
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    API.clearToken(); showPanel('login'); toast('Signed out', '');
  });

  // Check for hash-based edit action from main page
  const hash = window.location.hash;
  if (hash.startsWith('#edit:')) {
    const postId = hash.slice(6);
    window.location.hash = '';
    checkAuth();
    if (API.isAdmin()) {
      await loadAllData();
      editPost(postId);
    }
    return;
  }

  checkAuth();
  if (API.isAdmin()) loadAllData();
}

document.addEventListener('DOMContentLoaded', init);
