variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "name" {
  description = "Base name used for AWS and Kubernetes resources."
  type        = string
  default     = "nagp-assignment"
}

variable "cluster_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.36"
}

variable "vpc_cidr" {
  description = "CIDR range for the assignment VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "node_instance_types" {
  description = "Instance types used by the Spot managed node group. Small nodes make node-level scaling easy to demonstrate."
  type        = list(string)
  default     = ["t3.small", "t3a.small"]
}

variable "node_min_size" {
  description = "Minimum Spot nodes for Cluster Autoscaler."
  type        = number
  default     = 1
}

variable "node_desired_size" {
  description = "Desired Spot nodes at creation."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum Spot nodes for Cluster Autoscaler. Set above 3 so the platform footprint leaves headroom to demonstrate app-driven node scaling."
  type        = number
  default     = 5
}
