import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

type Variables = {
  userId: number;
  userEmail: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function nowMs() {
  return Date.now();
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  const createdAt = nowMs();
  const expiresAt = createdAt + SESSION_TTL_MS;
  await db
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, userId, createdAt, expiresAt)
    .run();
  return token;
}

async function getSessionUser(
  db: D1Database,
  token: string | undefined
): Promise<{ id: number; email: string } | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id as id, u.email as email, s.expires_at as expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .bind(token)
    .first<{ id: number; email: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < nowMs()) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email };
}

function setSessionCookie(c: any, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

// Auth middleware for /api/notes/* and /api/me
async function requireAuth(c: any, next: any) {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await getSessionUser(c.env.DB, token);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', user.id);
  c.set('userEmail', user.email);
  await next();
}

// --- Auth routes ---

app.post('/api/signup', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const email = (body?.email ?? '').toString().trim().toLowerCase();
  const password = (body?.password ?? '').toString();

  if (!isValidEmail(email)) return c.json({ error: 'invalid email' }, 400);
  if (!isValidPassword(password))
    return c.json({ error: 'password must be 8-200 chars' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) return c.json({ error: 'email already registered' }, 409);

  const hash = await bcrypt.hash(password, 10);
  const createdAt = nowMs();
  const result = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)'
  )
    .bind(email, hash, createdAt)
    .run();

  const userId = Number(result.meta.last_row_id);
  const token = await createSession(c.env.DB, userId);
  setSessionCookie(c, token);
  return c.json({ id: userId, email });
});

app.post('/api/login', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const email = (body?.email ?? '').toString().trim().toLowerCase();
  const password = (body?.password ?? '').toString();

  if (!isValidEmail(email) || !isValidPassword(password))
    return c.json({ error: 'invalid credentials' }, 401);

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ?'
  )
    .bind(email)
    .first<{ id: number; email: string; password_hash: string }>();

  if (!user) return c.json({ error: 'invalid credentials' }, 401);
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return c.json({ error: 'invalid credentials' }, 401);

  const token = await createSession(c.env.DB, user.id);
  setSessionCookie(c, token);
  return c.json({ id: user.id, email: user.email });
});

app.post('/api/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/me', requireAuth, async (c) => {
  return c.json({ id: c.get('userId'), email: c.get('userEmail') });
});

// --- Notes routes ---

app.get('/api/notes', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, body, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC'
  )
    .bind(userId)
    .all();
  return c.json({ notes: results ?? [] });
});

app.post('/api/notes', requireAuth, async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const title = (body?.title ?? '').toString();
  const noteBody = (body?.body ?? '').toString();
  if (title.length === 0 || title.length > 200)
    return c.json({ error: 'title must be 1-200 chars' }, 400);
  if (noteBody.length > 100000)
    return c.json({ error: 'body too large' }, 400);

  const userId = c.get('userId');
  const now = nowMs();
  const result = await c.env.DB.prepare(
    'INSERT INTO notes (user_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(userId, title, noteBody, now, now)
    .run();

  const id = Number(result.meta.last_row_id);
  return c.json({ id, title, body: noteBody, created_at: now, updated_at: now });
});

app.put('/api/notes/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid id' }, 400);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const title = (body?.title ?? '').toString();
  const noteBody = (body?.body ?? '').toString();
  if (title.length === 0 || title.length > 200)
    return c.json({ error: 'title must be 1-200 chars' }, 400);
  if (noteBody.length > 100000)
    return c.json({ error: 'body too large' }, 400);

  const userId = c.get('userId');
  const existing = await c.env.DB.prepare(
    'SELECT id FROM notes WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .first();
  if (!existing) return c.json({ error: 'not found' }, 404);

  const now = nowMs();
  await c.env.DB.prepare(
    'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(title, noteBody, now, id, userId)
    .run();
  return c.json({ id, title, body: noteBody, updated_at: now });
});

app.delete('/api/notes/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid id' }, 400);
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'DELETE FROM notes WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// 404 for unknown /api routes
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// Everything else falls through to ASSETS (served by the static assets binding automatically
// when no Worker route matches). Hono won't match so Workers serves static files.

export default app;
