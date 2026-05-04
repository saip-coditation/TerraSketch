// Outputs for Terraform configuration

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "web_instance_ids" {
  description = "IDs of the web server instances"
  value       = aws_instance.web[*].id
}

output "db_instance_endpoint" {
  description = "Endpoint of the MySQL database"
  value       = aws_db_instance.mysql.endpoint
}

output "nat_gateway_public_ip" {
  description = "Elastic IP used by NAT Gateway (outbound from private subnets)"
  value       = aws_eip.nat.public_ip
}
