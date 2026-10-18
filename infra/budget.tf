# Monthly budget with e-mail alerts to the billing account's admins.
#
# A budget is a smoke alarm, not a cap: spending continues past 100 %. The
# real cost ceiling is maxInstances: 1 in functions/index.js.

data "google_billing_account" "this" {
  billing_account = var.billing_account
}

resource "google_billing_budget" "this" {
  billing_account = data.google_billing_account.this.id
  display_name    = "Firebase Project ${var.project_id}"

  budget_filter {
    projects               = ["projects/${google_project.this.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "NOK"
      units         = tostring(var.budget_nok)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
}
