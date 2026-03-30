# 🟩 Contact Form API Extension (Lambda + API Gateway + SES)

This document extends the base static website Terraform setup with a server-side contact endpoint:

Static website (S3 + CloudFront + Route53 + ACM) + Contact API (API Gateway + Lambda + SES)

It replaces the `mailto:`-only behavior with a real email send to an inbox.

Important notes:
- S3 static hosting cannot directly send emails to Gmail inboxes; the email sending must happen on the server side (Lambda).
- SES has a sandbox mode in many accounts. In sandbox, the recipient must be verified (manual step).
- DNS validation and SES domain verification are done via Route53.

---

## Architecture (what gets created)
- SES: domain identity + DKIM (for better deliverability)
- Lambda: `contact-form-send-email` (receives JSON and sends email via SES)
- API Gateway (HTTP API): `POST /contact`

The frontend form should send JSON to the API endpoint, then show a success message.

---

## 1) Prerequisites (before Terraform apply)
1. Route53 Hosted Zone must exist for your domain (base module creates it).
2. SES must be enabled in AWS (SES console or account setup).
3. Decide inbox destination:
   - `var.contact_to_email` defaults to `aikilicaslan@gmail.com` (can be changed).

---

## 2) Deploy with Terraform

From `terraform-static-website/`:

```sh
terraform init
terraform plan
terraform apply
```

Terraform will create SES verification records in Route53 automatically.

---

## 3) Wire the frontend to the API endpoint

Your contact form JS should POST to the API endpoint:
- Look for `data-api-url` on the form element in `cv-website/index.html`.
- Set it to the Terraform output `contact_api_endpoint`.

Example:
```html
<form class="contact-form" data-api-url="https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com" ...>
```

The form must be sending JSON with:
- `firstName`
- `lastName`
- `email`
- `subject`
- `message`

---

## 4) Test end-to-end
1. Deploy the updated frontend (commit + GitHub Actions so S3 gets the new HTML/JS).
2. Open the site.
3. Fill the contact form and click `Nachricht senden`.
4. Check the inbox for the delivered email.

If SES is in sandbox and delivery does not arrive:
- Verify the recipient address in SES (manual, from SES console).

---

## Files touched in this extension
- `contact-api.tf` (API Gateway + Lambda + SES resources)
- `lambda/contact/index.js` (email sending logic)
- `terraform-static-website/variables.tf` (added `contact_to_email`)

---

## SES Sandbox Troubleshooting
If emails are not delivered:
- SES sandbox requires verified recipients.
- Ensure the Lambda execution role has `ses:SendEmail` permission.
- Ensure `FROM` domain identity is verified (Terraform creates verification records).

---

## What if you only want the base static site?
Use only the base README (`README.md`). This extension can be ignored if you do not need email sending.

