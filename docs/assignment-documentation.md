# Assignment Documentation

## Requirement Understanding

The assignment requires a multi-tier Kubernetes deployment with one externally accessible API tier and one internal database tier. The API must fetch records from the database through service DNS, support rolling updates, expose health probes, use externalized configuration, consume a secret for the database password, run four replicas, and demonstrate self-healing and HPA. The database must run one replica, stay internal to the cluster, seed one table with five to ten records, persist data through pod recreation, and recover automatically.

The cloud and FinOps scope requires CPU and memory requests/limits, observed metrics, at least three cost optimization opportunities, and a cleanup path to avoid ongoing cloud spend.

## Assumptions

- AWS account access and permissions are available to create EKS, IAM, VPC, EC2, EBS, ALB, and Secrets Manager resources.
- The deployment region is `us-east-1`.
- Terraform state remains local for the assignment.
- The Docker image is pushed to Docker Hub before Argo CD syncs the application.
- All worker nodes are Spot for demo cost control. For production, critical workloads should normally use mixed capacity or on-demand nodes.
- PostgreSQL is deployed in-cluster to satisfy the Kubernetes persistence requirement.

## Solution Overview

Terraform provisions a VPC, an EKS cluster, a Spot managed node group, AWS-managed EKS add-ons, IAM roles for service accounts, Helm add-ons, and a Secrets Manager secret for the PostgreSQL password.

The Service API tier is the **NAGP Cloud Wall**, a Kubernetes-themed graffiti wall.
It serves an HTML page and a JSON API to **read** posts and **write** new ones to
PostgreSQL. Every response includes the serving pod name (`servedBy`), which makes
self-healing and HPA scaling visible in the UI. Endpoints: `GET /` (wall),
`GET /api/posts`, `POST /api/posts`, `GET /healthz`, `GET /readyz`.

Argo CD deploys the app manifests from `k8s/app`. The application namespace contains:

- `records-api` Deployment with four replicas, probes, resource limits, rolling update strategy, HPA, PDB, and ALB Ingress.
- `postgres` StatefulSet with a `gp3` volume claim, internal service, and seed SQL mounted through a ConfigMap.
- External Secrets resources that copy the database password from AWS Secrets Manager into a Kubernetes Secret.
- A `gp3` StorageClass using EBS CSI and `reclaimPolicy: Delete`.

The API talks to PostgreSQL through the `postgres.nagp-app.svc.cluster.local` service name. No Pod IPs are used.

## Justification For Resources Utilized

- EKS provides managed Kubernetes control plane operations and native integrations with IAM, EBS, and ALB.
- EKS managed node groups reduce node lifecycle management overhead while still allowing Spot capacity for cost control.
- AWS Load Balancer Controller is used because the assignment requires external Ingress access on AWS.
- EBS CSI Driver is required for dynamic EBS volume provisioning for PostgreSQL persistence.
- External Secrets Operator avoids storing the database password in clear text inside Kubernetes YAML.
- Argo CD provides GitOps delivery and resource pruning through the Application finalizer.
- Metrics Server is required for HPA CPU metrics.
- Cluster Autoscaler demonstrates node-level elasticity when pods cannot be scheduled.

## FinOps Considerations

1. Spot worker nodes reduce compute cost for the demo workload.
2. Cluster Autoscaler avoids keeping excess nodes running when pods do not need them.
3. HPA scales API pods based on CPU demand instead of permanently running peak capacity.
4. API requests and limits allow scheduling density to be tuned from observed `kubectl top` metrics.
5. The documented teardown flow deletes the Argo CD application and runs `terraform destroy` to avoid idle resources.

All-Spot worker nodes are good enough for this demo/poc/lower-environments, but production systems should usually use a mixed-capacity strategy with on-demand capacity for critical and stateful workloads.


Tuning decision:

> If `records-api` sits near ~15m CPU / ~70Mi at idle and the HPA scales out before
> any single pod approaches the 500m limit, the 100m request is a safe scheduling
> floor and the 60% CPU HPA target is doing the optimization work - no change needed.
> If idle memory stays well under 128Mi across all pods, lower the request toward the
> observed value to raise scheduling density (more pods per node) and cut node count.
> Conversely, if pods are CPU-throttled under load, raise the limit before the request.
