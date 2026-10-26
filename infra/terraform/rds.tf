# Multi-AZ Aurora Serverless / Provisioned PostgreSQL Cluster for High Availability (99.95%)
resource "aws_db_subnet_group" "rds" {
  name       = "amrutam-${var.environment}-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "postgresql" {
  cluster_identifier      = "amrutam-${var.environment}-pg-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  database_name           = "amrutam_telemedicine"
  master_username         = "amrutam_admin"
  manage_master_user_password = true
  kms_key_id              = aws_kms_key.amrutam_kms.arn
  storage_encrypted       = true
  db_subnet_group_name    = aws_db_subnet_group.rds.name
  backup_retention_period = 30
  preferred_backup_window = "02:00-03:00"
  copy_tags_to_snapshot   = true
  deletion_protection     = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    max_capacity = 32.0
    min_capacity = 2.0
  }
}

resource "aws_rds_cluster_instance" "cluster_instances" {
  count              = 3 # 1 Writer + 2 Read Replicas
  identifier         = "amrutam-${var.environment}-pg-instance-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.postgresql.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.postgresql.engine
  engine_version     = aws_rds_cluster.postgresql.engine_version
  monitoring_interval = 15
}
