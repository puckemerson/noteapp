# noteapp

A simple notetaking app. Users can sign up, sign in, and create/read/update/delete notes.

## Stack
- **Frontend + backend:** Cloudflare Workers with static assets (SSR-free, SPA style)
- **Database:** Cloudflare D1 (SQLite at the edge)
- **Auth:** Session cookies + bcrypt-hashed passwords stored in D1
- **Repo:** github.com/puckemerson/noteapp
- **Deploy target:** noteapp.<subdomain>.workers.dev

## Status
- [ ] Repo scaffolded
- [ ] D1 database provisioned
- [ ] Schema applied
- [ ] Worker deployed
- [ ] Frontend working
- [ ] Deployed and smoke-tested

## Decisions
- Cloudflare Workers (not Pages) so we get one unified deploy with the API + static assets.
- D1 for simplicity, no external DB needed.
- Bcrypt via `bcryptjs` (pure JS, Worker-compatible).
- Session token stored as httpOnly cookie, sessions table in D1.
