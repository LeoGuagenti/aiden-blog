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

const ICONS = {
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

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
  if (btn) btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
}

// ── Date Formatting ───────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Accent Color ──────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}
function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function applyAccent(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const { r, g, b } = hexToRgb(hex);
  const dark  = rgbToHex(r * 0.8, g * 0.8, b * 0.8);
  const light = rgbToHex(r * 0.15 + 255 * 0.85, g * 0.15 + 255 * 0.85, b * 0.15 + 255 * 0.85);
  const root  = document.documentElement;
  root.style.setProperty('--accent',       hex);
  root.style.setProperty('--accent-dark',  dark);
  root.style.setProperty('--accent-light', light);
}

// ── Site Config ───────────────────────────────────────────────
async function loadSiteConfig() {
  try {
    App.siteConfig = await API.getSiteConfig();
    renderHero();
    renderDonate();
    const title = App.siteConfig.title || 'Blog';
    document.title = title;
    // Footer
    const footerTitle = $('#footer-title');
    if (footerTitle) footerTitle.textContent = `© ${new Date().getFullYear()} ${title}`;
    // Update logo
    const logo = $('#site-logo');
    if (logo && App.siteConfig.title) {
      const words = App.siteConfig.title.split(' ');
      logo.innerHTML = words.length > 1
        ? words.slice(0, -1).join(' ') + ` <span>${words.at(-1)}</span>`
        : `<span>${App.siteConfig.title}</span>`;
    }
    // Apply accent color
    if (App.siteConfig.accentColor) applyAccent(App.siteConfig.accentColor);
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
    // Hide hero CTA buttons — user is already in
    $('#hero-actions')?.classList.add('hidden');
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
    $('#hero-actions')?.classList.remove('hidden');
  }
}

// ── Feed ──────────────────────────────────────────────────────
function renderFeedSkeleton() {
  const feedEl = $('#feed-container');
  if (!feedEl) return;
  const cards = Array.from({length: 6}, () => `
    <div class="feed-skeleton-card">
      <div class="feed-skeleton-img skeleton"></div>
      <div class="feed-skeleton-body">
        <div class="feed-skeleton-line skeleton" style="width:35%"></div>
        <div class="feed-skeleton-line skeleton" style="width:75%;height:18px"></div>
        <div class="feed-skeleton-line skeleton" style="width:90%"></div>
        <div class="feed-skeleton-line skeleton" style="width:60%"></div>
      </div>
    </div>`).join('');
  feedEl.innerHTML = `<div class="feed-skeleton"><div class="feed-skeleton-grid">${cards}</div></div>`;
}

