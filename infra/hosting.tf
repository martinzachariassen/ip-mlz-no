resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  project  = google_firebase_project.this.project
  site_id  = var.project_id
}

# DNS is managed outside GCP, so the records are set by hand
# (`terraform output dns_records`).
resource "google_firebase_hosting_custom_domain" "ip" {
  provider      = google-beta
  project       = google_firebase_project.this.project
  site_id       = google_firebase_hosting_site.default.site_id
  custom_domain = var.domain

  wait_dns_verification = false
}
