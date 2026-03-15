// ============================================================
// BLOG WORKER — Single Cloudflare Worker Backend
// ============================================================
// KV Binding required: BLOG_KV
// Secrets required:    JWT_SECRET, RESEND_API_KEY
// Env vars:           FROM_EMAIL, SITE_URL, SETUP_SECRET

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Helpers ──────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function err(msg, status = 400) { return json({ error: msg }, status); }
function cors() { return new Response(null, { headers: CORS }); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Crypto ───────────────────────────────────────────────────

async function hashPw(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function signJWT(payload, secret) {
  const enc = (v) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc(payload);
  const msg = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${msg}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const msg = `${header}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const pad = (s) => s + '==='.slice((s.length + 3) % 4);
    const sigBytes = Uint8Array.from(atob(pad(signature).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(msg));
    if (!valid) return null;
    const payload = JSON.parse(atob(pad(body).replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Auth Middleware ───────────────────────────────────────────

async function getAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return await verifyJWT(auth.slice(7), env.JWT_SECRET);
}

async function requireAdmin(request, env) {
  const p = await getAuth(request, env);
  return (p?.role === 'admin') ? p : null;
}

async function requireViewer(request, env) {
  const p = await getAuth(request, env);
  return (p?.role === 'viewer' || p?.role === 'admin') ? p : null;
}

// ── Email ────────────────────────────────────────────────────

async function sendEmail(to, subject, html, env) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FROM_EMAIL || 'onboarding@resend.dev', to: Array.isArray(to) ? to : [to], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

async function emailApproval(viewer, env) {
  const url = env.SITE_URL || '';
  return sendEmail(viewer.email, "You're in! ✨",
    `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#1a1410">
      <h2 style="font-size:28px;margin-bottom:8px">Hey ${viewer.firstName}! 👋</h2>
      <p style="color:#7a6e64;margin-bottom:32px">Your access request has been approved. Here's how to log in:</p>
      <div style="background:#f4f1ec;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px"><strong>Email:</strong> ${viewer.email}</p>
        <p style="margin:0"><strong>Password:</strong> <code style="background:#e8e2d8;padding:2px 6px;border-radius:4px">${viewer.tempPassword}</code></p>
      </div>
      <p style="margin-bottom:24px">You'll be prompted to set your own password on first login.</p>
      <a href="${url}" style="background:#c85a2b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Visit the blog →</a>
    </div>`, env);
}

async function emailNewPost(post, env) {
  const subs = JSON.parse(await env.BLOG_KV.get('subscribers') || '[]');
  if (!subs.length) return;
  const url = `${env.SITE_URL || ''}/?post=${post.id}`;
  // Truncate excerpt to first sentence (~150 chars)
  const rawText = (post.excerpt || '').replace(/<[^>]*>/g, '').trim();
  const firstSentence = rawText.match(/^.{0,150}[.!?](?:\s|$)/s)?.[0]?.trim() || rawText.slice(0, 150) + (rawText.length > 150 ? '…' : '');
  // Batch in groups of 10 (Resend free tier limit)
  for (let i = 0; i < subs.length; i += 10) {
    const batch = subs.slice(i, i + 10);
    await Promise.all(batch.map(email =>
      sendEmail(email, `New Post: ${post.title}`,
        `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#1a1410">
          ${post.coverImage ? `<img src="${typeof post.coverImage === 'string' && post.coverImage.startsWith('img:') ? `${env.SITE_URL}/api/images/${post.coverImage.slice(4)}` : post.coverImage}" style="width:100%;border-radius:8px;margin-bottom:24px">` : ''}
          <h2 style="font-size:28px;margin-bottom:8px">${post.title}</h2>
          <p style="color:#7a6e64;margin-bottom:24px">${firstSentence}</p>
          <a href="${url}" style="background:#c85a2b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Read the full post →</a>
        </div>`, env)
    ));
  }
}

// ── KV Helpers ───────────────────────────────────────────────

async function kvGet(kv, key, fallback = null) {
  const val = await kv.get(key);
  if (val === null) return fallback;
  try { return JSON.parse(val); } catch { return val; }
}

async function kvSet(kv, key, value) {
  await kv.put(key, typeof value === 'string' ? value : JSON.stringify(value));
}

// ── Stats ─────────────────────────────────────────────────────

async function incrementStats(kv) {
  try {
    const stats = await kvGet(kv, 'stats', { requests: 0 });
    stats.requests = (stats.requests || 0) + 1;
    await kvSet(kv, 'stats', stats);
  } catch {}
}

// ── Main Router ───────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return cors();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Fire-and-forget stats
    ctx.waitUntil(incrementStats(env.BLOG_KV));

    try {

      // ── Public: Stats ─────────────────────────────────────
      if (path === '/api/stats' && method === 'GET') {
        const stats = await kvGet(env.BLOG_KV, 'stats', { requests: 0 });
        const reqs = stats.requests || 0;
        // ~0.0000003 kWh per edge request, 1.8 L/kWh water usage
        const waterLiters = reqs * 0.00000054;
        return json({ requests: reqs, waterLiters: waterLiters.toFixed(8), waterMl: (waterLiters * 1000).toFixed(5) });
      }

      // ── Public: Site Config ───────────────────────────────
      if (path === '/api/site' && method === 'GET') {
        const config = await kvGet(env.BLOG_KV, 'site:config', {
          title: 'My Blog', subtitle: 'A private space to share', description: '',
          bannerImage: '', venmoHandle: '', donateMessage: 'Feed my dog 🐕'
        });
        return json(config);
      }

      // ── Public: Request Access ────────────────────────────
      if (path === '/api/access/request' && method === 'POST') {
        const body = await request.json();
        const { email, firstName, lastName } = body;
        if (!email || !firstName || !lastName) return err('All fields are required');
        const emailKey = `viewer:${email.toLowerCase().trim()}`;
        const existing = await kvGet(env.BLOG_KV, emailKey);
        if (existing) {
          if (existing.approved) return err('This email already has access');
          return err('A request for this email is already pending');
        }
        const id = uid();
        const reqData = {
          id, email: email.toLowerCase().trim(), firstName: firstName.trim(),
          lastName: lastName.trim(), requestedAt: Date.now(), approved: false, denied: false
        };
        await kvSet(env.BLOG_KV, emailKey, reqData);
        await kvSet(env.BLOG_KV, `access:request:${id}`, reqData);
        const list = await kvGet(env.BLOG_KV, 'access:requests:list', []);
        list.push(id);
        await kvSet(env.BLOG_KV, 'access:requests:list', list);
        return json({ ok: true, message: "Request submitted! You'll hear back soon." });
      }

      // ── Public: Viewer Login ──────────────────────────────
      if (path === '/api/viewer/login' && method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) return err('Email and password required');
        const viewer = await kvGet(env.BLOG_KV, `viewer:${email.toLowerCase().trim()}`);
        if (!viewer || !viewer.approved) return err('Access not approved yet', 403);
        const hash = await hashPw(password);
        if (hash !== viewer.passwordHash) return err('Invalid credentials', 401);
        const token = await signJWT(
          { role: 'viewer', email: viewer.email, name: viewer.firstName, mustChangePw: !!viewer.mustChangePassword, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
          env.JWT_SECRET
        );
        return json({ token, name: viewer.firstName, mustChangePw: !!viewer.mustChangePassword });
      }

      // ── Public: Admin Login ───────────────────────────────
      if (path === '/api/admin/login' && method === 'POST') {
        const { username, password } = await request.json();
        const creds = await kvGet(env.BLOG_KV, 'admin:credentials');
        if (!creds) return err('Admin not set up yet', 403);
        const hash = await hashPw(password);
        if (username !== creds.username || hash !== creds.passwordHash) return err('Invalid credentials', 401);
        const token = await signJWT(
          { role: 'admin', username, exp: Math.floor(Date.now() / 1000) + 86400 * 7 },
          env.JWT_SECRET
        );
        return json({ token });
      }

      // ── Public: Admin Setup (one-time) ────────────────────
      if (path === '/api/admin/setup' && method === 'POST') {
        const existing = await kvGet(env.BLOG_KV, 'admin:credentials');
        if (existing) return err('Admin already configured', 403);
        const { username, password, setupSecret } = await request.json();
        if (setupSecret !== env.SETUP_SECRET) return err('Invalid setup secret', 403);
        if (!username || !password) return err('Username and password required');
        if (password.length < 8) return err('Password must be at least 8 characters');
        const passwordHash = await hashPw(password);
        await kvSet(env.BLOG_KV, 'admin:credentials', { username, passwordHash });
        const token = await signJWT(
          { role: 'admin', username, exp: Math.floor(Date.now() / 1000) + 86400 * 7 },
          env.JWT_SECRET
        );
        return json({ ok: true, token });
      }

      // ── Viewer: Change Password ───────────────────────────
      if (path === '/api/viewer/change-password' && method === 'POST') {
        const auth = await getAuth(request, env);
        if (!auth || auth.role !== 'viewer') return err('Unauthorized', 401);
        const { currentPassword, newPassword } = await request.json();
        if (!newPassword || newPassword.length < 6) return err('New password must be at least 6 characters');
        const viewer = await kvGet(env.BLOG_KV, `viewer:${auth.email}`);
        if (!viewer) return err('User not found', 404);
        // Skip current-password check on forced first-time change (temp password flow)
        if (!viewer.mustChangePassword) {
          const currentHash = await hashPw(currentPassword);
          if (currentHash !== viewer.passwordHash) return err('Current password is incorrect');
        }
        viewer.passwordHash = await hashPw(newPassword);
        viewer.mustChangePassword = false;
        delete viewer.tempPassword;
        await kvSet(env.BLOG_KV, `viewer:${auth.email}`, viewer);
        return json({ ok: true });
      }

      // ── Admin: Update Site Config ─────────────────────────
      if (path === '/api/site' && method === 'PUT') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const body = await request.json();
        await kvSet(env.BLOG_KV, 'site:config', body);
        return json({ ok: true });
      }

      // ── Admin: Get Access Requests ────────────────────────
      if (path === '/api/access/requests' && method === 'GET') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const list = await kvGet(env.BLOG_KV, 'access:requests:list', []);
        const requests = [];
        for (const id of list) {
          const r = await kvGet(env.BLOG_KV, `access:request:${id}`);
          if (r && !r.approved && !r.denied) requests.push(r);
        }
        return json(requests.sort((a, b) => b.requestedAt - a.requestedAt));
      }

      // ── Admin: Approve Request ────────────────────────────
      const approveMatch = path.match(/^\/api\/access\/approve\/(.+)$/);
      if (approveMatch && method === 'POST') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const id = approveMatch[1];
        const req = await kvGet(env.BLOG_KV, `access:request:${id}`);
        if (!req) return err('Request not found', 404);
        // Generate a random temp password
        const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const passwordHash = await hashPw(tempPassword);
        const viewer = {
          ...req, approved: true, approvedAt: Date.now(),
          passwordHash, tempPassword, mustChangePassword: true
        };
        await kvSet(env.BLOG_KV, `viewer:${req.email}`, viewer);
        await kvSet(env.BLOG_KV, `access:request:${id}`, { ...req, approved: true });
        // Add to subscribers
        const subs = await kvGet(env.BLOG_KV, 'subscribers', []);
        if (!subs.includes(req.email)) {
          subs.push(req.email);
          await kvSet(env.BLOG_KV, 'subscribers', subs);
        }
        await emailApproval(viewer, env);
        return json({ ok: true });
      }

      // ── Admin: Deny Request ───────────────────────────────
      const denyMatch = path.match(/^\/api\/access\/deny\/(.+)$/);
      if (denyMatch && method === 'DELETE') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const id = denyMatch[1];
        const req = await kvGet(env.BLOG_KV, `access:request:${id}`);
        if (!req) return err('Request not found', 404);
        await env.BLOG_KV.delete(`access:request:${id}`);
        await env.BLOG_KV.delete(`viewer:${req.email}`);
        const list = await kvGet(env.BLOG_KV, 'access:requests:list', []);
        await kvSet(env.BLOG_KV, 'access:requests:list', list.filter(i => i !== id));
        return json({ ok: true });
      }

      // ── Admin: Get Subscribers ────────────────────────────
      if (path === '/api/subscribers' && method === 'GET') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const subs = await kvGet(env.BLOG_KV, 'subscribers', []);
        const viewers = [];
        for (const email of subs) {
          const v = await kvGet(env.BLOG_KV, `viewer:${email}`);
          if (v) viewers.push({ email: v.email, firstName: v.firstName, lastName: v.lastName, approvedAt: v.approvedAt });
        }
        return json(viewers);
      }

      // ── Admin: Remove Subscriber ──────────────────────────
      if (path.match(/^\/api\/subscribers\/(.+)$/) && method === 'DELETE') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const email = decodeURIComponent(path.match(/^\/api\/subscribers\/(.+)$/)[1]);
        const subs = await kvGet(env.BLOG_KV, 'subscribers', []);
        await kvSet(env.BLOG_KV, 'subscribers', subs.filter(e => e !== email));
        // Also revoke access
        await env.BLOG_KV.delete(`viewer:${email}`);
        return json({ ok: true });
      }

      // ── Sections: List (viewer+) ──────────────────────────
      if (path === '/api/sections' && method === 'GET') {
        if (!await requireViewer(request, env)) return err('Unauthorized', 401);
        const list = await kvGet(env.BLOG_KV, 'sections:list', []);
        const sections = [];
        for (const id of list) {
          const s = await kvGet(env.BLOG_KV, `section:${id}`);
          if (s) sections.push(s);
        }
        return json(sections);
      }

      // ── Sections: Create (admin) ──────────────────────────
      if (path === '/api/sections' && method === 'POST') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const body = await request.json();
        const { name, banner, description } = body;
        if (!name) return err('Section name required');
        const id = uid();
        const section = { id, name, banner: banner || null, description: description || '', posts: [], createdAt: Date.now() };
        await kvSet(env.BLOG_KV, `section:${id}`, section);
        const list = await kvGet(env.BLOG_KV, 'sections:list', []);
        list.push(id);
        await kvSet(env.BLOG_KV, 'sections:list', list);
        return json({ ok: true, id, section });
      }

      // ── Sections: Reorder (admin) ─────────────────────────
      if (path === '/api/sections/reorder' && method === 'PUT') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const { order } = await request.json();
        await kvSet(env.BLOG_KV, 'sections:list', order);
        return json({ ok: true });
      }

      // ── Sections: Update/Delete (admin) ───────────────────
      const sectionMatch = path.match(/^\/api\/sections\/([^/]+)$/);
      if (sectionMatch) {
        const id = sectionMatch[1];
        if (method === 'PUT') {
          if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
          const existing = await kvGet(env.BLOG_KV, `section:${id}`);
          if (!existing) return err('Not found', 404);
          const body = await request.json();
          if (body.posts !== undefined) {
            // Reorder posts within section
            await kvSet(env.BLOG_KV, `section:${id}`, { ...existing, ...body, id });
          } else {
            await kvSet(env.BLOG_KV, `section:${id}`, { ...existing, ...body, id, posts: existing.posts });
          }
          return json({ ok: true });
        }
        if (method === 'DELETE') {
          if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
          const secToDelete = await kvGet(env.BLOG_KV, `section:${id}`);
          // Move all posts in this section back to unsectioned
          if (secToDelete?.posts?.length) {
            for (const postId of secToDelete.posts) {
              const post = await kvGet(env.BLOG_KV, `post:${postId}`);
              if (post) {
                post.sectionId = null;
                await kvSet(env.BLOG_KV, `post:${postId}`, post);
              }
            }
          }
          await env.BLOG_KV.delete(`section:${id}`);
          const list = await kvGet(env.BLOG_KV, 'sections:list', []);
          await kvSet(env.BLOG_KV, 'sections:list', list.filter(i => i !== id));
          return json({ ok: true });
        }
      }

      // ── Posts: List (viewer+) ─────────────────────────────
      if (path === '/api/posts' && method === 'GET') {
        if (!await requireViewer(request, env)) return err('Unauthorized', 401);
        const sectionId = url.searchParams.get('section');
        const list = await kvGet(env.BLOG_KV, 'posts:list', []);
        const posts = [];
        for (const id of list) {
          const p = await kvGet(env.BLOG_KV, `post:${id}`);
          if (!p || !p.published) continue;
          if (sectionId && p.sectionId !== sectionId) continue;
          // Strip full content for feed, keep excerpt + cover
          posts.push({
            id: p.id, title: p.title, excerpt: p.excerpt, coverImage: p.coverImage,
            sectionId: p.sectionId, createdAt: p.createdAt, updatedAt: p.updatedAt,
            views: p.views || 0
          });
        }
        return json(posts);
      }

      // ── Posts: Create (admin) ─────────────────────────────
      if (path === '/api/posts' && method === 'POST') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const body = await request.json();
        const { title, content, coverImage, sectionId, excerpt } = body;
        if (!title || !content) return err('Title and content are required');
        if (!coverImage) return err('A cover image is required for every post');
        const id = uid();
        const post = {
          id, title, content, coverImage, sectionId: sectionId || null,
          excerpt: excerpt || content.replace(/<[^>]*>/g, '').slice(0, 200).trim(),
          published: true, createdAt: Date.now(), updatedAt: Date.now()
        };
        await kvSet(env.BLOG_KV, `post:${id}`, post);
        // Prepend to global list
        const list = await kvGet(env.BLOG_KV, 'posts:list', []);
        list.unshift(id);
        await kvSet(env.BLOG_KV, 'posts:list', list);
        // Add to section
        if (sectionId) {
          const sec = await kvGet(env.BLOG_KV, `section:${sectionId}`);
          if (sec) {
            sec.posts = [id, ...(sec.posts || [])];
            await kvSet(env.BLOG_KV, `section:${sectionId}`, sec);
          }
        }
        // Notify subscribers
        ctx.waitUntil(emailNewPost(post, env));
        return json({ ok: true, id });
      }

      // ── Posts: Get / Update / Delete ──────────────────────
      const postMatch = path.match(/^\/api\/posts\/([^/]+)$/);
      if (postMatch) {
        const id = postMatch[1];
        if (method === 'GET') {
          if (!await requireViewer(request, env)) return err('Unauthorized', 401);
          const p = await kvGet(env.BLOG_KV, `post:${id}`);
          if (!p) return err('Not found', 404);
          // Increment view count (fire-and-forget)
          ctx.waitUntil((async () => {
            p.views = (p.views || 0) + 1;
            await kvSet(env.BLOG_KV, `post:${id}`, p);
          })());
          return json(p);
        }
        if (method === 'PUT') {
          if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
          const existing = await kvGet(env.BLOG_KV, `post:${id}`);
          if (!existing) return err('Not found', 404);
          const body = await request.json();
          const updated = {
            ...existing, ...body, id,
            excerpt: body.excerpt || (body.content || existing.content).replace(/<[^>]*>/g, '').slice(0, 200).trim(),
            updatedAt: Date.now()
          };
          await kvSet(env.BLOG_KV, `post:${id}`, updated);
          // Handle section change
          if (body.sectionId !== undefined && body.sectionId !== existing.sectionId) {
            // Remove from old section
            if (existing.sectionId) {
              const oldSec = await kvGet(env.BLOG_KV, `section:${existing.sectionId}`);
              if (oldSec) {
                oldSec.posts = (oldSec.posts || []).filter(p => p !== id);
                await kvSet(env.BLOG_KV, `section:${existing.sectionId}`, oldSec);
              }
            }
            // Add to new section
            if (body.sectionId) {
              const newSec = await kvGet(env.BLOG_KV, `section:${body.sectionId}`);
              if (newSec) {
                newSec.posts = [id, ...(newSec.posts || []).filter(p => p !== id)];
                await kvSet(env.BLOG_KV, `section:${body.sectionId}`, newSec);
              }
            }
          }
          return json({ ok: true });
        }
        if (method === 'DELETE') {
          if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
          const existing = await kvGet(env.BLOG_KV, `post:${id}`);
          if (!existing) return err('Not found', 404);
          await env.BLOG_KV.delete(`post:${id}`);
          await env.BLOG_KV.delete(`comments:${id}`);
          const list = await kvGet(env.BLOG_KV, 'posts:list', []);
          await kvSet(env.BLOG_KV, 'posts:list', list.filter(i => i !== id));
          if (existing.sectionId) {
            const sec = await kvGet(env.BLOG_KV, `section:${existing.sectionId}`);
            if (sec) {
              sec.posts = (sec.posts || []).filter(p => p !== id);
              await kvSet(env.BLOG_KV, `section:${existing.sectionId}`, sec);
            }
          }
          return json({ ok: true });
        }
      }

      // ── Posts: Reorder global list (admin) ────────────────
      if (path === '/api/posts/reorder' && method === 'PUT') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const { order } = await request.json();
        await kvSet(env.BLOG_KV, 'posts:list', order);
        return json({ ok: true });
      }

      // ── Comments: Get (viewer+) ───────────────────────────
      const commentsMatch = path.match(/^\/api\/comments\/([^/]+)$/);
      if (commentsMatch) {
        const postId = commentsMatch[1];
        if (method === 'GET') {
          if (!await requireViewer(request, env)) return err('Unauthorized', 401);
          const comments = await kvGet(env.BLOG_KV, `comments:${postId}`, []);
          return json(comments);
        }
        if (method === 'POST') {
          const auth = await requireViewer(request, env);
          if (!auth) return err('Unauthorized', 401);
          const { text } = await request.json();
          if (!text?.trim()) return err('Comment cannot be empty');
          const comments = await kvGet(env.BLOG_KV, `comments:${postId}`, []);
          const comment = {
            id: uid(), text: text.trim(),
            author: auth.name || auth.username || auth.email || 'Anonymous',
            email: auth.email || null, createdAt: Date.now()
          };
          comments.push(comment);
          await kvSet(env.BLOG_KV, `comments:${postId}`, comments);
          return json({ ok: true, comment });
        }
      }

      // ── Images: Upload (admin) ────────────────────────────
      if (path === '/api/images' && method === 'POST') {
        if (!await requireAdmin(request, env)) return err('Unauthorized', 401);
        const { data, mimeType } = await request.json();
        if (!data || !mimeType) return err('Image data and mimeType required');
        const id = uid();
        await kvSet(env.BLOG_KV, `image:${id}`, { data, mimeType });
        return json({ ok: true, id, url: `/api/images/${id}` });
      }

      // ── Images: Serve (public) ────────────────────────────
      const imageMatch = path.match(/^\/api\/images\/([^/]+)$/);
      if (imageMatch && method === 'GET') {
        const img = await kvGet(env.BLOG_KV, `image:${imageMatch[1]}`);
        if (!img) return err('Not found', 404);
        const { data, mimeType } = img;
        // Handle base64 data URI or raw base64
        const base64 = data.includes(',') ? data.split(',')[1] : data;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Response(bytes, {
          headers: { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=31536000', ...CORS }
        });
      }

      return err('Not found', 404);

    } catch (e) {
      console.error(e);
      return err('Internal server error', 500);
    }
  }
};
