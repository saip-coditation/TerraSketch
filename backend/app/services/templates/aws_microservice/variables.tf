variable "region" {
  description = "AWS region"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnets for ECS, Aurora, ElastiCache"
  type        = list(string)
}

variable "alb_ingress_cidr_blocks" {
  description = "CIDRs allowed to reach ALB (use tighter ranges in production)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "s3_bucket_name" {
  description = "Globally unique S3 bucket name for static assets"
  type        = string
}

variable "container_image" {
  description = "Container image for ECS task"
  type        = string
}

variable "container_port" {
  description = "Container / target group port"
  type        = number
  default     = 80
}

variable "health_check_path" {
  type    = string
  default = "/"
}

variable "ecs_cpu" {
  type    = number
  default = 512
}

variable "ecs_memory" {
  type    = number
  default = 1024
}

variable "ecs_desired_count" {
  type    = number
  default = 2
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "aurora_engine_version" {
  type    = string
  default = "8.0.mysql_aurora.3.04.0"
}

variable "aurora_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_name" {
  type    = string
  default = "appdb"
}

variable "db_username" {
  type    = string
  default = "admin"
}

variable "db_password" {
  description = "Aurora master password"
  type        = string
  sensitive   = true
}

variable "skip_final_snapshot" {
  type    = bool
  default = true
}

variable "api_path_pattern" {
  description = "URL path pattern routed to ALB (e.g. /api/*)"
  type        = string
  default     = "/api/*"
}

variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_100"
}