async function loadFeed() {
  const feedEl = $('#feed-container');
  if (!feedEl) return;

  if (!API.isLoggedIn()) {
    renderGate();
    return;
  }

  renderFeedSkeleton();

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
      <span style="display:flex;align-items:center;gap:10px">
        ${post.views ? `<span style="font-size:.75rem;color:var(--text-faint)">${post.views.toLocaleString()} view${post.views === 1 ? '' : 's'}</span>` : ''}
        <span>Read →</span>
      </span>
    </div>`;
  return card;
}

// ── Post View ─────────────────────────────────────────────────
function renderPostSkeleton(overlay) {
  overlay.innerHTML = `
    <div style="background:var(--bg);min-height:100vh">
      <div class="post-overlay-bar">
        <button class="btn btn-ghost" onclick="closePost()">← Back</button>
      </div>
      <div class="post-skeleton">
        <div class="post-skeleton-hero skeleton"></div>
        <div class="post-skeleton-meta skeleton"></div>
        <div class="post-skeleton-title skeleton"></div>
        <div class="post-skeleton-title2 skeleton"></div>
        ${Array.from({length:8},(_,i)=>`<div class="post-skeleton-p skeleton" style="width:${[95,88,72,90,65,93,80,55][i]}%"></div>`).join('')}
      </div>
    </div>`;
}

async function openPost(id) {
  const overlay = $('#post-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  window.history.pushState({}, '', `?post=${id}`);
  renderPostSkeleton(overlay);

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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const mapStyle = isDark ? '&style=element:geometry%7Ccolor:0x212121&style=element:labels.icon%7Cvisibility:off&style=element:labels.text.fill%7Ccolor:0x757575&style=element:labels.text.stroke%7Ccolor:0x212121&style=feature:administrative%7Celement:geometry%7Ccolor:0x757575&style=feature:road%7Celement:geometry%7Ccolor:0x484848&style=feature:water%7Celement:geometry%7Ccolor:0x000000' : '';

  // Process content — wrap video embeds in responsive container
  const processedContent = processVideoEmbeds(post.content || '');

  container.innerHTML = `
    <div style="background:var(--bg);min-height:100vh">
      <div class="post-overlay-bar">
        <button class="btn btn-ghost" onclick="closePost()">← Back</button>
        ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick="openEditPost('${post.id}')">✏️ Edit</button>` : ''}
      </div>
      <div class="post-page">
        <div class="post-hero-wrap">
          <img class="post-hero-img" src="${post.coverImage}" alt="${post.title}">
          ${post.location && post.showMap ? `
          <div class="map-skeleton-wrap">
            <div class="map-skeleton skeleton" id="map-skeleton"></div>
            <div class="post-map-embed" id="post-map-embed" style="opacity:0;transition:opacity .4s ease">
              <iframe
                src="https://maps.google.com/maps?q=${encodeURIComponent(post.location)}&output=embed&z=13${mapStyle}"
                width="100%" height="100%" style="border:0;display:block"
                allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                onload="document.getElementById('map-skeleton')?.remove();this.closest('.post-map-embed').style.opacity='1'">
              </iframe>
            </div>
          </div>` : ''}
        </div>
        <div class="post-meta">
          ${section ? `<span class="post-meta-tag">${section.name}</span>` : ''}
          <span>${fmtDateTime(post.createdAt)}</span>
          ${post.views ? `<span style="color:var(--text-faint)">${post.views.toLocaleString()} views</span>` : ''}
        </div>
        <h1 class="post-title">${post.title}</h1>
        ${post.location ? `
        <div class="post-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${escHtml(post.location)}</span>
        </div>` : ''}
        <div class="post-content">${processedContent}</div>

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

// ── Video Embed Processing ─────────────────────────────────────
function processVideoEmbeds(content) {
  // Wrap any bare iframes (YouTube/Vimeo embeds) in responsive container
  return content.replace(
    /(<iframe[^>]*(?:youtube|youtu\.be|vimeo|loom)[^>]*>[\s\S]*?<\/iframe>)/gi,
    '<div class="video-embed-wrap">$1</div>'
  );
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

// ── Password Field with Eye Toggle ───────────────────────────
function pwField(id, placeholder, autocomplete = 'current-password') {
  return `
    <div class="pw-wrap">
      <input class="form-input" id="${id}" type="password"
        placeholder="${placeholder}" autocomplete="${autocomplete}">
      <button type="button" class="pw-eye" onclick="togglePw('${id}')" tabindex="-1" aria-label="Show password">
        <svg id="${id}-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>`;
}

