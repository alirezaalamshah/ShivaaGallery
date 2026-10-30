# Shiva Gallery

Online shop for a women's clothing store in Dezful. Django REST API in `backend/`, Next.js 15 storefront and admin panel (`/panel`) in `frontend/`. See `README.md` for features and `docs/decisions.md` for the decision log.

## Working with the owner

- Reply in Persian. The owner is not a server specialist.
- Ask questions one at a time, never as a list.
- Commits carry only the owner's name. Do not add `Co-Authored-By` lines.

## Deploying to cPanel shared hosting

The full guide, in Persian, is `deploy/README.md`. It is the source of truth: follow it, and fix it if a step turns out wrong on the real host.

When the owner asks for help deploying:

1. Read `deploy/README.md` fully before saying anything.
2. Ask for the domain first, then the cPanel username. Substitute them into every command you hand over.
3. Give **one step at a time**: what to click, or one block of commands to paste in cPanel's Terminal. Then wait for the owner to report the result, or send a screenshot, before giving the next step.
4. When something fails, ask for the exact error text or a screenshot. Never guess past it.

You cannot reach the server. You only see what the owner pastes back.

### Facts that matter on the server

- `backend/passenger_wsgi.py` and `frontend/server.js` are the Passenger entry points for Setup Python App and Setup Node.js App.
- `DJANGO_SERVE_FILES=true` makes Django serve `/media` and `/static` itself, because shared hosting has no separate web server for them.
- `deploy/backend.env` holds a ready production `.env` with a fresh secret key. Only the domain needs changing.
- `NEXT_PUBLIC_API_URL` is baked in at build time, so `frontend/.env.production` must exist before `npm run build`.
- `deploy/initial-data/` is a one-time snapshot of the local database and uploaded photos. Copy it **only** on the first deploy. Copying it again wipes live orders.
- The panel signs in with a Django username and password. Customer login uses an SMS code, and SMS stays on the `console` backend until a Melipayamak panel is bought.
- Django 5.2 needs Python ≥ 3.10. Next.js needs Node ≥ 18.18; use 20 or newer.
- Stock is shared by the shop and the site. Real counts per color and size; in-store sales are recorded at the till, `/panel/pos`. Stock of 9999 is left over from an older panel and means "count unknown".
- Three roles: admin (`is_staff`), seller (member of the `seller` group, till only) and customer. See `backend/apps/accounts/roles.py`.
- `python manage.py expire_orders` cancels unpaid orders past their deadline; it belongs in a cPanel cron job every five minutes.
- Online payment is `PAYMENT_GATEWAY` in `backend/.env`: `none`, `fake` (local testing only) or `zarinpal`. `SITE_URL` must be the storefront's address, because the gateway sends customers back there.

## Local development (Windows)

`.\dev.ps1` starts the backend on :8000 and the site on :3100. Backend tests: `backend\.venv\Scripts\python manage.py test`.
