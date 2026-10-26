terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Amrutam-Telemedicine"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

resource "aws_kms_key" "amrutam_kms" {
  description             = "KMS Master Key for Amrutam Telemedicine PHI and Database Encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "amrutam_kms_alias" {
  name          = "alias/amrutam-${var.environment}-key"
  target_key_id = aws_kms_key.amrutam_kms.key_id
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "amrutam-${var.environment}-vpc"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "amrutam-private-subnet-${count.index + 1}"
  }
}
