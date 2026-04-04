# NexaWelt – Automated Static Website on AWS with Terraform & GitHub Actions

> 🇹🇷 Türkçe dokümantasyon için: [README.tr.md](./README.tr.md)

This project provisions a fully automated static website hosted on AWS.
Infrastructure is managed as code with Terraform, and every push to `main` triggers automatic deployment via GitHub Actions.

---

## Features

- Static website hosted on **AWS S3**
- Global CDN and HTTPS via **AWS CloudFront**
- DNS management with **AWS Route53**
- Free wildcard SSL certificate via **AWS ACM**
- Contact form backend with **AWS Lambda + API Gateway + SES**
- Full **Infrastructure as Code** with Terraform
- Automatic CI/CD pipeline with **GitHub Actions**

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

---

## Project Structure

```
nexawelt/
├── index.html                           # Main page
├── error.html                           # Custom 404/403 error page
├── .github/
│   └── workflows/
│       └── deploy.yml                   # GitHub Actions CI/CD pipeline
├── .gitignore
├── AWS_IAM_SETUP.md                     # IAM user & GitHub Secrets guide
├── README.md                            # This file (English)
├── README.tr.md                         # Turkish documentation
└── terraform-static-website/
    ├── main.tf                          # Provider configuration
    ├── variables.tf                     # Input variables
    ├── s3.tf                            # S3 bucket
    ├── cloudfront.tf                    # CloudFront distribution
    ├── route53.tf                       # DNS records
    ├── cert.tf                          # ACM SSL certificate
    ├── contact-api.tf                   # Lambda + API Gateway + SES
    ├── outputs.tf                       # Terraform outputs
    └── lambda/
        └── contact/
            └── index.js                 # Lambda function code
```

---

## Prerequisites

- AWS account with CLI configured (`aws configure`)
- Terraform installed (`terraform -version`)
- Domain registered in AWS Route53
- GitHub account

---

## ⚠️ Critical: Duplicate Hosted Zone Problem

When you purchase a domain through AWS, a Hosted Zone is **automatically created** by the registrar.
Do **not** create a second zone with Terraform's `aws_route53_zone` resource — this causes ACM validation to hang indefinitely.

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

Find your Hosted Zone ID:
```
AWS Console → Route53 → Hosted zones → click your domain → Zone ID
```

---

## Infrastructure Setup (Terraform)

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
  default = ["nexawelt.de", "www.nexawelt.de", "info.nexawelt.de"]
}

variable "contact_to_email" {
  default = "info@nexawelt.de"
}
```

In `route53.tf`, set your Zone ID:

```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"
}
```

### 3. Initialize Terraform

```bash
terraform init
```

### 4. ⚠️ Two-Step Apply (Required)

Direct `terraform apply` will fail because ACM validation records use `for_each` and Terraform cannot determine the keys until the certificate exists.

**Step 1 — Create ACM certificate first:**
```bash
terraform apply -target=aws_acm_certificate.cert -target=aws_route53_zone.main
```

**Step 2 — Create all remaining resources:**
```bash
terraform apply
```

> `aws_acm_certificate_validation` may take 5–15 minutes while DNS propagates. This is normal — do not close the terminal.

### 5. Outputs

```
cloudfront_domain_name = "xxxxx.cloudfront.net"
contact_api_endpoint   = "https://xxxxx.execute-api.us-east-1.amazonaws.com"
route53_zone_name      = "nexawelt.de"
s3_website_endpoint    = "nexawelt.de.s3-website-us-east-1.amazonaws.com"
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

See [AWS_IAM_SETUP.md](./AWS_IAM_SETUP.md) for full IAM permissions guide.

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

## Local Development

```bash
# Preview locally
python3 -m http.server 8080
# or use VS Code Live Server
```

### Push Changes

```bash
git add .
git commit -m "your message"
git push
```

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

## Lambda Runtime Note

> ⚠️ **`nodejs16.x` is deprecated — use `nodejs20.x`**

In `contact-api.tf`:

```hcl
runtime = "nodejs20.x"
```

With `nodejs20.x`, use SDK v3 in Lambda:

```javascript
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
```

---

## SES Sandbox Mode

New AWS accounts are in SES sandbox mode by default. Both sender domain and recipient email must be verified.

**Verify recipient email:**
```
AWS Console → SES → Verified identities → Create identity → Email address
```

**Request production access:**
```
AWS Console → SES → Account dashboard → Request production access
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Site returns 403 | S3 bucket empty | Deploy manually with `aws s3 sync` |
| ACM stuck at "Pending Validation" | Wrong hosted zone | Use registrar zone ID in `route53.tf` |
| `EntityAlreadyExists` on Lambda permission | Statement ID conflict from another site | Use unique `statement_id` per site |
| GitHub Actions not triggering | Missing secrets or wrong workflow path | Check secrets and `.github/workflows/deploy.yml` |
| `Cannot find module 'aws-sdk'` | Using SDK v2 with nodejs18+ | Switch to `nodejs20.x` and use SDK v3 |
| DNS not resolving | NS records mismatch | Check NS records in Route53 and registrar |
| CloudFront not updating | Cache not invalidated | Run `create-invalidation --paths '/*'` |

---

## Best Practices

- Never commit AWS credentials or Terraform state to git
- Use `.gitignore` to exclude `.terraform/`, `*.tfstate`, `.build/`
- No manual changes in AWS Console — everything via Terraform
- Rotate AWS IAM keys regularly
- Test locally before pushing

---

## Resources

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [AWS CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [AWS Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [AWS SES Sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [GitHub Actions – Configure AWS Credentials](https://github.com/aws-actions/configure-aws-credentials)

---

## Author

Ibrahim Kilicaslan — [github.com/Ibrahim-Kilicaslan](https://github.com/Ibrahim-Kilicaslan)

---

## License

MIT