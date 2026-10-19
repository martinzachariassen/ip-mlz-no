terraform {
  required_version = "~> 1.16"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.7"
    }
    # Hosting sites and custom domains only exist in the beta provider.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.7"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }

  # Backend blocks can't use variables.
  backend "gcs" {
    bucket = "what-is-my-ip-f7210-tfstate"
    prefix = "infra"
  }
}
