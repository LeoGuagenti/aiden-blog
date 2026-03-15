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

function toggleAdminPw(id) {
  const input = document.getElementById(id);
  const icon  = document.getElementById(id + '-eye-icon');
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  icon.innerHTML = showing
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>`;
}

const ICONS = {
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

// ── Theme ─────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('blog_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  $$('.theme-toggle').forEach(btn => { btn.innerHTML = saved === 'dark' ? ICONS.sun : ICONS.moon; });
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('blog_theme', next);
  $$('.theme-toggle').forEach(btn => { btn.innerHTML = next === 'dark' ? ICONS.sun : ICONS.moon; });
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
  const clearBtn = $('#cover-clear-btn');
  if (post?.coverImage) {
    if (preview) { preview.src = post.coverImage; preview.classList.remove('hidden'); }
    if (noImg) noImg.classList.add('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');
    document.getElementById('cover-img-url').value = post.coverImage;
  } else {
    if (preview) preview.classList.add('hidden');
    if (noImg) noImg.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
    document.getElementById('cover-img-url').value = '';
  }
  $('#editor-heading').textContent = post ? 'Edit Post' : 'New Post';

  // Location
  const locInput = document.getElementById('post-location');
  const mapCheck = document.getElementById('post-show-map');
  if (locInput) locInput.value = post?.location || '';
  if (mapCheck) mapCheck.checked = !!post?.showMap;

  // Init Quill
  initEditor(post?.content || '');
}

function initEditor(content) {
  const editorEl = document.getElementById('editor-container');
  if (!editorEl) return;

  // Quill inserts the toolbar as a SIBLING before the container — must remove it explicitly
  const parent = editorEl.parentNode;
  if (parent) {
    parent.querySelectorAll('.ql-toolbar').forEach(t => t.remove());
  }
  editorEl.innerHTML = '';
  editorEl.className = '';
  Admin.editor = null;

  Admin.editor = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Write your post here...',
    modules: {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link', 'image', 'video'],
          [{ align: [] }],
          ['clean'],
        ],
        handlers: {
          image: () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();
            input.onchange = async () => {
              const file = input.files[0];
              if (!file) return;
              try {
                toast('Uploading image...', '');
                const result = await API.uploadImage(file);
                const range = Admin.editor.getSelection(true);
                Admin.editor.insertEmbed(range ? range.index : 0, 'image', result.url);
                if (range) Admin.editor.setSelection(range.index + 1);
                toast('Image inserted ✓', 'success');
              } catch (e) {
                toast('Image upload failed: ' + e.message, 'error');
              }
            };
          },
          video: () => {
            const url = prompt('Paste a YouTube, Vimeo, or Loom URL:');
            if (!url) return;
            const embedUrl = toEmbedUrl(url);
            if (!embedUrl) { toast('Unsupported video URL. Try YouTube, Vimeo, or Loom.', 'error'); return; }
            const range = Admin.editor.getSelection(true);
            Admin.editor.insertEmbed(range ? range.index : 0, 'video', embedUrl);
            if (range) Admin.editor.setSelection(range.index + 1);
          }
        }
      }
    },
  });
  if (content) Admin.editor.root.innerHTML = content;

  // ── Image resize handler ──────────────────────────────────────
  initImageResize(Admin.editor);
}

// Convert share URLs to embed URLs for YouTube, Vimeo, Loom
function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    // YouTube
    const ytId = u.searchParams.get('v') || u.pathname.split('/').pop();
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed/${ytId}`;
    }
    // Vimeo
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.replace(/\D/g,'');
      return `https://player.vimeo.com/video/${id}`;
    }
    // Loom
    if (u.hostname.includes('loom.com')) {
      const id = u.pathname.split('/').pop();
      return `https://www.loom.com/embed/${id}`;
    }
    // Already an embed or iframe src — pass through
    if (url.includes('/embed/') || url.includes('player.')) return url;
    return null;
  } catch { return null; }
}

