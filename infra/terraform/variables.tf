variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region for telemedicine infrastructure"
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Deployment environment"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "VPC CIDR block"
}

variable "db_instance_class" {
  type        = string
  default     = "db.r6g.xlarge"
  description = "Aurora PostgreSQL instance type for 100k daily consultations"
}

variable "redis_node_type" {
  type        = string
  default     = "cache.r6g.large"
  description = "AWS ElastiCache Redis node type"
}
