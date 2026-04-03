# Variables used throughout the Terraform project

# AWS region to deploy resources in
variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

# The main domain name for the website and DNS records
variable "domain_name" {
  description = "Main domain name"
  default     = "nexawelt.de"
}

variable "aliases" {
  description = "List of domain names (CNAMEs) for CloudFront"
  type        = list(string)
  default     = [
    "nexawelt.de",
    "info.nexawelt.de",
    "www.nexawelt.de"
  ]
}

variable "contact_to_email" {
  description = "Inbox that receives contact form messages (SES sandbox: must be verified)."
  type        = string
  default     = "aikilicaslan@gmail.com"
}