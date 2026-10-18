# Credentials come from the environment, never from files in this repo:
#   GOOGLE_OAUTH_ACCESS_TOKEN  (gcloud auth print-access-token)
#   GITHUB_TOKEN               (gh auth token)
# See README.md.

provider "google" {
  project = var.project_id
  region  = var.region

  # Bill API quota to this project instead of whatever project gcloud happens
  # to have as default. The budgets API refuses calls without it.
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "github" {
  owner = var.github_owner
}
