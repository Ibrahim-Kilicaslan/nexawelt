# Route53 DNS configuration for the website

# Mevcut hosted zone'u kullan (AWS Registrar tarafından oluşturuldu)
data "aws_route53_zone" "main" {
  zone_id = "Z04851851VA1FAUWO91W0"
}

locals {
  unique_cert_validations = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.unique_cert_validations
  zone_id  = data.aws_route53_zone.main.zone_id
  name     = each.value.name
  type     = each.value.type
  records  = [each.value.record]
  ttl      = 60
}

# CloudFront alias A records
resource "aws_route53_record" "cloudfront_alias" {
  for_each = toset(var.aliases)
  zone_id  = data.aws_route53_zone.main.zone_id
  name     = each.value
  type     = "A"
  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}
