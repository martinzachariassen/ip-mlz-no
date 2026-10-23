resource "google_project" "this" {
  project_id = var.project_id
  name       = var.project_name

  # No `labels`: Firebase sets its own and Terraform must not claim them.

  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true

    # The billing link is made in the console, so the account ID stays out of
    # this public repo. Without this, apply would unlink billing.
    ignore_changes = [billing_account]
  }
}

resource "google_firebase_project" "this" {
  provider = google-beta
  project  = google_project.this.project_id
}

locals {
  services = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "this" {
  for_each = local.services

  project = google_project.this.project_id
  service = each.value

  disable_on_destroy = false
}

# The budget now lives in the console. This stops apply from deleting it;
# remove the block after the first apply.
removed {
  from = google_billing_budget.this

  lifecycle {
    destroy = false
  }
}
