output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.cdn.domain_name
  description = "CloudFront URL — default behavior → S3 static; paths matching api_path_pattern → ALB/ECS"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.cdn.id
}

output "s3_bucket_id" {
  value = aws_s3_bucket.static.id
}

output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "elasticache_primary_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "aurora_writer_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "aurora_reader_endpoint" {
  value = aws_rds_cluster.aurora.reader_endpoint
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.app.name
}
