# NexaWelt – AWS Statik Web Sitesi Altyapısı

> 🇬🇧 For English documentation: [README.md](./README.md)

Bu repo, AWS üzerinde tam otomatik bir statik web sitesi altyapısı kurar.
Tüm kaynaklar Terraform ile kod olarak yönetilir, `main` branch'ine her push'ta GitHub Actions aracılığıyla otomatik deploy edilir.

---

## Mimari

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
S3 Bucket (statik dosyalar)
    │
    ├── Lambda (contact-form-send-email)
    │       │
    │       ▼
    │     SES (e-posta gönderimi)
    │
    └── API Gateway (POST /contact)
```

**Oluşturulan AWS Kaynakları:**
- Route53 DNS kayıtları
- ACM SSL Sertifikası (us-east-1, wildcard)
- S3 Bucket (statik dosya barındırma)
- CloudFront Distribution (CDN)
- Lambda Function (iletişim formu)
- API Gateway HTTP API
- SES Domain Identity + DKIM

---

## Ön Koşullar

Başlamadan önce aşağıdakilerin hazır olması gerekir:

- AWS hesabı ve CLI kurulumu (`aws configure`)
- Terraform kurulumu (`terraform -version`)
- AWS Route53'te kayıtlı domain
- GitHub hesabı

---

## ⚠️ Kritik: Çift Hosted Zone Sorunu

AWS'den domain satın aldığında registrar tarafından **otomatik olarak bir Hosted Zone** oluşturulur.
Terraform'un `aws_route53_zone` resource'u ile **ikinci bir zone oluşturma** — çakışma olur ve ACM validation süresiz takılır.

**Yanlış (kullanma):**
```hcl
resource "aws_route53_zone" "main" {
  name = var.domain_name
}
```

**Doğru (bunu kullan):**
```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"  # AWS Console'dan kopyala
}
```

Hosted Zone ID'yi bulmak için:
```
AWS Console → Route53 → Hosted zones → domain adına tıkla → Zone ID
```

---

## Kurulum

### 1. Repoyu Klonla

```bash
git clone https://github.com/Ibrahim-Kilicaslan/nexawelt.git
cd nexawelt/terraform-static-website
```

### 2. Değişkenleri Güncelle

`variables.tf` dosyasında:

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

`route53.tf` dosyasında Zone ID'yi güncelle:

```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"   # kendi Zone ID'n
}
```

### 3. Terraform Init

```bash
terraform init
```

### 4. ⚠️ İki Adımlı Apply (Zorunlu)

Direkt `terraform apply` çalışmaz. ACM validation kayıtları `for_each` ile oluşturuluyor ancak Terraform, sertifika mevcut olmadan key'leri belirleyemiyor.

**1. Adım — Önce ACM sertifikasını oluştur:**
```bash
terraform apply -target=aws_acm_certificate.cert -target=aws_route53_zone.main
```

> Sadece 2 kaynak oluşur. "yes" yaz ve bekle (~30–60 saniye).

**2. Adım — Geri kalan tüm kaynakları oluştur:**
```bash
terraform apply
```

> `aws_acm_certificate_validation` kaynağı, DNS yayılmasını beklerken 5–15 dakika sürebilir.
> Bu normaldir — terminali kapatma.

### 5. Çıktılar

Apply tamamlandığında:

```
cloudfront_domain_name = "xxxxx.cloudfront.net"
contact_api_endpoint   = "https://xxxxx.execute-api.us-east-1.amazonaws.com"
route53_zone_name      = "nexawelt.de"
s3_website_endpoint    = "nexawelt.de.s3-website-us-east-1.amazonaws.com"
```

CloudFront Distribution ID için:
```bash
aws cloudfront list-distributions \
  --query 'DistributionList.Items[*].[Id,DomainName]' \
  --output table
```

---

## GitHub Actions Kurulumu

### Gerekli Secrets

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | Değer | Nereden Bulunur |
|--------|-------|-----------------|
| `AWS_ACCESS_KEY_ID` | IAM access key | `~/.aws/credentials` |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key | `~/.aws/credentials` |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ID | Terraform output veya AWS Console |

### Gerekli IAM İzinleri

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

### Pipeline Akışı

```
git push → main branch
    │
    ▼
GitHub Actions tetiklenir
    │
    ├── AWS credentials yapılandır
    ├── Dosyaları deploy-temp/ klasörüne kopyala
    ├── HTML  → S3 (no-cache)
    ├── CSS/JS → S3 (5 dakika cache)
    ├── Assets → S3 (1 saat cache)
    ├── CloudFront cache invalidation
    └── Site erişilebilirlik testi
```

> `terraform-static-website/**` içindeki değişiklikler pipeline'ı tetiklemez.

---

## Lambda Runtime Notu

> ⚠️ **`nodejs16.x` deprecated — `nodejs20.x` kullan**

`contact-api.tf` dosyasında:

```hcl
runtime = "nodejs20.x"
```

`nodejs20.x` ile Lambda kodunda v3 SDK kullan:

```javascript
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
```

---

## SES Sandbox Modu

Yeni AWS hesapları varsayılan olarak SES sandbox modundadır.
Sandbox'ta hem gönderen domain hem de alıcı e-posta doğrulanmış olmalıdır.

**Alıcı e-postayı doğrula:**
```
AWS Console → SES → Verified identities → Create identity → Email address
```

**Production'a geçmek için:**
```
AWS Console → SES → Account dashboard → Request production access
```

---

## İletişim Formu API Testi

```bash
curl -X POST https://XXXXX.execute-api.us-east-1.amazonaws.com/contact \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Kullanıcı",
    "email": "test@example.com",
    "subject": "Test",
    "message": "Test mesajı"
  }'
```

Beklenen yanıt: `{"ok":true}`

---

## Sorun Giderme

| Sorun | Neden | Çözüm |
|-------|-------|-------|
| Site 403 hatası veriyor | S3 bucket boş | `aws s3 sync` ile manuel deploy et |
| ACM "Pending Validation" takılı | Yanlış hosted zone | `route53.tf`'de registrar zone ID'sini kullan |
| Lambda permission `EntityAlreadyExists` | Statement ID çakışması | Benzersiz `statement_id` kullan |
| GitHub Actions çalışmıyor | Eksik secret veya yanlış dosya yolu | Secrets ve `.github/workflows/deploy.yml` kontrol et |
| `Cannot find module 'aws-sdk'` | nodejs18+ ile v2 SDK | `nodejs20.x` kullan ve v3 SDK'ya geç |

### Manuel Deploy (Actions çalışmadığında)

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

## Proje Yapısı

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

## Kaynaklar

- [AWS CloudFront Dokümantasyonu](https://docs.aws.amazon.com/cloudfront/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS SES Sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [GitHub Actions – AWS Credentials](https://github.com/aws-actions/configure-aws-credentials)