function initImageResize(quill) {
  let activeImg = null, handle = null, startX = 0, startW = 0;

  // Create the resize handle element once
  handle = document.createElement('div');
  handle.className = 'ql-img-handle';
  handle.title = 'Drag to resize';
  document.body.appendChild(handle);

  function positionHandle(img) {
    const rect = img.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    handle.style.left = (rect.right - 10) + 'px';
    handle.style.top  = (rect.bottom - 10 + scrollY) + 'px';
    handle.style.display = 'block';
  }

  function deselect() {
    if (activeImg) activeImg.style.outline = '';
    activeImg = null;
    handle.style.display = 'none';
  }

  // Click on image in editor
  quill.root.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      if (activeImg) activeImg.style.outline = '';
      activeImg = e.target;
      activeImg.style.outline = '2px solid var(--accent)';
      positionHandle(activeImg);
      e.stopPropagation();
    } else {
      deselect();
    }
  });

  // Drag resize
  handle.addEventListener('mousedown', (e) => {
    if (!activeImg) return;
    startX = e.clientX;
    startW = activeImg.offsetWidth;
    e.preventDefault();

    function onMove(e) {
      const newW = Math.max(60, startW + (e.clientX - startX));
      activeImg.style.width = newW + 'px';
      activeImg.style.maxWidth = '100%';
      positionHandle(activeImg);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      positionHandle(activeImg);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Deselect when clicking outside editor
  document.addEventListener('click', (e) => {
    if (!quill.root.contains(e.target) && e.target !== handle) deselect();
  });

  // Reposition handle on scroll/resize
  document.querySelector('.a-editor-main')?.addEventListener('scroll', () => {
    if (activeImg) positionHandle(activeImg);
  });
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
      const clearBtn = $('#cover-clear-btn');
      if (preview) { preview.src = result.url; preview.classList.remove('hidden'); }
      if (noImg) noImg.classList.add('hidden');
      if (clearBtn) clearBtn.classList.remove('hidden');
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
      const clearBtn = document.getElementById('section-banner-clear-btn');
      if (preview) { preview.src = result.url; preview.classList.remove('hidden'); }
      if (clearBtn) clearBtn.classList.remove('hidden');
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
      const clearBtn = document.getElementById('site-banner-clear-btn');
      if (clearBtn) clearBtn.classList.remove('hidden');
      toast('Banner uploaded ✓', 'success');
    } catch (er) { toast('Upload failed: ' + er.message, 'error'); }
  }
});

function clearCoverImage() {
  const preview = $('#cover-preview');
  const noImg = $('#cover-no-img');
  const clearBtn = $('#cover-clear-btn');
  const urlInput = document.getElementById('cover-img-url');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  if (noImg) noImg.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.add('hidden');
  if (urlInput) urlInput.value = '';
  // Reset file input so same file can be re-selected
  const fileInput = document.getElementById('cover-file-input');
  if (fileInput) fileInput.value = '';
}

function clearSiteBanner() {
  const preview = document.getElementById('site-banner-preview');
  const urlInput = document.getElementById('site-banner-url');
  const clearBtn = document.getElementById('site-banner-clear-btn');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  if (urlInput) urlInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  const fileInput = document.getElementById('site-banner-input');
  if (fileInput) fileInput.value = '';
}

function clearSectionBanner() {
  const preview = document.getElementById('section-banner-preview');
  const urlInput = document.getElementById('section-banner-url');
  const clearBtn = document.getElementById('section-banner-clear-btn');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  if (urlInput) urlInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  const fileInput = document.getElementById('section-banner-input');
  if (fileInput) fileInput.value = '';
}

async function savePost() {
  const title = $('#post-title-input')?.value.trim();
  const sectionId = $('#post-section-select')?.value || null;
  const coverImg = $('#cover-img-url')?.value || ($('#cover-preview')?.src !== window.location.href ? $('#cover-preview')?.src : null);
  const content = Admin.editor?.root.innerHTML || '';
  const errEl = $('#post-save-error');

  if (!title) { showErr(errEl, 'Post title is required'); return; }
  if (!coverImg) { showErr(errEl, 'A cover image is required'); return; }
  if (!content || content === '<p><br></p>') { showErr(errEl, 'Post content cannot be empty'); return; }

  const data = {
    title, content, coverImage: coverImg, sectionId,
    location: document.getElementById('post-location')?.value.trim() || null,
    showMap: document.getElementById('post-show-map')?.checked || false,
  };
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
  container.innerHTML = Admin.sections.map((s) => `
    <div class="a-section-row" data-id="${s.id}" draggable="true">
      <div class="a-section-handle" title="Drag to reorder">⠿</div>
      <div class="a-section-info">
        <div class="a-section-name">${s.name}</div>
        <div class="a-section-meta">${(s.posts||[]).length} post${(s.posts||[]).length === 1 ? '' : 's'}</div>
      </div>
      <div class="a-post-actions">
        <button class="btn btn-outline btn-sm" onclick="editSection('${s.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSection('${s.id}','${escAttr(s.name)}')">Delete</button>
      </div>
    </div>`).join('');

  initSectionDrag(container);
}

