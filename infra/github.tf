# The GitHub side: repository settings, the variables the workflows read,
# deployment environments, and the rules that protect main.

data "github_user" "owner" {
  username = var.github_owner
}

resource "github_repository" "this" {
  name         = var.github_repo
  description  = "\"What is my IP\" — a static site with a Cloud Function backend, served from Firebase Hosting. Live at ip.mlz.no."
  homepage_url = "https://${var.domain}"
  visibility   = "public"
  topics = [
    "biome", "bun", "firebase", "firebase-functions", "firebase-hosting",
    "google-cloud-functions", "ip-address", "javascript", "serverless",
    "static-site", "whatismyip",
  ]

  has_issues      = true
  has_projects    = true
  has_wiki        = false
  has_discussions = false

  allow_merge_commit     = true
  allow_squash_merge     = true
  allow_rebase_merge     = true
  allow_auto_merge       = false
  allow_update_branch    = false
  delete_branch_on_merge = false

  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"
  merge_commit_title          = "MERGE_MESSAGE"
  merge_commit_message        = "PR_TITLE"

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  # A destroy archives the repository instead of deleting it, and
  # prevent_destroy stops Terraform from planning even that.
  archive_on_destroy = true

  lifecycle {
    prevent_destroy = true
  }
}

# Dependabot alerts for vulnerable dependencies (security updates build on it).
resource "github_repository_vulnerability_alerts" "this" {
  repository = github_repository.this.name
  enabled    = true
}

# Read by deploy.yml, preview.yml and gcp-auth-check.yml. Taken straight from
# the GCP resources, so they can't drift from what wif.tf created.
resource "github_actions_variable" "wif_provider" {
  repository    = github_repository.this.name
  variable_name = "GCP_WORKLOAD_IDENTITY_PROVIDER"
  value         = google_iam_workload_identity_pool_provider.github.name
}

resource "github_actions_variable" "deploy_sa" {
  repository    = github_repository.this.name
  variable_name = "GCP_SERVICE_ACCOUNT"
  value         = google_service_account.deploy.email
}

# Environments group deployments in the GitHub UI and link to their URL.
# `production` is used by deploy.yml, `preview` by preview.yml.
resource "github_repository_environment" "this" {
  for_each = toset(["preview", "production"])

  repository  = github_repository.this.name
  environment = each.value
}

# The single source of truth for what it takes to land on main. Merging to
# main deploys to production, so every check that can catch a broken deploy
# is required here.
resource "github_repository_ruleset" "main" {
  name        = "main-protection-solo"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  # Repository admins (that's you) may bypass, e.g. to fix a broken main.
  bypass_actors {
    actor_id    = 5 # built-in "Admin" repository role
    actor_type  = "RepositoryRole"
    bypass_mode = "always"
  }

  rules {
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true
    required_signatures     = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
      allowed_merge_methods             = ["squash", "rebase"]
    }

    required_status_checks {
      strict_required_status_checks_policy = true

      # integration_id pins each check to GitHub Actions, so no other app
      # can satisfy it by posting a status with the same name.
      dynamic "required_check" {
        for_each = toset([
          "build",               # ci.yml: lint + verify.sh
          "terraform",           # ci.yml: fmt + validate of this folder
          "review dependencies", # dependency-review.yml
          "deploy-preview",      # preview.yml: real GCP login + Hosting deploy
        ])
        content {
          context        = required_check.value
          integration_id = 15368 # GitHub Actions
        }
      }
    }
  }
}
