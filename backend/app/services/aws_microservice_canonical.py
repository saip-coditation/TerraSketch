"""Canonical Terraform for the classic AWS microservice diagram:

CloudFront → S3 (static) + CloudFront → ALB → ECS → (ElastiCache | Aurora | DynamoDB).

Applied after the LLM pass when the identified resources match this pattern, so ZIP output
structurally matches the diagram even if the model omits origins or wiring.
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

# Order matters for Terraform: no provider block here (only in providers.tf).

_CANONICAL_MAIN_TF = r'''# -----------------------------------------------------------------------------
# AWS Microservice (canonical): CloudFront→S3 (OAC) + CloudFront→ALB→ECS
# Data: ElastiCache (Redis), Aurora MySQL, DynamoDB
# Matches typical "Microservice" reference architecture diagrams.
# -----------------------------------------------------------------------------

# --- IAM: ECS task execution ---
resource "aws_iam_role" "ecs_execution" {
  name = "${var.name_prefix}-ecs-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- Security groups ---
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "HTTP/HTTPS from internet to ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidr_blocks
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs"
  description = "Traffic from ALB to ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "elasticache" {
  name        = "${var.name_prefix}-elasticache"
  description = "Redis from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "aurora" {
  name        = "${var.name_prefix}-aurora"
  description = "MySQL/Aurora from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Aurora MySQL"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- S3 static assets + CloudFront OAC ---
resource "aws_s3_bucket" "static" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_ownership_controls" "static" {
  bucket = aws_s3_bucket.static.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${var.name_prefix}-s3-oac"
  description                       = "OAC for static bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- ALB ---
resource "aws_lb" "app" {
  name               = "${var.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "app" {
  name        = "${var.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# --- ECS Fargate ---
resource "aws_ecs_cluster" "app" {
  name = "${var.name_prefix}-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name_prefix}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([{
    name      = "app"
    image     = var.container_image
    essential = true
    portMappings = [{
      containerPort = var.container_port
      hostPort        = var.container_port
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = 7
}

resource "aws_ecs_service" "app" {
  name            = "${var.name_prefix}-svc"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
}

# --- ElastiCache Redis ---
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.name_prefix}-redis-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.name_prefix}-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.elasticache.id]
  port                 = 6379
}

# --- Aurora MySQL ---
resource "aws_db_subnet_group" "aurora" {
  name       = "${var.name_prefix}-aurora-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "${var.name_prefix}-aurora"
  engine                  = "aurora-mysql"
  engine_version          = var.aurora_engine_version
  database_name           = var.db_name
  master_username         = var.db_username
  master_password         = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.aurora.name
  vpc_security_group_ids  = [aws_security_group.aurora.id]
  backup_retention_period = 7
  storage_encrypted       = true
  skip_final_snapshot     = var.skip_final_snapshot
}

resource "aws_rds_cluster_instance" "aurora_writer" {
  identifier         = "${var.name_prefix}-aurora-writer"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
}

# --- DynamoDB ---
resource "aws_dynamodb_table" "app" {
  name         = "${var.name_prefix}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

# --- CloudFront: S3 (default) + ALB (API path) ---
resource "aws_cloudfront_distribution" "cdn" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix} — S3 static + ALB dynamic"
  price_class     = var.cloudfront_price_class

  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "s3-static"
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = "alb-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Static site / assets: S3
  default_cache_behavior {
    target_origin_id       = "s3-static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # API / dynamic traffic: ALB (adjust path_pattern if your API uses a different prefix)
  ordered_cache_behavior {
    path_pattern           = var.api_path_pattern
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      headers      = ["Host", "Origin", "Authorization"]
      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  depends_on = [aws_lb.app, aws_s3_bucket.static]
}

# Bucket policy after distribution exists (OAC + SourceArn condition)
resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontRead"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.static.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.cdn.arn
        }
      }
    }]
  })
}
'''

_CANONICAL_VARIABLES_TF = r'''variable "region" {
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
'''

_CANONICAL_OUTPUTS_TF = r'''output "cloudfront_domain_name" {
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
'''

_CANONICAL_PROVIDERS_TF = r'''terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}
'''


def _resource_blob(resources: List[str], main_tf: str) -> str:
    parts = [x.lower() for x in (resources or [])]
    return " ".join(parts) + " " + (main_tf or "").lower()


def should_apply_canonical_microservice(
    *,
    cloud_provider: str,
    resources_identified: List[str],
    main_tf: str,
) -> bool:
    if cloud_provider.lower().strip() != "aws":
        return False
    blob = _resource_blob(resources_identified, main_tf)
    # Diagram components (allow common label variants)
    need = [
        ("cloudfront", re.search(r"cloud\s*front|cloudfront", blob)),
        ("s3", re.search(r"\bs3\b|simple\s*storage|storage\s*bucket", blob)),
        ("alb", re.search(r"\balb\b|application\s*load|load\s*balancer", blob)),
        ("ecs", re.search(r"\becs\b|elastic\s*container|fargate", blob)),
        ("elasticache", re.search(r"elasticache|elastic\s*cache|redis", blob)),
        ("aurora", re.search(r"aurora", blob)),
        ("dynamodb", re.search(r"dynamodb|dynamo\s*db", blob)),
    ]
    return all(m is not None for _, m in need)


def get_canonical_microservice_files(*, environment: str) -> Dict[str, str]:
    """Return the four-file bundle; caller sets name_prefix via tfvars."""
    env_slug = re.sub(r"[^a-z0-9-]", "-", environment.lower().strip()) or "dev"
    defaults_comment = (
        f"# Suggested terraform.tfvars starter (edit vpc, subnets, bucket, image, db_password):\n"
        f"# region = \"us-east-1\"\n"
        f'# name_prefix = "terrasketch-{env_slug}"\n'
        f"# vpc_id = \"vpc-...\"\n"
        f"# public_subnet_ids  = [\"subnet-...\", \"subnet-...\"]\n"
        f"# private_subnet_ids = [\"subnet-...\", \"subnet-...\"]\n"
        f"# s3_bucket_name = \"my-unique-static-bucket-{env_slug}\"\n"
        f"# container_image = \"public.ecr.aws/docker/library/nginx:latest\"\n"
        f"# db_password = \"CHANGE_ME\"\n"
    )
    variables = defaults_comment + "\n" + _CANONICAL_VARIABLES_TF
    return {
        "main.tf": _CANONICAL_MAIN_TF,
        "variables.tf": variables,
        "outputs.tf": _CANONICAL_OUTPUTS_TF,
        "providers.tf": _CANONICAL_PROVIDERS_TF,
    }


def maybe_replace_with_canonical_microservice(
    *,
    files: Dict[str, str],
    cloud_provider: str,
    resources_identified: List[str],
    environment: str,
) -> Tuple[Dict[str, str], List[str]]:
    """If the diagram matches the 7-component microservice, replace files with canonical."""
    main = files.get("main.tf", "")
    if not should_apply_canonical_microservice(
        cloud_provider=cloud_provider,
        resources_identified=resources_identified,
        main_tf=main,
    ):
        return files, []

    canonical = get_canonical_microservice_files(environment=environment)
    notes = [
        "Canonical AWS microservice template applied so Terraform matches the diagram: "
        "CloudFront with S3 (OAC) + ALB origins, ECS Fargate, ElastiCache, Aurora (cluster+instance), DynamoDB. "
        "Provide vpc_id, subnets, s3_bucket_name, container_image, and db_password via terraform.tfvars."
    ]
    return canonical, notes


def canonical_resources_list() -> List[str]:
    return [
        "Amazon CloudFront",
        "Amazon S3",
        "ALB",
        "Amazon ECS",
        "Amazon ElastiCache",
        "Amazon Aurora",
        "Amazon DynamoDB",
    ]
