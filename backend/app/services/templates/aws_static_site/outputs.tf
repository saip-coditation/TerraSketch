output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.site.domain_name
  description = "Live HTTPS URL for the static site."
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "s3_bucket_id" {
  value = aws_s3_bucket.site.id
}
