resource "aws_elasticache_subnet_group" "redis" {
  name       = "amrutam-${var.environment}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "amrutam-${var.environment}-redis"
  description                   = "High-throughput Redis cache and lock cluster for Amrutam"
  node_type                     = var.redis_node_type
  port                          = 6379
  parameter_group_name          = "default.redis7"
  subnet_group_name             = aws_elasticache_subnet_group.redis.name
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  num_cache_clusters            = 3 # 1 Primary + 2 Replicas
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  kms_key_id                    = aws_kms_key.amrutam_kms.arn

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-04:00"
}
