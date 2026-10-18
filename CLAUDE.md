# CLAUDE.md

"What is my IP" site at https://ip.mlz.no: static files on Firebase Hosting
plus one Cloud Function (`/ip`). See README.md for the full rationale.

## Commands

```sh
bun install && (cd functions && npm ci)   # setup (Bun + Node 22 via mise)
bun run dev        # emulators: http://127.0.0.1:5050 (not 5000: macOS AirPlay)
bun run lint       # biome ci . (also the pre-commit hook)
bun run format     # biome check --write .
./scripts/verify.sh  # boots emulators, asserts headers/cache/`/ip` contract
```

`verify.sh` is the quality gate: CI and the deploy job run the same file.
Run it after any change to `firebase.json`, `functions/`, or `public/404.html`.

PRs also get `deploy-preview` (`preview.yml`): a real GCP login and a
Hosting preview channel, which catches auth and permission breakage before
merge. A merge to `main` deploys to prod.

## Layout

- `public/`: served as-is, with no build step. Plain ES modules in `js/` and
  `@import`ed CSS in `css/` (`style.css` is the entry point).
- `functions/index.js`: the `/ip` handler. CommonJS, npm-managed (its own
  `package-lock.json`). The root uses Bun (`bun.lock`). Don't mix them.
- `firebase.json`: rewrites, security headers, cache policy (JSONC).
- `infra/`: Terraform for the GCP and GitHub setup (project, APIs, WIF,
  deploy service account and roles, Hosting site and domain, budget, repo
  settings and ruleset). Run plan and apply by hand with tokens from the
  environment (`infra/README.md`). CI only runs `fmt` and `validate`.

## Invariants: don't break these

- `maxInstances: 1` is what makes the in-memory rate limit (20/min/address)
  a flat limit. Raising it loosens the limit by the same factor.
- The function must validate the forwarded address (`normalize()`) before
  echoing it or using it as a rate-limit key. On the raw Cloud Run URL,
  X-Forwarded-For is caller-controlled.
- `/ip` responses stay `no-store` with `Vary: Accept` (plain text by default,
  JSON on `Accept: application/json`).
- `firebase.json` `headers` is **last-match-wins**: catch-all first,
  specific overrides after.
- CSP is `'self'` only: no inline scripts or styles, no third-party assets.
  Fonts are self-hosted in `public/assets/fonts/`.
- Every URL in `404.html` must be root-relative, because it is served at
  arbitrary paths.
- The firebase project ID (`what-is-my-ip-f7210`) is intentional and can't
  be renamed. It lives in `.firebaserc`, the workflows, `verify.sh` and
  `infra/` (`variables.tf`, the backend in `versions.tf`, `imports.tf`).
- GCP IAM/WIF, APIs, and GitHub repo settings or rules are changed in
  `infra/`, never in a console. Console edits show up as drift in the next
  plan. Function code and Hosting config stay with `firebase deploy`.
  Don't move them into Terraform.
- WIF matches on the repository's numeric ID (`infra/wif.tf`), not its name,
  so a rename can't break deploys again.

## Frontend preview

`?v4`, `?v6`, `?fail` on the page URL render a documentation address or the
error state without calling `/ip`. Use them to check layout changes.
Headless Chrome won't go below ~500px wide, so check the narrow (≤480px)
IPv6 wrap with real device emulation.
