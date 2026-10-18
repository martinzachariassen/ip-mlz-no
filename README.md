# ip.mlz.no

[![CI](https://github.com/martinzachariassen/ip-mlz-no/actions/workflows/ci.yml/badge.svg)](https://github.com/martinzachariassen/ip-mlz-no/actions/workflows/ci.yml)

A minimal "what is my IP" site — live at [ip.mlz.no](https://ip.mlz.no).

A static frontend (plain HTML, CSS, and JS in `public/`) served by Firebase
Hosting, backed by a single small Cloud Function that echoes the caller's
real address.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png" />
    <img src="docs/screenshot-light.png" alt="The site showing an IP address in large monospace type, with the hint &quot;press C to copy plain · R for CIDR&quot; beneath it" width="720" />
  </picture>
</p>

<p align="center">
  <sub>The address shown is <a href="https://www.rfc-editor.org/rfc/rfc5737">RFC 5737</a> documentation space, not a real one.</sub>
</p>

## Features

- No frontend build step — the files in `public/` are exactly what gets
  deployed
- A scrambled-digit reveal animation and click/tap-to-copy, plus keyboard
  shortcuts: **C** copies the address, **R** copies it as a CIDR (`/32` or
  `/128`)
- One dynamic endpoint, `/ip`, rewritten to a Cloud Function — everything
  else is static and CDN-cached
- Security headers (CSP, HSTS, and friends) and cache policy defined in
  [`firebase.json`](firebase.json)

## Usage

Open the page, or call the endpoint directly:

```sh
curl https://ip.mlz.no/ip
# 203.0.113.9

curl -H 'Accept: application/json' https://ip.mlz.no/ip
# {"ip":"203.0.113.9","family":"v4"}
```

Use `https://` (or `curl -L`): plain `http://` gets Hosting's 301 redirect
rather than the address. Plain text is the default, so a bare `curl` gets a single line and errors
come back readable rather than as JSON. `family` is `v4` or `v6`. Anything
but `GET` or `HEAD` answers `405`, and the endpoint is rate limited to 20
requests per minute per address — past that it answers `429` with
`Retry-After`. Responses are never cached (`Cache-Control: no-store,
private`, `Vary: Accept`).

## Requirements

- [Bun](https://bun.sh) and Node.js 22, both pinned in
  [`mise.toml`](mise.toml) — `mise install` sets up both, or install them
  yourself and match the versions. Node 22 is what the function runs on in
  production (`engines` in `functions/package.json`), and the Functions
  emulator uses your local Node. The Firebase CLI is pulled in as a
  devDependency, so no separate install is needed.
- `functions/` is a separate npm-managed package, since Cloud Functions'
  build only recognizes npm/yarn lockfiles.

## Getting started

```sh
bun install
(cd functions && npm ci)
bun run dev     # serves public/ and /ip on http://127.0.0.1:5050
```

The Hosting emulator runs on port 5050 rather than the CLI's default 5000,
which macOS's AirPlay Receiver already holds.

Append `?v4`, `?v6`, or `?fail` to the page URL to preview the IPv4 layout,
the IPv6 layout, or the error state without real dual-stack routing. They
only change what that tab renders (`/ip` isn't called), so they work in
production as well.

```sh
bun run lint    # biome ci .
bun run format  # biome check --write .
```

```sh
./scripts/verify.sh   # boots the emulators and asserts the production contract
```

`verify.sh` is the same script CI runs and the deploy gates on, so a green
run locally means the same thing it means in Actions.

A pre-commit hook (wired up by `bun install` via the `prepare` script) runs
`bun run lint` before each commit.

## Architecture

`public/` has no server and no client-side router — every page is a real
`.html` file at a fixed path, and `public/404.html` is served as an actual
404 for anything else.

The one exception is `/ip`, rewritten by Hosting to a Cloud Function
([`functions/index.js`](functions/index.js)) that reads the caller's address
off `X-Forwarded-For`. Anything that doesn't parse as an IP address
(`net.isIP`) is refused with a `502` rather than echoed back, and an
IPv4-mapped IPv6 address (`::ffff:203.0.113.9`) is reported as the IPv4 it
carries. Its response is always `no-store`: the answer is
per-visitor by definition, so there is nothing a cache could usefully hold.

That also means every hit reaches the function rather than Hosting's CDN,
which makes `/ip` the one part of the site with a per-request cost — the
abuse story here is a cost story rather than a data one, since the address
is only ever handed back to the caller who owns it. Three things bound it,
in `functions/index.js`:

- **`maxInstances: 1`** with **`concurrency: 250`** — the hard ceiling. The
  handler is a header read, so throughput is bought with concurrency (free,
  per-instance) instead of instances (billed), and one instance still
  absorbs 250 concurrent requests — far past anything this site sees. This
  is the limit that actually holds, and it is pinned in code so a redeploy
  can't drift off it.
- **`timeoutSeconds: 10`** — an echo needs nothing near the platform
  maximum, and a short timeout is what stops a slow-reader flood from
  parking instances.
- **A per-instance rate limit**, 20 requests per minute per address, in
  memory: no Redis, no Firestore, no extra bill. Keys are validated
  addresses (at most 45 bytes) and capped at 20 000 per window, so the map
  can't grow past a few MB. With `maxInstances` at 1
  there is one instance holding one map, so 20 is a flat limit rather than
  20 × live instances — an equivalence that is load-bearing, since raising
  `maxInstances` loosens the limit by exactly that factor. On the raw Cloud
  Run URL the key is still spoofable, so it remains a speed bump with
  `maxInstances` as the wall behind it.

20/min is deliberately close to the bone: a page load costs exactly one
request (every other asset is static and CDN-served), so even someone
leaning on refresh doesn't approach it. What sets the floor isn't the
individual user but carrier-grade NAT — a mobile network can put many
subscribers behind one IPv4, and they share a bucket.

Under the emulator the limiter skips loopback, so local dev and CI's
readiness polling don't throttle themselves. The exemption is gated on
`FUNCTIONS_EMULATOR`, so production has no loopback hole; CI proves the real
limit by flooding under a spoofed `X-Forwarded-For` instead.

Ingress stays `ALLOW_ALL`: `ALLOW_INTERNAL_AND_GCLB` would block the
`cloudfunctions.net` URL that Hosting's own rewrite goes through. The raw
Cloud Run URL is therefore reachable directly, and a request that arrives
that way can spoof `X-Forwarded-For` — which changes only what that caller
is told about themselves. Through Hosting, Google's front end overwrites the
header, so the address the page shows is the real one.

[`scripts/verify.sh`](scripts/verify.sh) boots the Hosting + Functions
emulators and asserts that headers, cache rules, and `/ip` actually behave as
configured — `firebase.json`'s `headers` list is last-match-wins, so a
reorder could silently break a rule. It also floods `/ip` under a spoofed
address to prove the rate limit answers 429 at its real production value,
and checks that a forwarded value that isn't an address is refused.

That script is the whole quality gate, and all three places that care run
the identical file: locally, in CI (`.github/workflows/ci.yml`, on every PR
and push), and as the `verify` job that
[`deploy.yml`](.github/workflows/deploy.yml)'s deploy job `needs` —
`workflow_dispatch` included. So anything reaching `main` deploys only after
the contract has been re-checked against that exact commit. Deploys
authenticate to Google Cloud via Workload Identity Federation, so no
long-lived secrets are stored in the repo.

The emulators can't tell whether the real deploy will be allowed, so two
more workflows cover that:
[`preview.yml`](.github/workflows/preview.yml) logs in the same way on
every PR and deploys `public/` to a Hosting preview channel that expires
after 7 days, with the URL linked from the PR. Fork and Dependabot PRs are
skipped because GitHub gives them no OIDC token.
[`gcp-auth-check.yml`](.github/workflows/gcp-auth-check.yml) repeats the
login weekly (and on demand), read-only. That catches GCP-side breakage
such as a repo rename that happens without any PR.

## Contributing

This is a personal project, not one soliciting new features — but bug
reports and small fixes are welcome via issue or PR.

## License

[MIT](LICENSE)
