##########################
# Outputs Definition     #
##########################

output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.training_vpc.id
}

output "public_subnet_id" {
  description = "ID of the public subnet"
  value       = aws_subnet.public_subnet.id
}

output "ec2_instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.training_instance.id
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.model_bucket.bucket
}
