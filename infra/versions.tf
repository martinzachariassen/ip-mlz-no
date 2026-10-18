# Which Terraform and which providers this configuration needs.
#
# Providers are plugins that know how to talk to one API each. Versions are
# pinned with "~>" (allow minor/patch upgrades, not major), and the exact
# builds are locked in .terraform.lock.hcl — Dependabot bumps both.
terraform {
  required_version = "~> 1.16"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.7"
    }
    # Some Firebase resources (Hosting sites, custom domains) only exist in
    # the beta provider.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.7"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }

  # State — Terraform's record of which real resource each block maps to —
  # lives in a versioned GCS bucket (see state.tf), not on anyone's laptop.
  # Backend blocks can't use variables, so the bucket name is literal.
  backend "gcs" {
    bucket = "what-is-my-ip-f7210-tfstate"
    prefix = "infra"
  }
}
