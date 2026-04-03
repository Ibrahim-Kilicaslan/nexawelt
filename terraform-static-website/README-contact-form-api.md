# NexaWelt – AWS Static Website Infrastructure

> 🇹🇷 Türkçe dokümantasyon için: [README.tr.md](./README.tr.md)

This repository provisions a fully automated static website infrastructure on AWS.
All resources are managed as code with Terraform, and every push to `main` triggers an automatic deployment via GitHub Actions.

---

## Architecture

```
Internet
    │
    ▼
Route53 (nexawelt.de)
    │
    ▼
CloudFront (CDN + HTTPS + Cache)
    │
    ▼
S3 Bucket (static files)
    │
    ├── Lambda (contact-form-send-email)
    │       │
    │       ▼
    │     SES (email delivery)
    │
    └── API Gateway (POST /contact)
```

**AWS Resources Created:**
- Route53 DNS records
- ACM SSL Certificate (us-east-1, wildcard)
- S3 Bucket (static file hosting)
- CloudFront Distribution (CDN)
- Lambda Function (contact form handler)
- API Gateway HTTP API
- SES Domain Identity + DKIM

---

## Prerequisites

Before you begin, make sure you have:

- An AWS account with CLI configured (`aws configure`)
- Terraform installed (`terraform -version`)
- A domain registered in AWS Route53
- A GitHub account

---

## ⚠️ Critical: Duplicate Hosted Zone Problem

When you purchase a domain through AWS, a Hosted Zone is **automatically created** by the registrar.
Do **not** create a second zone with Terraform's `aws_route53_zone` resource — this causes a conflict and ACM validation will hang indefinitely.

**Wrong (do not use):**
```hcl
resource "aws_route53_zone" "main" {
  name = var.domain_name
}
```

**Correct (use this):**
```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"  # copy from AWS Console
}
```

To find your Hosted Zone ID:
```
AWS Console → Route53 → Hosted zones → click your domain → Zone ID
```

---

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Ibrahim-Kilicaslan/nexawelt.git
cd nexawelt/terraform-static-website
```

### 2. Update Variables

In `variables.tf`:

```hcl
variable "domain_name" {
  default = "nexawelt.de"
}

variable "aliases" {
  default = [
    "nexawelt.de",
    "www.nexawelt.de",
    "info.nexawelt.de"
  ]
}

variable "contact_to_email" {
  default = "info@nexawelt.de"
}
```

In `route53.tf`:

```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"   # your Zone ID
}
```

### 3. Terraform Init

```bash
terraform init
```

### 4. ⚠️ Two-Step Apply (Required)

Running `terraform apply` directly will fail. The ACM certificate validation records use `for_each`, but Terraform cannot determine the map keys until the certificate exists.

**Step 1 — Create ACM certificate first:**
```bash
terraform apply -target=aws_acm_certificate.cert -target=aws_route53_zone.main
```

> Only 2 resources are created. Type "yes" and wait (~30–60 seconds).

**Step 2 — Create all remaining resources:**
```bash
terraform apply
```

> The `aws_acm_certificate_validation` resource may take 5–15 minutes while AWS waits
> for DNS propagation. This is normal — do not close the terminal.

### 5. Outputs

```
cloudfront_domain_name = "xxxxx.cloudfront.net"
contact_api_endpoint   = "https://xxxxx.execute-api.us-east-1.amazonaws.com"
route53_zone_name      = "nexawelt.de"
s3_website_endpoint    = "nexawelt.de.s3-website-us-east-1.amazonaws.com"
```

To get the CloudFront Distribution ID:
```bash
aws cloudfront list-distributions \
  --query 'DistributionList.Items[*].[Id,DomainName]' \
  --output table
```

---

## GitHub Actions Setup

### Required Secrets

GitHub → repository → Settings → Secrets and variables → Actions → New repository secret

| Secret | Value | Where to Find |
|--------|-------|---------------|
| `AWS_ACCESS_KEY_ID` | IAM access key | `~/.aws/credentials` |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key | `~/.aws/credentials` |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ID | Terraform output or AWS Console |

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::nexawelt.de",
        "arn:aws:s3:::nexawelt.de/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "*"
    }
  ]
}
```

### Pipeline Flow

```
git push → main branch
    │
    ▼
GitHub Actions triggered
    │
    ├── Configure AWS credentials
    ├── Copy files to deploy-temp/
    ├── HTML  → S3 (no-cache)
    ├── CSS/JS → S3 (5 min cache)
    ├── Assets → S3 (1 hour cache)
    ├── CloudFront cache invalidation
    └── Site availability check
```

> Changes inside `terraform-static-website/**` do not trigger the pipeline.

---

## Lambda Runtime Note

> ⚠️ **`nodejs16.x` is deprecated — use `nodejs20.x`**

In `contact-api.tf`:

```hcl
runtime = "nodejs20.x"
```

With `nodejs20.x`, use the v3 SDK in Lambda:

```javascript
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
```

---

## SES Sandbox Mode

New AWS accounts are in SES sandbox mode by default. Both the sender domain and the recipient email must be verified.

**Verify recipient email:**
```
AWS Console → SES → Verified identities → Create identity → Email address
```

**Request production access:**
```
AWS Console → SES → Account dashboard → Request production access
```

---

## Contact Form API Test

```bash
curl -X POST https://XXXXX.execute-api.us-east-1.amazonaws.com/contact \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "subject": "Test",
    "message": "Test message"
  }'
```

Expected response: `{"ok":true}`

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Site returns 403 | S3 bucket empty | Deploy manually with `aws s3 sync` |
| ACM stuck at "Pending Validation" | Wrong hosted zone | Use registrar zone ID in `route53.tf` |
| `EntityAlreadyExists` on Lambda permission | Statement ID conflict | Use unique `statement_id` per site |
| GitHub Actions not triggering | Missing secrets or wrong file path | Check secrets and `.github/workflows/deploy.yml` |
| `Cannot find module 'aws-sdk'` | Using v2 SDK with nodejs18+ | Switch to `nodejs20.x` and use SDK v3 |

### Manual Deploy (when Actions fails)

```bash
aws s3 sync ./ s3://nexawelt.de \
  --exclude "terraform-static-website/*" \
  --exclude ".github/*" \
  --exclude ".git/*" \
  --exclude "*.md"

aws cloudfront create-invalidation \
  --distribution-id EXXXXXXXXXX \
  --paths "/*"
```

---

## Project Structure

```
nexawelt/
├── index.html
├── error.html
├── .github/
│   └── workflows/
│       └── deploy.yml
└── terraform-static-website/
    ├── main.tf
    ├── variables.tf
    ├── s3.tf
    ├── cloudfront.tf
    ├── route53.tf
    ├── cert.tf
    ├── contact-api.tf
    ├── outputs.tf
    └── lambda/
        └── contact/
            └── index.js
```

---

## References

- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS SES Sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [GitHub Actions – Configure AWS Credentials](https://github.com/aws-actions/configure-aws-credentials)