function initSectionDrag(container) {
  let dragEl = null;
  let placeholder = null;

  // Create a placeholder element that shows where the item will drop
  placeholder = document.createElement('div');
  placeholder.className = 'a-section-drag-placeholder';

  const rows = () => [...container.querySelectorAll('.a-section-row')];

  container.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('.a-section-row');
    if (!dragEl) return;
    e.dataTransfer.effectAllowed = 'move';
    // Small delay so the drag image captures the element before we fade it
    setTimeout(() => { dragEl.style.opacity = '0.4'; }, 0);
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.a-section-row');
    if (!target || target === dragEl) return;

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      container.insertBefore(placeholder, target);
    } else {
      container.insertBefore(placeholder, target.nextSibling);
    }
  });

  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) {
      placeholder.remove();
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!dragEl) return;
    dragEl.style.opacity = '';
    if (placeholder.parentNode === container) {
      container.insertBefore(dragEl, placeholder);
    }
    placeholder.remove();

    // Build new order from DOM
    const newOrder = rows().map(r => r.dataset.id);

    // Optimistically update local state
    Admin.sections = newOrder.map(id => Admin.sections.find(s => s.id === id)).filter(Boolean);

    try {
      await API.reorderSections(newOrder);
      toast('Section order saved ✓', 'success');
    } catch (e) {
      toast('Failed to save order', 'error');
      loadAllData(); // re-sync
    }
    dragEl = null;
  });

  container.addEventListener('dragend', () => {
    if (dragEl) dragEl.style.opacity = '';
    placeholder.remove();
    dragEl = null;
  });

  // ── Touch drag support for mobile ─────────────────────────────
  let touchDragEl = null, touchClone = null, touchOffsetY = 0;

  container.addEventListener('touchstart', (e) => {
    const handle = e.target.closest('.a-section-handle');
    if (!handle) return;
    touchDragEl = handle.closest('.a-section-row');
    if (!touchDragEl) return;

    const rect = touchDragEl.getBoundingClientRect();
    touchOffsetY = e.touches[0].clientY - rect.top;

    // Create floating clone
    touchClone = touchDragEl.cloneNode(true);
    touchClone.style.cssText = `
      position:fixed; z-index:9999; left:${rect.left}px; top:${rect.top}px;
      width:${rect.width}px; opacity:0.85; pointer-events:none;
      box-shadow:0 8px 24px rgba(0,0,0,.2); border-radius:var(--radius);
      background:var(--surface);
    `;
    document.body.appendChild(touchClone);
    touchDragEl.style.opacity = '0.3';
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (!touchClone || !touchDragEl) return;
    const touch = e.touches[0];
    touchClone.style.top = (touch.clientY - touchOffsetY) + 'px';

    // Find element underneath
    touchClone.style.display = 'none';
    const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    touchClone.style.display = '';
    const target = elBelow?.closest('.a-section-row');
    if (target && target !== touchDragEl) {
      const rect = target.getBoundingClientRect();
      if (touch.clientY < rect.top + rect.height / 2) {
        container.insertBefore(placeholder, target);
      } else {
        container.insertBefore(placeholder, target.nextSibling);
      }
    }
    e.preventDefault();
  }, { passive: false });

  container.addEventListener('touchend', async () => {
    if (!touchDragEl || !touchClone) return;
    touchClone.remove(); touchClone = null;
    touchDragEl.style.opacity = '';
    if (placeholder.parentNode === container) {
      container.insertBefore(touchDragEl, placeholder);
    }
    placeholder.remove();

    const newOrder = rows().map(r => r.dataset.id);
    Admin.sections = newOrder.map(id => Admin.sections.find(s => s.id === id)).filter(Boolean);
    try {
      await API.reorderSections(newOrder);
      toast('Section order saved ✓', 'success');
    } catch { toast('Failed to save order', 'error'); loadAllData(); }
    touchDragEl = null;
  });
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
  const clearBtn = document.getElementById('section-banner-clear-btn');
  if (preview) {
    if (sec?.banner) {
      preview.src = sec.banner;
      preview.classList.remove('hidden');
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
    }
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

// ── Accent Color ──────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}
function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function applyAccentAdmin(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const { r, g, b } = hexToRgb(hex);
  const dark  = rgbToHex(r * 0.8, g * 0.8, b * 0.8);
  const light = rgbToHex(r * 0.15 + 255 * 0.85, g * 0.15 + 255 * 0.85, b * 0.15 + 255 * 0.85);
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-dark', dark);
  root.style.setProperty('--accent-light', light);
}
function previewAccent(hex) {
  applyAccentAdmin(hex);
  updateSwatchSelection(hex);
}
function setAccentSwatch(hex) {
  const picker = document.getElementById('site-accent-color');
  if (picker) picker.value = hex;
  previewAccent(hex);
}
function updateSwatchSelection(hex) {
  document.querySelectorAll('.a-swatch').forEach(s => {
    s.classList.toggle('a-swatch-active', s.dataset.color?.toLowerCase() === hex.toLowerCase());
  });
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
    const dispName = document.getElementById('site-admin-display-name');
    if (dispName) dispName.value = config.adminDisplayName || '';
    if (config.bannerImage) {
      document.getElementById('site-banner-url').value = config.bannerImage;
      const preview = document.getElementById('site-banner-preview');
      if (preview) { preview.src = config.bannerImage; preview.classList.remove('hidden'); }
      const clearBtn = document.getElementById('site-banner-clear-btn');
      if (clearBtn) clearBtn.classList.remove('hidden');
    }
    const accent = config.accentColor || '#C85A2B';
    const picker = document.getElementById('site-accent-color');
    if (picker) picker.value = accent;
    applyAccentAdmin(accent);
    updateSwatchSelection(accent);
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
  const accent = document.getElementById('site-accent-color')?.value;
  if (accent) data.accentColor = accent;
  const displayName = document.getElementById('site-admin-display-name')?.value.trim();
  if (displayName !== undefined) data.adminDisplayName = displayName;
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
