# Terraform Platform

This directory provisions the EKS platform for the assignment using local Terraform state.

No backend block is configured, so state is written to `terraform.tfstate` in this directory.

## Commands

```bash
terraform init
terraform plan
terraform apply
```

After the demo:

```bash
terraform destroy
```

## Main Resources

- VPC with public and private subnets
- EKS cluster in `us-east-1`
- EKS managed Spot node group
- EBS CSI Driver EKS add-on with IRSA
- AWS Load Balancer Controller
- External Secrets Operator
- Argo CD
- Metrics Server
- Cluster Autoscaler
- AWS Secrets Manager secret for PostgreSQL password
