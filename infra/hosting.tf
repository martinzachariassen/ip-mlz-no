# The Hosting site and its custom domain. What the site *serves* (files,
# headers, the /ip rewrite) is firebase.json + `firebase deploy`, not this.

resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  project  = google_firebase_project.this.project
  site_id  = var.project_id
}

# DNS is managed outside GCP, so Terraform can't create the
# records. `terraform output dns_records` lists what Hosting expects.
resource "google_firebase_hosting_custom_domain" "ip" {
  provider      = google-beta
  project       = google_firebase_project.this.project
  site_id       = google_firebase_hosting_site.default.site_id
  custom_domain = var.domain

  wait_dns_verification = false
}
