# The bucket holding Terraform's own state (see the backend in versions.tf).
#
# Chicken and egg: Terraform needs the bucket before it can store anything,
# so it is created once by hand (README.md, "First-time setup") and then
# imported, so its settings are code like everything else.

resource "google_storage_bucket" "tfstate" {
  name     = "${var.project_id}-tfstate"
  location = upper(var.region)

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Every write keeps the previous state as an older version, so a bad apply
  # can be rolled back. Old versions are pruned after the newest 10.
  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
