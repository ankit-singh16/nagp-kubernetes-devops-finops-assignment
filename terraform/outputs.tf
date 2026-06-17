output "cluster_name" {
  description = "EKS cluster name."
  value       = module.eks.cluster_name
}

output "region" {
  description = "AWS region."
  value       = var.region
}

output "configure_kubectl" {
  description = "Command to configure kubectl for the created EKS cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "postgres_secret_arn" {
  description = "AWS Secrets Manager secret consumed by External Secrets Operator."
  value       = aws_secretsmanager_secret.postgres.arn
}
