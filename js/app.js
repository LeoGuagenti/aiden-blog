// ── App State ─────────────────────────────────────────────────
const App = {
  siteConfig: {},
  posts: [],
  sections: [],
  currentPost: null,
  currentView: 'feed', // feed | post
};

// ── DOM Helpers ───────────────────────────────────────────────
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  const container = $('#toast-container') || (() => {
    const c = el('div', 'toast-container'); c.id = 'toast-container';
    document.body.appendChild(c); return c;
  })();
  const t = el('div', `toast ${type}`, msg);
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Theme ─────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('blog_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('blog_theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Date Formatting ───────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Site Config ───────────────────────────────────────────────
async function loadSiteConfig() {
  try {
    App.siteConfig = await API.getSiteConfig();
    renderHero();
    renderDonate();
    document.title = App.siteConfig.title || 'Blog';
    // Update logo
    const logo = $('#site-logo');
    if (logo && App.siteConfig.title) {
      const words = App.siteConfig.title.split(' ');
      logo.innerHTML = words.length > 1
        ? words.slice(0, -1).join(' ') + ` <span>${words.at(-1)}</span>`
        : `<span>${App.siteConfig.title}</span>`;
    }
  } catch (e) { console.error('Config load failed', e); }
}

function renderHero() {
  const c = App.siteConfig;
  const hero = $('#hero');
  if (!hero) return;
  if (c.bannerImage) {
    const img = hero.querySelector('.hero-img') || (() => {
      const i = el('img', 'hero-img'); i.alt = 'Banner';
      hero.insertBefore(i, hero.firstChild); return i;
    })();
    img.src = c.bannerImage;
    hero.classList.remove('hero-no-image');
  } else {
    hero.classList.add('hero-no-image');
  }
  const titleEl = $('#hero-title');
  const subEl = $('#hero-sub');
  if (titleEl) titleEl.textContent = c.title || 'My Blog';
  if (subEl) subEl.textContent = c.subtitle || '';
}

function renderDonate() {
  const bar = $('#donate-bar');
  if (!bar) return;
  const c = App.siteConfig;
  if (c.venmoHandle) {
    bar.classList.remove('hidden');
    const msg = bar.querySelector('.donate-msg');
    const btn = bar.querySelector('.donate-btn');
    if (msg) msg.textContent = c.donateMessage || 'Feed my dog 🐕';
    if (btn) {
      btn.href = `https://venmo.com/${c.venmoHandle.replace('@', '')}`;
      btn.target = '_blank';
    }
  }
}

// ── Water Counter ─────────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await API.getStats();
    const el = $('#water-amount');
    if (el) el.textContent = `${parseFloat(stats.waterMl).toFixed(4)} mL`;
  } catch {}
}

// ── Header / Auth State ───────────────────────────────────────
function renderHeader() {
  const loggedIn = API.isLoggedIn();
  const isAdmin = API.isAdmin();
  const user = API.getUser();

  const loginBtn = $('#login-btn');
  const requestBtn = $('#request-btn');
  const userMenuWrap = $('#user-menu-wrap');

  if (loggedIn) {
    loginBtn?.classList.add('hidden');
    requestBtn?.classList.add('hidden');
    userMenuWrap?.classList.remove('hidden');
    const avatar = $('#user-avatar');
    if (avatar && user) {
      avatar.textContent = (user.name || user.username || user.email || '?')[0].toUpperCase();
    }
    if (isAdmin) {
      const adminLink = $('#admin-link');
      if (adminLink) adminLink.classList.remove('hidden');
    }
  } else {
    loginBtn?.classList.remove('hidden');
    requestBtn?.classList.remove('hidden');
    userMenuWrap?.classList.add('hidden');
  }
}

// ── Feed ──────────────────────────────────────────────────────
async function loadFeed() {
  const feedEl = $('#feed-container');
  if (!feedEl) return;

  if (!API.isLoggedIn()) {
    renderGate();
    return;
  }

  try {
    const [posts, sections] = await Promise.all([API.getPosts(), API.getSections()]);
    App.posts = posts;
    App.sections = sections;
    renderFeed(feedEl);
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('Unauthorized')) {
      API.clearToken();
      renderHeader();
      renderGate();
    } else {
      feedEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Couldn't load posts</div></div>`;
    }
  }
}

