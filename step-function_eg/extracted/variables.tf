##########################
# Variables Definition  #
##########################

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.0.0/19"
}

variable "instance_type" {
  description = "EC2 instance type for the training job"
  type        = string
  default     = "t3.medium"
}

variable "ami_id" {
  description = "AMI ID for the EC2 instance"
  type        = string
}

variable "ssh_key_name" {
  description = "Name of the SSH key pair to use for the EC2 instance"
  type        = string
}

variable "app_port" {
  description = "Application port to allow inbound traffic"
  type        = number
  default     = 8080
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket to store trained models"
  type        = string
}
