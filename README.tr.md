# NexaWelt – Terraform & GitHub Actions ile AWS Üzerinde Otomatik Statik Web Sitesi

> 🇬🇧 For English documentation: [README.md](./README.md)

Bu proje, AWS üzerinde tam otomatik bir statik web sitesi altyapısı kurar.
Tüm kaynaklar Terraform ile kod olarak yönetilir, `main` branch'ine her push'ta GitHub Actions aracılığıyla otomatik deploy edilir.

---

## Özellikler

- **AWS S3** üzerinde statik web sitesi barındırma
- **AWS CloudFront** ile global CDN ve HTTPS
- **AWS Route53** ile DNS yönetimi
- **AWS ACM** ile ücretsiz wildcard SSL sertifikası
- **AWS Lambda + API Gateway + SES** ile iletişim formu backend'i
- **Terraform** ile tam Infrastructure as Code
- **GitHub Actions** ile otomatik CI/CD pipeline

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

---

## Proje Yapısı

```
nexawelt/
├── index.html                           # Ana sayfa
├── error.html                           # Özel 404/403 hata sayfası
├── .github/
│   └── workflows/
│       └── deploy.yml                   # GitHub Actions CI/CD pipeline
├── .gitignore
├── AWS_IAM_SETUP.md                     # IAM kullanıcı & GitHub Secrets rehberi
├── README.md                            # İngilizce dokümantasyon
├── README.tr.md                         # Bu dosya (Türkçe)
└── terraform-static-website/
    ├── main.tf                          # Provider tanımları
    ├── variables.tf                     # Değişkenler
    ├── s3.tf                            # S3 bucket
    ├── cloudfront.tf                    # CloudFront distribution
    ├── route53.tf                       # DNS kayıtları
    ├── cert.tf                          # ACM SSL sertifikası
    ├── contact-api.tf                   # Lambda + API Gateway + SES
    ├── outputs.tf                       # Terraform çıktıları
    └── lambda/
        └── contact/
            └── index.js                 # Lambda fonksiyon kodu
```

---

## Ön Koşullar

- AWS hesabı ve CLI kurulumu (`aws configure`)
- Terraform kurulumu (`terraform -version`)
- AWS Route53'te kayıtlı domain
- GitHub hesabı

---

## ⚠️ Kritik: Çift Hosted Zone Sorunu

AWS'den domain satın aldığında registrar tarafından **otomatik olarak bir Hosted Zone** oluşturulur.
Terraform'un `aws_route53_zone` resource'u ile **ikinci bir zone oluşturma** — ACM validation süresiz takılır.

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

## Altyapı Kurulumu (Terraform)

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
  default = ["nexawelt.de", "www.nexawelt.de", "info.nexawelt.de"]
}

variable "contact_to_email" {
  default = "info@nexawelt.de"
}
```

`route53.tf` dosyasında Zone ID'yi güncelle:

```hcl
data "aws_route53_zone" "main" {
  zone_id = "ZXXXXXXXXXXXXXXXXX"
}
```

### 3. Terraform Init

```bash
terraform init
```

### 4. ⚠️ İki Adımlı Apply (Zorunlu)

Direkt `terraform apply` çalışmaz. ACM validation kayıtları `for_each` ile oluşturuluyor ancak Terraform sertifika olmadan key'leri belirleyemiyor.

**1. Adım — Önce ACM sertifikasını oluştur:**
```bash
terraform apply -target=aws_acm_certificate.cert -target=aws_route53_zone.main
```

**2. Adım — Geri kalan tüm kaynakları oluştur:**
```bash
terraform apply
```

> `aws_acm_certificate_validation` DNS yayılmasını beklerken 5–15 dakika sürebilir. Bu normaldir — terminali kapatma.

### 5. Çıktılar

```
cloudfront_domain_name = "xxxxx.cloudfront.net"
contact_api_endpoint   = "https://xxxxx.execute-api.us-east-1.amazonaws.com"
route53_zone_name      = "nexawelt.de"
s3_website_endpoint    = "nexawelt.de.s3-website-us-east-1.amazonaws.com"
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

Detaylı IAM izinleri için bkz. [AWS_IAM_SETUP.md](./AWS_IAM_SETUP.md)

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

## Yerel Geliştirme

```bash
# Yerel önizleme
python3 -m http.server 8080
# veya VS Code Live Server kullan
```

### Değişiklikleri Push Et

```bash
git add .
git commit -m "mesajın"
git push
```

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
Hem gönderen domain hem de alıcı e-posta doğrulanmış olmalıdır.

**Alıcı e-postayı doğrula:**
```
AWS Console → SES → Verified identities → Create identity → Email address
```

**Production'a geçmek için:**
```
AWS Console → SES → Account dashboard → Request production access
```

---

## Sorun Giderme

| Sorun | Neden | Çözüm |
|-------|-------|-------|
| Site 403 hatası veriyor | S3 bucket boş | `aws s3 sync` ile manuel deploy et |
| ACM "Pending Validation" takılı | Yanlış hosted zone | `route53.tf`'de registrar zone ID'sini kullan |
| Lambda permission `EntityAlreadyExists` | Başka siteden kalan statement ID | Benzersiz `statement_id` kullan |
| GitHub Actions çalışmıyor | Eksik secret veya yanlış dosya yolu | Secrets ve `.github/workflows/deploy.yml` kontrol et |
| `Cannot find module 'aws-sdk'` | nodejs18+ ile v2 SDK | `nodejs20.x` kullan ve v3 SDK'ya geç |
| DNS çözümlenmiyor | NS kayıtları uyuşmuyor | Route53 ve registrar'daki NS kayıtlarını kontrol et |
| CloudFront güncellenmiyor | Cache temizlenmedi | `create-invalidation --paths '/*'` çalıştır |

---

## En İyi Uygulamalar

- AWS credentials veya Terraform state'i git'e asla commit etme
- `.gitignore`'a `.terraform/`, `*.tfstate`, `.build/` ekle
- AWS Console'da manuel değişiklik yapma — her şey Terraform ile
- IAM key'lerini düzenli olarak yenile
- Push etmeden önce yerel ortamda test et

---

## Kaynaklar

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS S3 Statik Web Sitesi](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [AWS CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [AWS Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [AWS SES Sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [GitHub Actions – AWS Credentials](https://github.com/aws-actions/configure-aws-credentials)

---

## Yazar

Ibrahim Kilicaslan — [github.com/Ibrahim-Kilicaslan](https://github.com/Ibrahim-Kilicaslan)

---

## Lisans

MIT