function renderGate() {
  const feedEl = $('#feed-container');
  if (!feedEl) return;
  feedEl.innerHTML = `
    <div class="gate-screen fade-up">
      <div style="font-size:3rem;margin-bottom:16px">🔒</div>
      <div class="gate-title">Private Access Only</div>
      <p class="gate-sub">This is a private blog. Request access and you'll be notified once approved.</p>
      <div class="gate-actions">
        <button class="btn btn-primary btn-lg" onclick="openRequestModal()">Request Access</button>
        <button class="btn btn-outline btn-lg" onclick="openLoginModal()">Sign In</button>
      </div>
    </div>`;
}

function renderFeed(container) {
  container.innerHTML = '';

  if (!App.posts.length) {
    container.innerHTML = `
      <div class="empty-state fade-up">
        <div class="empty-state-icon">✍️</div>
        <div class="empty-state-title">Nothing here yet</div>
        <p class="empty-state-sub">Check back soon — posts are coming!</p>
      </div>`;
    return;
  }

  const feed = el('div', 'feed');

  // Posts not in a section
  const unsectioned = App.posts.filter(p => !p.sectionId);
  if (unsectioned.length) {
    const grid = el('div', 'feed-grid');
    unsectioned.forEach((p, i) => {
      const card = renderPostCard(p);
      card.style.animationDelay = `${i * 0.05}s`;
      grid.appendChild(card);
    });
    feed.appendChild(grid);
  }

  // Sections
  App.sections.forEach(sec => {
    const secPosts = sec.posts
      .map(id => App.posts.find(p => p.id === id))
      .filter(Boolean);
    if (!secPosts.length) return;

    // Section header
    const hdr = el('div', 'section-header');
    hdr.innerHTML = `<h2 class="section-title">${sec.name}</h2><div class="section-rule"></div>`;
    feed.appendChild(hdr);

    // Section banner
    if (sec.banner) {
      const img = el('img', 'section-banner');
      img.src = sec.banner; img.alt = sec.name;
      feed.appendChild(img);
    }

    const grid = el('div', 'feed-grid');
    secPosts.forEach((p, i) => {
      const card = renderPostCard(p);
      card.style.animationDelay = `${i * 0.05}s`;
      grid.appendChild(card);
    });
    feed.appendChild(grid);
  });

  container.appendChild(feed);
}

function renderPostCard(post) {
  const card = el('div', 'post-card fade-up');
  card.onclick = () => openPost(post.id);
  const section = App.sections.find(s => s.id === post.sectionId);
  card.innerHTML = `
    <div class="post-card-img-wrap">
      <img class="post-card-img" src="${post.coverImage}" alt="${post.title}" loading="lazy">
    </div>
    <div class="post-card-body">
      <div class="post-card-date">${fmtDate(post.createdAt)}</div>
      <div class="post-card-title">${post.title}</div>
      <div class="post-card-excerpt">${post.excerpt || ''}</div>
    </div>
    <div class="post-card-footer">
      ${section ? `<span class="post-card-tag">${section.name}</span>` : '<span></span>'}
      <span>Read →</span>
    </div>`;
  return card;
}

