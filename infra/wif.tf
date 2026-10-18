# Keyless deploys: GitHub Actions -> Workload Identity Federation -> gh-deploy.
#
# GitHub signs an OIDC token for each workflow run. Google trusts tokens from
# GitHub's issuer (the provider below), but only if the attribute condition
# passes, and only principals with workloadIdentityUser on gh-deploy may
# impersonate it. No key is ever created or stored.
#
# Both checks use the repository's numeric *ID*, not its name. The first
# setup matched on the name, and renaming the repo silently broke every
# deploy. IDs survive renames and transfers.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "OIDC federation for GitHub Actions workflows"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions OIDC"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # Claims copied from GitHub's token into attributes Google can match on.
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }

  # Tokens from any other repository are rejected before they reach IAM.
  attribute_condition = "assertion.repository_id == '${github_repository.this.repo_id}' && assertion.repository_owner_id == '${data.github_user.owner.id}'"
}

resource "google_service_account" "deploy" {
  account_id   = "gh-deploy"
  display_name = "GitHub Actions deployer"
}

# What `firebase deploy --only hosting,functions` needs, and nothing more.
locals {
  deploy_roles = toset([
    "roles/artifactregistry.writer",           # push the function image
    "roles/cloudbuild.builds.editor",          # build it
    "roles/cloudfunctions.admin",              # create/update the function
    "roles/firebasehosting.admin",             # releases and preview channels
    "roles/iam.serviceAccountUser",            # run the function as its runtime SA
    "roles/run.admin",                         # 2nd-gen functions are Cloud Run services
    "roles/serviceusage.serviceUsageConsumer", # call APIs billed to the project
  ])
}

resource "google_project_iam_member" "deploy" {
  for_each = local.deploy_roles

  project = google_project.this.project_id
  role    = each.value
  member  = google_service_account.deploy.member
}

# Any workflow run in this repository (by ID) may impersonate gh-deploy.
resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${github_repository.this.repo_id}"
}
