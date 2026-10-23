output "workload_identity_provider" {
  description = "Full provider name, as used by google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  description = "Service account the workflows impersonate."
  value       = google_service_account.deploy.email
}

output "ip_runtime_service_account" {
  description = "Service account ip-go runs as (--service-account in deploy.yml)."
  value       = google_service_account.ip_runtime.email
}

output "dns_records" {
  description = "DNS records Firebase Hosting expects for the custom domain (set at the DNS provider)."
  value       = google_firebase_hosting_custom_domain.ip.required_dns_updates
}
