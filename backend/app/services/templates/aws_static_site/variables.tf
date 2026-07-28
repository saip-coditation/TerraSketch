variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "terrasketch-site"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_100 | PriceClass_200 | PriceClass_All)"
  type        = string
  default     = "PriceClass_100"
}