function togglePw(id) {
  const input = document.getElementById(id);
  const icon  = document.getElementById(id + '-eye-icon');
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  // Swap to slashed eye when visible
  icon.innerHTML = showing
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>`;
}

// ── Login Modal ───────────────────────────────────────────────
let loginMode = 'viewer'; // 'viewer' | 'admin'

function openLoginModal(mode) {
  loginMode = mode || 'viewer';
  renderLoginModal();
}

function setLoginMode(mode) {
  loginMode = mode;
  renderLoginModal();
}

function renderLoginModal() {
  const isAdmin = loginMode === 'admin';
  showModal(`
    <div class="modal-title">Sign In</div>
    <div style="display:flex;gap:4px;margin-bottom:24px;background:var(--surface-2);padding:4px;border-radius:var(--radius-sm)">
      <button onclick="setLoginMode('viewer')" style="flex:1;padding:8px;border-radius:4px;border:none;font-size:.875rem;font-weight:600;cursor:pointer;transition:all .15s;background:${!isAdmin ? 'var(--surface)' : 'transparent'};color:${!isAdmin ? 'var(--text)' : 'var(--text-faint)'};box-shadow:${!isAdmin ? '0 1px 3px rgba(0,0,0,.08)' : 'none'}">Member</button>
      <button onclick="setLoginMode('admin')" style="flex:1;padding:8px;border-radius:4px;border:none;font-size:.875rem;font-weight:600;cursor:pointer;transition:all .15s;background:${isAdmin ? 'var(--surface)' : 'transparent'};color:${isAdmin ? 'var(--text)' : 'var(--text-faint)'};box-shadow:${isAdmin ? '0 1px 3px rgba(0,0,0,.08)' : 'none'}">Admin</button>
    </div>
    <div class="form-group">
      <label class="form-label">${isAdmin ? 'Username' : 'Email'}</label>
      <input class="form-input" id="login-identifier"
        type="${isAdmin ? 'text' : 'email'}"
        placeholder="${isAdmin ? 'your username' : 'your@email.com'}"
        autocomplete="${isAdmin ? 'username' : 'email'}">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      ${pwField('login-pw', '••••••••', 'current-password')}
    </div>
    <div id="login-error" class="form-error hidden"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doLogin()">
      ${isAdmin ? 'Sign In as Admin' : 'Sign In'}
    </button>
    ${!isAdmin ? `<p style="text-align:center;margin-top:16px;font-size:.875rem;color:var(--text-muted)">
      Don't have access? <a href="#" onclick="closeModal();openRequestModal()">Request it</a>
    </p>` : ''}
  `);
  setTimeout(() => $('#login-identifier')?.focus(), 50);
  $('#login-identifier')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-pw')?.focus(); });
  $('#login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const identifier = $('#login-identifier')?.value.trim();
  const pw = $('#login-pw')?.value;
  const errEl = $('#login-error');
  if (!identifier || !pw) { showErr(errEl, 'Please fill in all fields'); return; }

  const btn = document.querySelector('#modal-backdrop .btn-primary');
  const btnLabel = loginMode === 'admin' ? 'Sign In as Admin' : 'Sign In';
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  const restore = () => { if (btn) { btn.disabled = false; btn.textContent = btnLabel; } };

  if (loginMode === 'admin') {
    try {
      await API.adminLogin(identifier, pw);
      restore();
      closeModal();
      window.location.href = './admin.html';
    } catch (e) {
      restore();
      showErr(errEl, 'Invalid admin credentials.');
    }
  } else {
    try {
      const res = await API.viewerLogin(identifier, pw);
      restore();
      closeModal();
      renderHeader();
      if (res.mustChangePw) {
        App._pendingLoginEmail = identifier;
        openChangePwModal();
      } else {
        loadFeed();
        toast(`Welcome back, ${res.name || 'friend'}! 👋`, 'success');
      }
    } catch (e) {
      restore();
      showErr(errEl, e.message);
    }
  }
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
      ${pwField('cur-pw', '••••••••', 'current-password')}
    </div>`}
    <div class="form-group">
      <label class="form-label">New Password</label>
      ${pwField('new-pw', 'At least 6 characters', 'new-password')}
    </div>
    <div class="form-group">
      <label class="form-label">Confirm Password</label>
      ${pwField('conf-pw', 'Repeat password', 'new-password')}
    </div>
    <div id="cpw-error" class="form-error hidden"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doChangePw(${forced})">Update Password</button>`, forced);
}

async function doChangePw(forced) {
  const cur = $('#cur-pw')?.value || '';
  const nw = $('#new-pw')?.value;
  const conf = $('#conf-pw')?.value;
  const errEl = $('#cpw-error');
  if (!nw || !conf) { showErr(errEl, 'Please fill in all fields'); return; }
  if (nw !== conf) { showErr(errEl, 'Passwords do not match'); return; }
  if (nw.length < 6) { showErr(errEl, 'Password must be at least 6 characters'); return; }
  try {
    await API.changePassword(cur, nw);
    closeModal();
    if (forced && App._pendingLoginEmail) {
      // Auto-login with new password
      try {
        const res = await API.viewerLogin(App._pendingLoginEmail, nw);
        App._pendingLoginEmail = null;
        renderHeader();
        loadFeed();
        toast(`Welcome! Password set. You're in 🎉`, 'success');
      } catch {
        // Fallback: prompt them to sign in
        API.clearToken();
        renderHeader();
        renderGate();
        toast('Password set! Please sign in.', 'success');
      }
    } else {
      API.clearToken();
      renderHeader();
      renderGate();
      toast('Password updated! Please sign in again.', 'success');
    }
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
