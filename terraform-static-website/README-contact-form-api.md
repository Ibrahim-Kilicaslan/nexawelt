# 🟩 Contact Form API Extension (Lambda + API Gateway + SES)

This document extends the base static website Terraform setup with a server-side contact endpoint:

**Static website (S3 + CloudFront + Route53 + ACM) + Contact API (API Gateway + Lambda + SES)**

It replaces the `mailto:`-only behavior with a real email send to an inbox.

> **Important notes:**
> - S3 static hosting cannot directly send emails to Gmail inboxes; email sending must happen server-side (Lambda).
> - SES has a sandbox mode in many accounts. In sandbox, **both sender and recipient must be verified**.
> - DNS validation and SES domain verification are done via Route53.
> - Lambda must use **Node.js 16** runtime (see [Runtime Note](#runtime-note) below).

---

## Architecture (what gets created)

- **SES:** domain identity + DKIM (for better deliverability)
- **Lambda:** `contact-form-send-email` (receives JSON and sends email via SES)
- **API Gateway (HTTP API):** `POST /contact`

The frontend form sends JSON to the API endpoint, then shows a success or error message.

---

## 1) Prerequisites (before Terraform apply)

1. Route53 Hosted Zone must exist for your domain (base module creates it).
2. SES must be enabled in your AWS account.
3. Decide inbox destination:
   - `var.contact_to_email` defaults to `aikilicaslan@gmail.com` (can be changed in `variables.tf`).

---

## 2) Deploy with Terraform

From `terraform-static-website/`:

```sh
terraform init
terraform plan
terraform apply
```

Terraform will create SES domain verification and DKIM records in Route53 automatically.

---

## 3) Runtime Note

> ⚠️ **Use `nodejs16.x` — NOT `nodejs18.x`**

The Lambda function uses `aws-sdk` v2 (`const AWS = require("aws-sdk")`).
In Node.js 18+, `aws-sdk` v2 is **no longer included** as a built-in module and will throw:

```
Runtime.ImportModuleError: Cannot find module 'aws-sdk'
```

In `contact-api.tf`, make sure the runtime is set to:

```hcl
runtime = "nodejs16.x"
```

---

## 4) Wire the frontend to the API endpoint

Set `data-api-url` on the form element in `cv-website/index.html` to the Terraform output `contact_api_endpoint`:

```html
<form class="contact-form" data-api-url="https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com" ...>
```

> ⚠️ **Do NOT append `/contact` to `data-api-url`.**
> `scripts.js` already appends `/contact` to the base URL when making the POST request.
> Adding `/contact` in `data-api-url` will result in a double path (`/contact/contact`) and a 404 error.

The form sends JSON with these fields:
- `firstName`
- `lastName`
- `email`
- `subject`
- `message`

---

## 5) CORS Configuration

The API Gateway CORS configuration in `contact-api.tf` allows only these origins:

```hcl
allow_origins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://${var.domain_name}",
  "https://www.${var.domain_name}",
  "https://info.${var.domain_name}"
]
```

> ⚠️ **Always test the form from `https://yourdomain.com`**, not from the S3 endpoint URL.
> The S3 URL (`https://s3.us-east-1.amazonaws.com/...`) is not in the allowed origins list and will cause a CORS error.

---

## 6) SES Sandbox — Verify the Recipient

If your AWS account is in SES sandbox mode (default for new accounts), **both the sender domain and the recipient email address must be verified**.

### Verify sender domain (automatic)
Terraform creates the SES domain identity and DKIM records in Route53 automatically.

### Verify recipient email address (manual)

1. Go to **AWS SES Console → Verified identities**:
   ```
   https://console.aws.amazon.com/ses/home?region=us-east-1#/verified-identities
   ```
2. Click **"Create identity"**
3. Select **"Email address"** (not Domain)
4. Enter the recipient email (e.g. `aikilicaslan@gmail.com`)
5. Click **"Create identity"**
6. Open the inbox → find the AWS verification email (check spam too)
7. Click **"Verify this email address"** in the email
8. Status will change to **"Verified"** in SES Console

> Until the recipient is verified, Lambda will execute without errors but emails will not be delivered.

---

## 7) Test end-to-end

### Quick API test (terminal)
Before testing the frontend, verify Lambda is working directly:

```sh
curl -X POST https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/contact \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"your@email.com","subject":"Test","message":"Test message"}'
```

Expected response: `{"ok":true}`

### Frontend test
1. Deploy the updated frontend (commit + push → GitHub Actions → S3 + CloudFront)
2. Open `https://yourdomain.com`
3. Fill the contact form and click **"Nachricht senden"**
4. Check the inbox for the delivered email

---

## 8) Troubleshooting

### Lambda never runs (no CloudWatch logs)
- Check that `POST /contact` route exists in API Gateway
- Check that Lambda integration is attached to the route
- Verify the `data-api-url` in `index.html` is correct (no double `/contact`)

### Check CloudWatch logs
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fcontact-form-send-email
```

Common errors and fixes:

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module 'aws-sdk'` | Node.js 18 runtime | Change to `nodejs16.x` in `contact-api.tf` |
| `Internal Server Error` / 500 | Lambda crash | Check CloudWatch logs for details |
| `404 Not Found` | Wrong URL path | Remove `/contact` from `data-api-url` in `index.html` |
| CORS error | Wrong origin | Test from `https://yourdomain.com`, not S3 URL |
| Mail not arriving | SES sandbox | Verify recipient email in SES Console |

### Check SES sending quota
```
https://console.aws.amazon.com/ses/home?region=us-east-1#/account
```
"Emails sent" counter increasing = Lambda is calling SES successfully.

### Check SES suppression list
If an email was previously bounced, it may be on the suppression list:
```
https://console.aws.amazon.com/ses/home?region=us-east-1#/suppression-list
```

---

## Files touched in this extension

- `contact-api.tf` — API Gateway + Lambda + SES resources
- `lambda/contact/index.js` — email sending logic
- `variables.tf` — added `contact_to_email`
- `cv-website/index.html` — `data-api-url` attribute on the form

---

## What if you only want the base static site?

Use only the base `README.md`. This extension can be ignored if you do not need email sending from the contact form.