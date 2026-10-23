# Changelog

## 2.0.0 - 2026-10-23

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
  and runtime service accounts, Hosting site and domain, and repo settings (#12, #14).
- Billing account and budget are no longer Terraform inputs (#16, #17).
- `.gitignore` and redundant config comments trimmed (#18).

### Dependencies

- Routine updates of Bun packages, GitHub Actions and the then-current
  functions dependencies (#3, #6, #7, #8, #9, #11).

## 1.0.0 - 2026-09-06

- Initial release of ip.mlz.no.
