# noteapp

A simple notetaking app: sign up, sign in, CRUD your notes. Runs end-to-end on Cloudflare.

## Stack
- **Cloudflare Workers** (API + static assets from one worker)
- **Cloudflare D1** (SQLite) for storage
- **Hono** for routing
- **bcryptjs** for password hashing
- **Vanilla JS** frontend (no framework)
- Session cookies (httpOnly, Secure, SameSite=Lax), sessions table in D1

## Development

```sh
npm install
# Fill in wrangler.toml with a real D1 database_id, then:
npx wrangler d1 execute noteapp-db --remote --file=migrations/0001_init.sql
npx wrangler dev
```

## Deploy

```sh
npx wrangler deploy
```

Auth via `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY` env vars if you aren't using `wrangler login`.

## Project layout

```
src/index.ts           Hono app: /api/* routes, session cookie auth
public/index.html      Single-page UI (signed-out tabs + signed-in notes view)
public/app.js          Frontend logic (fetch + render)
migrations/0001_init.sql   users / sessions / notes schema
wrangler.toml          Worker config (D1 + ASSETS bindings)
```

## API

| Method | Path              | Notes                          |
| ------ | ----------------- | ------------------------------ |
| POST   | `/api/signup`     | `{email, password}`            |
| POST   | `/api/login`      | `{email, password}`            |
| POST   | `/api/logout`     | Clears session                 |
| GET    | `/api/me`         | Current user or 401            |
| GET    | `/api/notes`      | Owner-scoped list              |
| POST   | `/api/notes`      | `{title, body}`                |
| PUT    | `/api/notes/:id`  | Owner only                     |
| DELETE | `/api/notes/:id`  | Owner only                     |
