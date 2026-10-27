# Changelog

All notable changes to ip.mlz.no are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-10-27

### Added

- A quiet footer with a link back to [mlz.no](https://mlz.no) and the
  command `$ curl ip.mlz.no/ip`, on the home and 404 pages. On the home page,
  clicking the command copies it and the hint line confirms. The footer
  hides on very short viewports so it never crowds the address.
- README and `llms.txt` show `curl -4` and `curl -6` to force an address
  family.
- An Open Graph card (`public/assets/social/og.png`, 1200×630) rendered from
  `tools/og/og.html`, with `summary_large_image` for link previews.
- JSON-LD (`WebApplication`) and `llms.txt` describing the page and `/ip`.
- 512px and maskable app icons in the web manifest.
- `CHANGELOG.md`, a pull request template, a bug report issue form and
  `CODEOWNERS`.

### Changed

- Aligned with the mlz brand: the favicon is the brand mark, dark-theme
  `--fg-muted` matches the brand value, and the brand's `--fg-secondary`,
  `--border` and `--radius` tokens are available.
- Clearer page and manifest description that mentions the `/ip` endpoint.
- README gets a light/dark site banner and a link row, in line with mlz.no.
- `package.json` `version` now tracks releases (it was left at 1.0.0 for
  2.0.0).
- `CLAUDE.md` documents commits, pull requests and the release process.

## [2.0.0] - 2026-10-23

### Changed

- `/ip` is now served by a Go Cloud Run service (`ip-go`) instead of Cloud
  Functions. Hosting rewrites `/ip` to it. The response is unchanged: the bare
  address as plain text, `no-store` (#14).
- `ip-go` runs as the role-less `ip-go-runtime` service account, validates the
  forwarded address before echoing it, and is capped at one instance (#14).
- Full review: hardening, developer-experience fixes, cleanup and docs (#12).
- The project is renamed to `ip-mlz-no` (#10).

### Removed

- Cloud Functions and its leftovers (#15).

### Infrastructure

- GCP and GitHub setup is managed with Terraform in `infra/`: project, APIs,
  Workload Identity Federation (matched on the numeric repository ID), deploy
  and runtime service accounts, Hosting site and domain, and repo settings
  (#12, #14).
- Billing account and budget are no longer Terraform inputs (#16, #17).
- `.gitignore` and redundant config comments trimmed (#18).

### Dependencies

- Routine updates of Bun packages, GitHub Actions and the then-current
  functions dependencies (#3, #6, #7, #8, #9, #11).

## [1.0.0] - 2026-09-06

### Added

- First release of ip.mlz.no: the visitor's public IPv4 or IPv6 address in
  large type, fitted to the screen, with click or **C** to copy and **R** to
  copy as CIDR, light and dark themes, and a plain-text `/ip` endpoint.

[2.1.0]: https://github.com/martinzachariassen/ip-mlz-no/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/martinzachariassen/ip-mlz-no/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/martinzachariassen/ip-mlz-no/releases/tag/v1.0.0
