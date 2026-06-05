##########################
# Main Terraform Config #
##########################

# Create VPC
resource "aws_vpc" "training_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = "training-vpc"
  }
}

# Create Public Subnet
resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.training_vpc.id
  cidr_block              = var.public_subnet_cidr
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
  }
}

# Create Internet Gateway
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.training_vpc.id
  tags = {
    Name = "internet-gateway"
  }
}

# Create Route Table
resource "aws_route_table" "public_route_table" {
  vpc_id = aws_vpc.training_vpc.id
  tags = {
    Name = "public-route-table"
  }
}

# Add Route to Internet Gateway
resource "aws_route" "default_route" {
  route_table_id         = aws_route_table.public_route_table.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

# Associate Route Table with Subnet
resource "aws_route_table_association" "public_subnet_association" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_route_table.id
}

# Create Security Group
resource "aws_security_group" "ec2_sg" {
  vpc_id = aws_vpc.training_vpc.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ec2-security-group"
  }
}

# Launch EC2 Instance
resource "aws_instance" "training_instance" {
  ami           = var.ami_id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public_subnet.id
  key_name      = var.ssh_key_name
  security_groups = [
    aws_security_group.ec2_sg.name
  ]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "training-instance"
  }
}

# Create S3 Bucket
resource "aws_s3_bucket" "model_bucket" {
  bucket = var.s3_bucket_name
  acl    = "private"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  tags = {
    Name = "model-bucket"
  }
}

# Add Lifecycle Rule to S3 Bucket
resource "aws_s3_bucket_lifecycle_configuration" "lifecycle_rule" {
  bucket = aws_s3_bucket.model_bucket.id

  rule {
    id     = "delete-after-30-days"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}
