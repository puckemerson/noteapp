# noteapp

A simple notetaking app. Users can sign up, sign in, and create/read/update/delete notes.

## Stack
- **Frontend + backend:** Cloudflare Workers with static assets (SSR-free, SPA style)
- **Database:** Cloudflare D1 (SQLite at the edge)
- **Auth:** Session cookies + bcrypt-hashed passwords stored in D1
- **Repo:** https://github.com/puckemerson/noteapp
- **Deploy target:** https://noteapp.puckemerson.workers.dev

## Status
- [x] Repo scaffolded
- [x] D1 database provisioned (`noteapp-db`, id: `366980e4-4ada-4adc-84f5-a1089da3b668`)
- [x] Schema applied
- [x] Worker deployed
- [x] Frontend working
- [x] Deployed and smoke-tested (signup, login, me, CRUD notes, logout, re-login all pass)

## Decisions
- Cloudflare Workers (not Pages) so we get one unified deploy with the API + static assets.
- D1 for simplicity, no external DB needed.
- Bcrypt via `bcryptjs` (pure JS, Worker-compatible).
- Session token stored as httpOnly cookie, sessions table in D1.
