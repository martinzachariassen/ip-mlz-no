resource "google_service_account" "ip_runtime" {
  account_id   = "ip-go-runtime"
  display_name = "ip-go Cloud Run runtime"
  description  = "Identity of the /ip service. Has no roles: the service calls no Google APIs."
}
