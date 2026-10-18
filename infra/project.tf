# The GCP project itself, Firebase on top of it, and the APIs the site uses.

resource "google_project" "this" {
  project_id      = var.project_id
  name            = var.project_name
  billing_account = var.billing_account

  # No `labels`: the firebase=enabled / firebase-core labels are set by
  # Firebase itself, and declaring them here would only make Terraform claim
  # ownership of something it doesn't control.

  # Deleting the project would take the site, the function and all IAM with
  # it. Terraform refuses to even plan that.
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firebase_project" "this" {
  provider = google-beta
  project  = google_project.this.project_id
}

# Only the APIs the site actually depends on. GCP switches on a dozen more by
# default (BigQuery, Datastore, ...); those are left alone rather than
# managed, since disabling them buys nothing.
locals {
  services = toset([
    "artifactregistry.googleapis.com", # function container images
    "billingbudgets.googleapis.com",   # budget.tf
    "cloudbilling.googleapis.com",
    "cloudbuild.googleapis.com", # builds the function on deploy
    "cloudfunctions.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "eventarc.googleapis.com", # required by 2nd-gen functions
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com", # WIF service-account impersonation
    "pubsub.googleapis.com",
    "run.googleapis.com", # 2nd-gen functions run on Cloud Run
    "serviceusage.googleapis.com",
    "storage.googleapis.com", # function sources, Terraform state
    "sts.googleapis.com",     # WIF token exchange
  ])
}

resource "google_project_service" "this" {
  for_each = local.services

  project = google_project.this.project_id
  service = each.value

  # Removing a line here stops Terraform managing the API; it doesn't switch
  # it off under the running site.
  disable_on_destroy = false
}
