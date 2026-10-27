<p align="center">
  <a href="https://ip.mlz.no">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png" />
      <img src=".github/assets/banner-light.png" alt="The site showing the documentation address 203.0.113.42 in large type, the hint &quot;press C to copy plain · R for CIDR&quot; beneath it, and a footer reading &quot;mlz.no · $ curl ip.mlz.no/ip&quot;" width="100%" />
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://github.com/martinzachariassen/ip-mlz-no/actions/workflows/ci.yml"><img src="https://github.com/martinzachariassen/ip-mlz-no/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/martinzachariassen/ip-mlz-no" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://ip.mlz.no"><b>Live site</b></a>
  &nbsp;·&nbsp;
  <a href="#usage"><b>Usage</b></a>
  &nbsp;·&nbsp;
  <a href="#development"><b>Development</b></a>
  &nbsp;·&nbsp;
  <a href="#cicd"><b>Deploys</b></a>
  &nbsp;·&nbsp;
  <a href="CHANGELOG.md"><b>Changelog</b></a>
</p>

A minimal "what is my IP" site, live at [ip.mlz.no](https://ip.mlz.no). It
shows your public IPv4 or IPv6 address in large type, copies it on click, and
serves it as plain text at `/ip`.

It is a static frontend on Firebase Hosting plus one small Go service on Cloud
Run, with no frontend build step. The address in the banner is
[RFC 5737](https://www.rfc-editor.org/rfc/rfc5737) documentation space, not a
real one.

## Features

- Click or tap to copy. **C** copies the address, **R** copies it as a CIDR
  (`/32` or `/128`). The `$ curl ip.mlz.no/ip` in the footer copies the
  command.
- IPv4 and IPv6, with type sized to fit the address on any screen.
- Light and dark themes that follow the system setting, with colours and icons
  from the [mlz brand](https://mlz.no/brand/BRAND.md).
- A social card for link previews, JSON-LD and an
  [`llms.txt`](public/llms.txt).
- Strict security headers: a `'self'`-only CSP, self-hosted fonts and no
  third-party requests.

## Usage

Open the page, or call the endpoint directly:

```sh
curl https://ip.mlz.no/ip
# 203.0.113.9

curl -4 https://ip.mlz.no/ip   # force IPv4
curl -6 https://ip.mlz.no/ip   # force IPv6, if your network has it
```

The response is the bare address as plain text. It is never cached
(`Cache-Control: no-store, private`), and anything other than `GET` or `HEAD`
answers `405`. Use `https://`: plain `http://` gets a redirect rather than the
address.

## Architecture

```
Browser ──► Firebase Hosting ──► static files from public/
                 │
                 └─ /ip ──► Cloud Run service ip-go (europe-west1)
```

`public/` is plain HTML, CSS and ES modules, served exactly as committed.
Hosting adds the security headers and cache policy
([`firebase.json`](firebase.json)) and rewrites `/ip` to the Cloud Run service
([`server/main.go`](server/main.go)).

The service reads the caller's address from `X-Forwarded-For` and only
echoes it back if it parses as an IP address. An IPv4-mapped IPv6 address is
reported as the IPv4 it carries. Because every `/ip` request reaches the
service, it is the one part of the site with a per-request cost. That cost is
bounded by `--max-instances 1`, a 10 second timeout and a budget alert
set in the GCP console. There is no rate limiter. The service
runs as its own service account with no roles
([`infra/run.tf`](infra/run.tf)), not as the project's default account.

The raw Cloud Run URL is also reachable and its `X-Forwarded-For` is
caller-controlled. A request that spoofs it only changes what that caller is
told about themselves. Through Hosting, Google's front end sets the header, so
the address the page shows is the real one.

## Development

Requires [Bun](https://bun.sh), Node.js 22 and Go 1.25. All are pinned in
[`mise.toml`](mise.toml), so `mise install` sets them up. The Firebase CLI is a
devDependency. `server/` is a standard-library-only Go module.

```sh
bun install

bun run dev           # Hosting emulator: http://127.0.0.1:5050
bun run dev:server    # Go /ip service: http://127.0.0.1:8080/ip
bun run test:server   # go vet and go test
bun run lint          # biome ci . and a gofmt check
bun run format        # biome check --write . and gofmt -w
./scripts/verify.sh   # tests the service, boots the emulator, asserts the contract
```

The emulator uses port 5050 because macOS holds 5000 for AirPlay. Add `?v4`,
`?v6` or `?fail` to the page URL to preview the IPv4 layout, the IPv6 layout
or the error state without calling `/ip`.

[`scripts/verify.sh`](scripts/verify.sh) checks the security headers, cache
rules, the custom 404 page and the `/ip` contract. The Hosting emulator can't
run Cloud Run, so `/ip` is checked against the Go service directly. It is the
quality gate: CI and the deploy job run the same file. A pre-commit hook,
installed by `bun install`, runs `bun run lint`, which also checks `gofmt`.

<details>
<summary><strong>Social card</strong></summary>

`public/assets/social/og.png` (the 1200×630 Open Graph image) is rendered from
[`tools/og/og.html`](tools/og/og.html) using the site's tokens and fonts (light
theme). Regenerate it whenever those or the hint text change:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &   # serve the repo root
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --hide-scrollbars --window-size=1200,630 --force-device-scale-factor=1 \
  --virtual-time-budget=4000 --screenshot=public/assets/social/og.png \
  http://127.0.0.1:8765/tools/og/og.html
kill %1
```

</details>

<details>
<summary><strong>README banner</strong></summary>

The banner at the top of this file is a screenshot of the page with the
`?v4` documentation address in each theme, kept in `.github/assets/` so it is
not deployed. Retake it after a visible change to the page:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory public &
for theme in light:1 dark:0; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
    --hide-scrollbars --window-size=1280,720 --force-device-scale-factor=2 \
    --force-prefers-reduced-motion \
    --blink-settings=preferredColorScheme=${theme#*:} \
    --virtual-time-budget=4000 \
    --screenshot=.github/assets/banner-${theme%:*}.png "http://127.0.0.1:8766/?v4"
done
kill %1
```

`--force-prefers-reduced-motion` skips the scramble animation.

</details>

## CI/CD

| Workflow | Runs on | Does |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | PRs and pushes to `main` | Lint, `verify.sh`, `terraform fmt` and `validate` |
| [`dependency-review.yml`](.github/workflows/dependency-review.yml) | PRs | Blocks dependencies with known vulnerabilities |
| [`preview.yml`](.github/workflows/preview.yml) | PRs | Deploys `public/` to a Hosting preview channel that expires after 7 days |
| [`deploy.yml`](.github/workflows/deploy.yml) | Push to `main`, manual | Runs `verify.sh`, then deploys the Cloud Run service and Hosting |
| [`gcp-auth-check.yml`](.github/workflows/gcp-auth-check.yml) | Weekly, manual | Read-only check that the GCP login still works |

Workflows authenticate to Google Cloud with Workload Identity Federation, so
the repository stores no long-lived credentials. Fork and Dependabot PRs skip
the preview because GitHub gives them no OIDC token.

## Infrastructure

The Google Cloud and GitHub setup is Terraform in [`infra/`](infra/): the
project and its APIs, Hosting and the custom domain, the deploy login and its
roles, the service's runtime account, and the repository settings
and branch ruleset. The service and the site content are not in Terraform.
They ship from `deploy.yml`, with Cloud Build and `firebase deploy`. `plan`
and `apply` are run by hand, so the deploy account never needs rights to
change IAM. See [`infra/README.md`](infra/README.md).

## Contributing

This is a personal project, so new features are unlikely to be merged, but bug
reports and small fixes are welcome as an issue or a pull request.

- `bun run lint` and `./scripts/verify.sh` must pass.
- Commits must be signed. `main` requires linear history, and PRs are squashed
  or rebased.

## License

[MIT](LICENSE)
