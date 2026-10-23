# CLAUDE.md

"What is my IP" site at https://ip.mlz.no: static files on Firebase Hosting
plus one Go Cloud Run service (`/ip`). See README.md for the full rationale.

## Commands

```sh
bun install        # setup (Bun, Node 22 and Go via mise)
bun run dev        # Hosting emulator: http://127.0.0.1:5050 (not 5000: macOS AirPlay)
bun run dev:server # Go /ip service: http://127.0.0.1:8080/ip
bun run test:server  # go vet + go test
bun run lint       # biome ci . + gofmt check (also the pre-commit hook)
bun run format     # biome check --write . + gofmt -w
./scripts/verify.sh  # tests server/, boots emulator, asserts headers/cache/`/ip`
```

`verify.sh` is the quality gate: CI and the deploy job run the same file.
Run it after any change to `firebase.json`, `server/`, or `public/404.html`.

PRs also get `deploy-preview` (`preview.yml`): a real GCP login and a
Hosting preview channel, which catches auth and permission breakage before
merge. A merge to `main` deploys to prod.

## Layout

- `public/`: served as-is, with no build step. Plain ES modules in `js/` and
  `@import`ed CSS in `css/` (`style.css` is the entry point).
- `server/`: the `/ip` handler, a standard-library-only Go module deployed to
  Cloud Run service `ip-go` by `deploy.yml`. Hosting rewrites `/ip` to it.
- `firebase.json`: rewrites, security headers, cache policy (JSONC).
- `infra/`: Terraform for the GCP and GitHub setup (project, APIs, WIF,
  deploy service account and roles, the `ip-go-runtime` service account,
  Hosting site and domain, budget, repo
  settings and ruleset). Run plan and apply by hand with tokens from the
  environment (`infra/README.md`). CI only runs `fmt` and `validate`.

## Invariants: don't break these

- `--max-instances 1` (in `deploy.yml`) is the cost ceiling; there is no rate
  limiter behind it.
- `ip-go` runs as `ip-go-runtime` (`infra/run.tf`), which has no roles. Don't
  grant it any, and don't drop `--service-account` from `deploy.yml`.
- The service must validate the forwarded address (`clientAddr()`) before
  echoing it. On the raw Cloud Run URL, X-Forwarded-For is caller-controlled.
- `/ip` returns the bare address as plain text and stays `no-store`.
- `firebase.json` `headers` is **last-match-wins**: catch-all first,
  specific overrides after.
- CSP is `'self'` only: no inline scripts or styles, no third-party assets.
  Fonts are self-hosted in `public/assets/fonts/`.
- Every URL in `404.html` must be root-relative, because it is served at
  arbitrary paths.
- The firebase project ID (`what-is-my-ip-f7210`) is intentional and can't
  be renamed. It lives in `.firebaserc`, the workflows, `verify.sh` and
  `infra/` (`variables.tf`, the backend in `versions.tf`).
- GCP IAM/WIF, APIs, and GitHub repo settings or rules are changed in
  `infra/`, never in a console. Console edits show up as drift in the next
  plan. The service and Hosting config stay in `deploy.yml` (Cloud Build and
  `firebase deploy`). Don't move them into Terraform.
- WIF matches on the repository's numeric ID (`infra/wif.tf`), not its name,
  so a rename can't break deploys again.

## Comments

No comments in code, config or other files unless strictly necessary
(a non-obvious *why* that the code can't express). Don't add explanatory,
narrating or section-divider comments.

## Frontend preview

`?v4`, `?v6`, `?fail` on the page URL render a documentation address or the
error state without calling `/ip`. Use them to check layout changes.
Headless Chrome won't go below ~500px wide, so check the narrow (≤480px)
IPv6 wrap with real device emulation.
