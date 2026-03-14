// ── API Client ────────────────────────────────────────────────

const API = {
  _base: () => CONFIG.API_URL,

  _headers(extra = {}) {
    const token = localStorage.getItem('blog_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  },

  async _fetch(method, path, body) {
    const opts = { method, headers: this._headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${this._base()}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (path) => API._fetch('GET', path),
  post: (path, body) => API._fetch('POST', path, body),
  put: (path, body) => API._fetch('PUT', path, body),
  del: (path) => API._fetch('DELETE', path),

  // Auth helpers
  getToken() { return localStorage.getItem('blog_token'); },
  setToken(t) { localStorage.setItem('blog_token', t); },
  clearToken() { localStorage.removeItem('blog_token'); localStorage.removeItem('blog_user'); },

  getUser() {
    try { return JSON.parse(localStorage.getItem('blog_user') || 'null'); } catch { return null; }
  },
  setUser(u) { localStorage.setItem('blog_user', JSON.stringify(u)); },

  decodeToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const pad = s => s + '==='.slice((s.length + 3) % 4);
      return JSON.parse(atob(pad(parts[1]).replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  },

  isAdmin() {
    const t = this.getToken();
    if (!t) return false;
    const p = this.decodeToken(t);
    return p?.role === 'admin' && p.exp > Date.now() / 1000;
  },

  isLoggedIn() {
    const t = this.getToken();
    if (!t) return false;
    const p = this.decodeToken(t);
    return p && p.exp > Date.now() / 1000;
  },

  // ── Specific calls ────────────────────────────────────────

  async getSiteConfig() { return this.get('/api/site'); },
  async updateSiteConfig(data) { return this.put('/api/site', data); },

  async adminLogin(username, password) {
    const res = await this.post('/api/admin/login', { username, password });
    this.setToken(res.token);
    this.setUser({ role: 'admin', username });
    return res;
  },

  async adminSetup(username, password, setupSecret) {
    const res = await this.post('/api/admin/setup', { username, password, setupSecret });
    this.setToken(res.token);
    this.setUser({ role: 'admin', username });
    return res;
  },

  async viewerLogin(email, password) {
    const res = await this.post('/api/viewer/login', { email, password });
    this.setToken(res.token);
    this.setUser({ role: 'viewer', name: res.name, email });
    return res;
  },

  async changePassword(currentPassword, newPassword) {
    return this.post('/api/viewer/change-password', { currentPassword, newPassword });
  },

  async requestAccess(email, firstName, lastName) {
    return this.post('/api/access/request', { email, firstName, lastName });
  },

  async getAccessRequests() { return this.get('/api/access/requests'); },
  async approveRequest(id) { return this.post(`/api/access/approve/${id}`, {}); },
  async denyRequest(id) { return this.del(`/api/access/deny/${id}`); },

  async getPosts(sectionId) {
    const q = sectionId ? `?section=${sectionId}` : '';
    return this.get(`/api/posts${q}`);
  },
  async getPost(id) { return this.get(`/api/posts/${id}`); },
  async createPost(data) { return this.post('/api/posts', data); },
  async updatePost(id, data) { return this.put(`/api/posts/${id}`, data); },
  async deletePost(id) { return this.del(`/api/posts/${id}`); },

  async getSections() { return this.get('/api/sections'); },
  async createSection(data) { return this.post('/api/sections', data); },
  async updateSection(id, data) { return this.put(`/api/sections/${id}`, data); },
  async deleteSection(id) { return this.del(`/api/sections/${id}`); },
  async reorderSections(order) { return this.put('/api/sections/reorder', { order }); },

  async getComments(postId) { return this.get(`/api/comments/${postId}`); },
  async addComment(postId, text) { return this.post(`/api/comments/${postId}`, { text }); },

  async getStats() { return this.get('/api/stats'); },
  async getSubscribers() { return this.get('/api/subscribers'); },
  async removeSubscriber(email) { return this.del(`/api/subscribers/${encodeURIComponent(email)}`); },

  // Image upload with client-side compression
  async uploadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const compressed = await compressImage(e.target.result, 1200, 0.82);
          const res = await this.post('/api/images', { data: compressed, mimeType: file.type });
          resolve({ id: res.id, url: `${this._base()}/api/images/${res.id}` });
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};

// ── Image Compression ─────────────────────────────────────────
function compressImage(dataUrl, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}
