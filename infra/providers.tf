provider "google" {
  project = var.project_id
  region  = var.region

  # The billing APIs refuse calls without a quota project.
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
