variable "project_id" {
  description = "GCP/Firebase project. Fixed: project IDs can't be renamed."
  type        = string
  default     = "what-is-my-ip-f7210"
}

variable "project_name" {
  description = "Display name of the GCP project."
  type        = string
  default     = "what-is-my-ip"
}

variable "region" {
  description = "Region for regional resources. Matches the Cloud Run deploy in deploy.yml and the rewrite in firebase.json."
  type        = string
  default     = "europe-west1"
}

variable "billing_account" {
  description = "Billing account the project is charged to. Set with TF_VAR_billing_account; deliberately not committed."
  type        = string
}

variable "budget_nok" {
  description = "Monthly budget in NOK. Set with TF_VAR_budget_nok. Alerts only: GCP never stops spending at it."
  type        = number
}

variable "github_owner" {
  description = "GitHub user that owns the repository."
  type        = string
  default     = "martinzachariassen"
}

variable "github_repo" {
  description = "Repository name (without owner)."
  type        = string
  default     = "ip-mlz-no"
}

variable "domain" {
  description = "Custom domain served by Firebase Hosting."
  type        = string
  default     = "ip.mlz.no"
}
