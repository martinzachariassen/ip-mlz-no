# infra/

Everything about how ip.mlz.no is *set up* in Google Cloud and GitHub,
written down as Terraform: the project, its APIs, Firebase Hosting and the
custom domain, the keyless deploy login (Workload Identity Federation), the
deploy service account and its roles, the budget, and the repository's
settings, variables, environments and branch rules.

If it's in this folder, change it here and not in a console. A click in the
console shows up as drift in the next `terraform plan`.

## What is *not* here, and why

The rule: Terraform owns what describes the setup and changes rarely.
`firebase deploy` owns what ships on every merge.

| Not in Terraform | Where it lives instead |
|---|---|
| The `/ip` function's code and runtime settings | `functions/index.js`, deployed by `deploy.yml` |
| Hosting content, headers, cache rules, rewrites | `public/` and `firebase.json`, deployed by `deploy.yml` |
| `gcf-artifacts` registry and `gcf-*` buckets | Created and managed by `firebase deploy` |
| Google-managed service agents, default service accounts, the APIs GCP enables by default | Owned by Google; managing them adds noise and no control |
| DNS records for `ip.mlz.no` | Managed outside Terraform. `terraform output dns_records` shows what Hosting expects |

## Reading the files

Each file covers one topic. A good reading order:

1. `versions.tf`: Terraform and provider versions, and where state is kept.
2. `variables.tf`: names and IDs, defined once.
3. `project.tf`: the project, Firebase, APIs.
4. `wif.tf`: how GitHub Actions logs in to GCP without a key. This is the part
   that broke when the repo was renamed.
5. `hosting.tf`, `budget.tf`, `github.tf`, `state.tf`.
6. `imports.tf`: one-off, adopts the resources that existed before the code.

Things worth knowing when reading:

- **References.** A reference like `google_service_account.deploy.email` means
  "the email of the service account declared in this folder". Terraform uses
  references to order its work, and they keep values from drifting apart. The
  repo ID in the WIF condition comes from `github_repository.this`. The GitHub
  variables come from the GCP resources.
- **`for_each`** creates one instance per item in a set. That's how the seven
  IAM roles and the API list each stay a single readable list.
- **`prevent_destroy`** marks resources that must never be deleted: the
  project, the repository and the state bucket. Terraform refuses to plan a
  destroy for them.

## Daily use

You need `gcloud` logged in as the project owner and `gh` logged in to
GitHub. Terraform itself comes from `mise.toml`.

```sh
# Credentials only live in the shell session. Nothing is written to disk.
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export GITHUB_TOKEN="$(gh auth token)"

terraform -chdir=infra init     # once per checkout
terraform -chdir=infra plan     # what would change? (read-only)
terraform -chdir=infra apply    # shows the plan again and asks before changing anything
```

The Google token expires after an hour. Re-run the export if you get a 401.

Apply is run by hand, not in CI. CI only runs `fmt` and `validate` (the
`terraform` check). Running apply in CI would require giving the deploy
service account rights to change IAM, so it could grant itself anything.

## First-time setup (done once)

The configuration was written after the resources existed, so the first
apply *imports* them instead of creating new ones.

1. Create the state bucket. Terraform can't store its state in a bucket that
   doesn't exist yet, so this one step is manual. `state.tf` imports the
   bucket and owns its settings from then on.

   ```sh
   gcloud storage buckets create gs://what-is-my-ip-f7210-tfstate \
     --location=europe-west1 --uniform-bucket-level-access \
     --public-access-prevention \
     --project=what-is-my-ip-f7210
   ```

2. Run `init`, `plan` and `apply` as above. The plan should show only
   imports plus these changes:
   - The ruleset requires `build`, `terraform`, `review dependencies` and
     `deploy-preview`, each pinned to GitHub Actions.
   - The state bucket gets versioning and a lifecycle rule.
   - Terraform-only settings (`archive_on_destroy`) are recorded on the
     repository.

   Nothing should be destroyed.

3. Remove the old classic branch protection. The ruleset now holds every
   rule, and keeping both means two places to update.

   ```sh
   gh api -X DELETE repos/martinzachariassen/ip-mlz-no/branches/main/protection
   ```

4. Delete `imports.tf` and commit. Every import block is a no-op from here on.