// ── Post View ─────────────────────────────────────────────────
async function openPost(id) {
  const overlay = $('#post-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div style="padding:60px 24px;text-align:center;color:var(--text-muted)">Loading...</div>`;
  document.body.style.overflow = 'hidden';
  window.history.pushState({}, '', `?post=${id}`);

  try {
    const [post, comments] = await Promise.all([API.getPost(id), API.getComments(id)]);
    App.currentPost = post;
    renderPostView(post, comments, overlay);
  } catch (e) {
    overlay.innerHTML = `<div style="padding:60px 24px;text-align:center">Error loading post</div>`;
  }
}

function closePost() {
  const overlay = $('#post-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
  document.body.style.overflow = '';
  window.history.pushState({}, '', window.location.pathname);
  App.currentPost = null;
}

function renderPostView(post, comments, container) {
  const section = App.sections.find(s => s.id === post.sectionId);
  const isAdmin = API.isAdmin();

  container.innerHTML = `
    <div style="background:var(--bg);min-height:100vh">
      <div style="position:sticky;top:0;z-index:10;background:rgba(250,248,245,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between">
        <button class="btn btn-ghost" onclick="closePost()">← Back</button>
        ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick="openEditPost('${post.id}')">✏️ Edit</button>` : ''}
      </div>
      <div class="post-page">
        <img class="post-hero-img" src="${post.coverImage}" alt="${post.title}">
        <div class="post-meta">
          ${section ? `<span class="post-meta-tag">${section.name}</span>` : ''}
          <span>${fmtDate(post.createdAt)}</span>
          ${post.updatedAt !== post.createdAt ? `<span style="color:var(--text-faint)">Updated ${fmtDate(post.updatedAt)}</span>` : ''}
        </div>
        <h1 class="post-title">${post.title}</h1>
        <div class="post-content">${post.content}</div>

        <div class="comments">
          <h3 class="comments-title">Comments</h3>
          <div id="comments-list">${renderCommentsList(comments)}</div>
          <div class="comment-form">
            <textarea class="comment-input" id="comment-input" placeholder="Leave a comment..." rows="3"></textarea>
            <div>
              <button class="btn btn-primary" onclick="submitComment('${post.id}')">Post Comment</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderCommentsList(comments) {
  if (!comments.length) return `<p style="color:var(--text-faint);font-size:.875rem;margin-bottom:16px">No comments yet — be the first!</p>`;
  return comments.map(c => `
    <div class="comment">
      <div class="comment-avatar">${c.author[0]?.toUpperCase() || '?'}</div>
      <div class="comment-body">
        <div class="comment-author">${c.author}</div>
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-date">${fmtDate(c.createdAt)}</div>
      </div>
    </div>`).join('');
}

async function submitComment(postId) {
  const input = $('#comment-input');
  if (!input?.value.trim()) return;
  try {
    const res = await API.addComment(postId, input.value.trim());
    input.value = '';
    const list = $('#comments-list');
    if (list) {
      const existingComments = list.innerHTML.includes('No comments') ? [] : null;
      if (existingComments !== null) list.innerHTML = '';
      list.innerHTML += `
        <div class="comment fade-up">
          <div class="comment-avatar">${res.comment.author[0]?.toUpperCase()}</div>
          <div class="comment-body">
            <div class="comment-author">${res.comment.author}</div>
            <div class="comment-text">${escHtml(res.comment.text)}</div>
            <div class="comment-date">Just now</div>
          </div>
        </div>`;
    }
    toast('Comment posted!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Login Modal ───────────────────────────────────────────────
function openLoginModal() {
  showModal(`
    <div class="modal-title">Sign In</div>
    <p class="modal-sub">Enter your credentials to access the blog.</p>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" id="login-email" type="email" placeholder="your@email.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <input class="form-input" id="login-pw" type="password" placeholder="••••••••" autocomplete="current-password">
    </div>
    <div id="login-error" class="form-error hidden"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doLogin()">Sign In</button>
    <p style="text-align:center;margin-top:16px;font-size:.875rem;color:var(--text-muted)">
      Don't have access? <a href="#" onclick="closeModal();openRequestModal()">Request it</a>
    </p>`);
  setTimeout(() => $('#login-email')?.focus(), 50);
  document.getElementById('login-email').addEventListener('keydown', e => e.key === 'Enter' && doLogin());
  document.getElementById('login-pw').addEventListener('keydown', e => e.key === 'Enter' && doLogin());
}

async function doLogin() {
  const email = $('#login-email')?.value.trim();
  const pw = $('#login-pw')?.value;
  const errEl = $('#login-error');
  if (!email || !pw) { showErr(errEl, 'Please fill in all fields'); return; }
  try {
    const res = await API.viewerLogin(email, pw);
    closeModal();
    renderHeader();
    if (res.mustChangePw) {
      openChangePwModal();
    } else {
      loadFeed();
      toast(`Welcome back, ${res.name || 'friend'}! 👋`, 'success');
    }
  } catch (e) { showErr(errEl, e.message); }
}

// ── Request Access Modal ──────────────────────────────────────
function openRequestModal() {
  showModal(`
    <div class="modal-title">Request Access</div>
    <p class="modal-sub">This is a private blog. Submit your info and you'll be notified if approved.</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">First Name</label>
        <input class="form-input" id="req-first" type="text" placeholder="Jane" autocomplete="given-name">
      </div>
      <div class="form-group">
        <label class="form-label">Last Name</label>
        <input class="form-input" id="req-last" type="text" placeholder="Doe" autocomplete="family-name">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" id="req-email" type="email" placeholder="your@email.com" autocomplete="email">
    </div>
    <div id="req-error" class="form-error hidden"></div>
    <div id="req-success" class="form-success hidden"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doRequestAccess()">Submit Request</button>
    <p style="text-align:center;margin-top:16px;font-size:.875rem;color:var(--text-muted)">
      Already approved? <a href="#" onclick="closeModal();openLoginModal()">Sign in</a>
    </p>`);
  setTimeout(() => $('#req-first')?.focus(), 50);
}

async function doRequestAccess() {
  const first = $('#req-first')?.value.trim();
  const last = $('#req-last')?.value.trim();
  const email = $('#req-email')?.value.trim();
  const errEl = $('#req-error');
  const sucEl = $('#req-success');
  if (!first || !last || !email) { showErr(errEl, 'All fields are required'); return; }
  try {
    const res = await API.requestAccess(email, first, last);
    showErr(errEl, '', false);
    sucEl.textContent = res.message || "Request submitted! ✨ You'll hear back soon.";
    sucEl.classList.remove('hidden');
    setTimeout(closeModal, 3000);
  } catch (e) { showErr(errEl, e.message); }
}

// ── Change Password Modal ─────────────────────────────────────
function openChangePwModal(forced = true) {
  showModal(`
    <div class="modal-title">${forced ? 'Set Your Password' : 'Change Password'}</div>
    <p class="modal-sub">${forced ? 'Please set a personal password to continue.' : 'Update your account password.'}</p>
    ${forced ? '' : `
    <div class="form-group">
      <label class="form-label">Current Password</label>
      <input class="form-input" id="cur-pw" type="password" placeholder="••••••••">
    </div>`}
    <div class="form-group">
      <label class="form-label">New Password</label>
      <input class="form-input" id="new-pw" type="password" placeholder="At least 6 characters">
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password</label>
      <input class="form-input" id="conf-pw" type="password" placeholder="Repeat password">
    </div>
    <div id="cpw-error" class="form-error hidden"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doChangePw(${forced})">Update Password</button>`, forced);
}

async function doChangePw(forced) {
  const cur = $('#cur-pw')?.value || 'placeholder'; // forced = no current needed
  const nw = $('#new-pw')?.value;
  const conf = $('#conf-pw')?.value;
  const errEl = $('#cpw-error');
  if (!nw || !conf) { showErr(errEl, 'Please fill in all fields'); return; }
  if (nw !== conf) { showErr(errEl, 'Passwords do not match'); return; }
  if (nw.length < 6) { showErr(errEl, 'Password must be at least 6 characters'); return; }
  try {
    await API.changePassword(cur, nw);
    // Update token (re-login)
    const user = API.getUser();
    closeModal();
    toast('Password updated! Please sign in again.', 'success');
    API.clearToken();
    renderHeader();
    renderGate();
  } catch (e) { showErr(errEl, e.message); }
}

// ── Modal Helpers ─────────────────────────────────────────────
function showModal(html, unclosable = false) {
  let backdrop = $('#modal-backdrop');
  if (!backdrop) {
    backdrop = el('div', 'modal-backdrop'); backdrop.id = 'modal-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.innerHTML = `
    <div class="modal" role="dialog">
      ${unclosable ? '' : '<button class="modal-close" onclick="closeModal()">✕</button>'}
      ${html}
    </div>`;
  backdrop.classList.remove('hidden');
  backdrop.onclick = (e) => { if (!unclosable && e.target === backdrop) closeModal(); };
}

function closeModal() {
  const backdrop = $('#modal-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
}

function showErr(el, msg, show = true) {
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !show);
}

// ── Post Overlay Edit shortcut ────────────────────────────────
function openEditPost(id) {
  window.location.href = `admin.html#edit:${id}`;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  initTheme();

  // Theme toggle
  $('#theme-toggle')?.addEventListener('click', toggleTheme);

  // Header buttons
  $('#login-btn')?.addEventListener('click', openLoginModal);
  $('#request-btn')?.addEventListener('click', openRequestModal);

  // User menu toggle
  $('#user-avatar')?.addEventListener('click', () => {
    const dd = $('#user-dropdown');
    if (dd) dd.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu-wrap')) $('#user-dropdown')?.classList.add('hidden');
  });

  // Logout
  $('#logout-btn')?.addEventListener('click', () => {
    API.clearToken(); renderHeader(); loadFeed();
    toast('Signed out', '');
  });

  // Close post with Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('#post-overlay:not(.hidden)')) closePost();
      else closeModal();
    }
  });

  // Load data
  await loadSiteConfig();
  renderHeader();
  loadStats();

  // Check if a post was linked directly
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('post');
  if (postId && API.isLoggedIn()) {
    loadFeed().then(() => openPost(postId));
  } else {
    loadFeed();
  }

  // Handle browser back button
  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search).get('post');
    if (!p) closePost();
  });
}

document.addEventListener('DOMContentLoaded', init);
