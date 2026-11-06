# SOS

"Secure Online Sharing": an Express 5 + Handlebars app for sharing files with Shamir secret
sharing, built at Hack&Roll 2018 (release `final-2018`). A signed-in user uploads a file; the
server encrypts it (AES-256-GCM, key from scrypt) under a random secret, splits that secret into
N shares of which K are needed (shamirs-secret-sharing), shows the shares once and keeps only the
ciphertext. Anyone with the file's link and K shares can download it, signed in or not. The owner
can regenerate the shares (the old ones stop working) or delete the file, and files can expire.
Users and file records are in SQLite (better-sqlite3) at `database/sos.db` (or `DB_PATH`), the
ciphertexts in `data/uploads/`. The site is not deployed.

## Run and check

- Node: the version in `.node-version` (also the `engines` floor in `package.json`). On Docker
  use a full Debian trixie image (e.g. `node:22.23.4-trixie`) or the repo's Alpine `Dockerfile`:
  bookworm's glibc is too old for better-sqlite3's prebuilt binary, and slim images lack the
  tools to build it from source (the Dockerfile installs them).
- `npm ci --engine-strict`, then copy `.env.example` to `.env` and set `SESSION_SECRET` (for
  example 64 random hex characters). `npm start` (or `npm run dev`) **from the repo root**; it
  listens on `PORT` (5000). `BASE_URL` is only used for the file page's "Copy Link".
- **Gate** (what CI runs; all must pass before a PR is ready):

  ```sh
  npm ci --engine-strict && npm run lint && npm run format:check && npm test && npm audit --omit=dev
  ```

- `npm test` boots the real `node app.js` in a temporary copy of the repo (your `database/` and
  `data/` are never touched). `test/helpers/app.js` drives it over HTTP with a cookie-jar client
  that reads the CSRF token from the pages' `<meta name="csrf-token" ... />` tag and sends it like
  the pages do: in the `_csrf` field of forms, including the multipart upload form, and in
  `X-CSRF-Token` for the file page's regenerate (`PUT`) and delete (`DELETE`) calls. No network is
  needed. Sign-in and sign-up POSTs share one limit of 20 per 15 minutes, and decryption has its
  own, so each `describe` block starts its own app.

## Where things live

- `app.js`: startup. `controllers/settings.js`: env (port, secret, size limit, cipher settings).
  `controllers/config.js`: middleware (helmet without CSP, compression, static files, request
  log, body parsing, SQLite sessions, method-override, CSRF via csrf-sync, passport strategies,
  Handlebars).
- `controllers/routes.js`: landing, home, and the 404/500 handlers. `controllers/users.js`:
  sign-in/up, sign-out, password change. `controllers/files.js`: upload (multer, then its own CSRF
  check), view, decrypt, regenerate, delete.
- `models/db.js`: the connection and schema. `models/file.js`: encryption, shares, per-file
  serialisation of regenerate/delete. `models/user.js`: bcrypt users.
- `middlewares/`: `auth`, `upload` (multer disk storage in `data/uploads/`, 25 MiB), `validate`
  (express-validator), `notification` (flash messages).
- `views/*.handlebars`; `public/` (vendored jQuery, Bootstrap and friends).
- `test/`: `node:test` suites; `test/helpers/` holds the harness.
- `.github/workflows/ci.yml`: checks `test (floor)`, `test (lts)` and `audit` on every PR and
  push to `master`, weekly on Mondays; a failing scheduled run opens a "Scheduled CI failed"
  issue. `dependabot.yml`: monthly grouped npm, Actions and Docker updates.
  `dependabot-auto-merge.yml`: patch and minor Dependabot PRs merge themselves once the required
  checks pass.

## Conventions

- Damian merges. Agents work on branches and open or update PRs; they never merge, close PRs,
  push to `master` or change repository settings.
- One problem per commit, one theme per PR. Imperative, sentence-case subjects with no prefix,
  except dependency commits: `fix(deps): update <pkg> <old> -> <new> (GHSA-…)`.
- Commit bodies say what was wrong (citing the commit that caused it), the fix, and how it was
  verified: the result before and after. A behavioural fix adds a test that fails before it.
- Don't force-push a pushed branch; add commits, and merge the base in to update it.
- Stacked PRs say so in the description and give the merge order.
- Known gaps are `test.todo` entries named after the item they miss. Fixing one means dropping
  `.todo` in the same PR.
- The CSRF form field is `_csrf`; scripts send the token in `X-CSRF-Token`.

## Decided against (don't re-propose)

- npm's audit "fix" for the dev-only eslint/minimatch advisory.
- Recovering files or shares from the earlier NeDB and sssa-js builds (closed #7). There is no
  data worth keeping.
- Turning on a Content-Security-Policy as a side effect of another fix.

## Known issues (don't re-investigate)

- CSRF is skipped for every multipart request; only `POST /files` checks the token itself, so a
  tokenless multipart `POST /files/<id>?_method=DELETE` deletes a file (open PR #3).
- Validation failures redirect to `"back"`, which Express 5 no longer understands: the browser
  gets `Location: back` and a 404 (open PR #4). `res.status(400).redirect(...)` sends 302 anyway;
  don't add more.
- An upload without a file shows a TypeError message; one over 25 MiB is a bare 500 (open PR #5).
- Sign-out is a GET and doesn't destroy the session; visitors can open `/home` and `/users`
  (open PR #2, which needs #3 for multipart sign-out).
- The Docker image never starts: Node 18 with better-sqlite3 13, and root-owned data directories
  under `USER node` (open PR #6). `engines.node` and the unused "sos-salt" decryption fallback
  are fixed by open PR #8.
- The CSRF token is also accepted from the query string (`?_csrf=`).
- CSRF and body-parsing errors reach Express's default handler, which shows a stack trace outside
  production; the error handler inside `routes.js` never sees them.
- `.env.example`'s placeholder differs from the string `settings.js` rejects, so it boots; any
  non-empty secret is accepted.
- `trust proxy` is never set, so with `NODE_ENV=production` behind an HTTPS proxy no session
  cookie is issued, and the rate limiters see the proxy's address.
- Sign-in says "User does not exist" or "Wrong password", revealing which usernames exist.
- `GET /files/<id>` needs no sign-in and ids are sequential, so file names and descriptions can be
  enumerated (the content still needs the shares).
- Uploads are written to `data/uploads/` before the CSRF check and removed when it fails; memory
  storage would avoid the write.
