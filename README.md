# Kubernetes DevOps FinOps Assignment

This repository contains a complete EKS-based implementation for the Kubernetes and DevOps Advance + FinOps assignment.

## Deliverable Links

- Code repository: `https://github.com/ankit-singh16/nagp-kubernetes-devops-finops-assignment`
- Docker Hub image: `https://hub.docker.com/layers/ankitsingh16nagarro/nagp-records-api/1.2.0`
- Service API URL: the ALB DNS is provisioned fresh on every deploy, so it is not hard-coded here. Fetch the current URL with:

  ```bash
  kubectl -n nagp-app get ingress records-api \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
  # then open  http://<that-hostname>/  in a browser
  ```

## Architecture

- AWS region: `us-east-1`
- Infrastructure: Terraform with local state
- Kubernetes: Amazon EKS
- GitOps: Argo CD syncs manifests from `k8s/app`
- Ingress: AWS Load Balancer Controller creates an internet-facing ALB
- Secrets: External Secrets Operator reads the PostgreSQL password from AWS Secrets Manager
- Storage: EBS CSI Driver provisions a `gp3` PVC for PostgreSQL
- Scaling: HPA scales API pods, Cluster Autoscaler scales the Spot managed node group

## Repository Layout

```text
app/                 Node.js Express API and Dockerfile
docs/                Assignment documentation and demo checklist
k8s/app/             Argo CD-managed Kubernetes manifests
k8s/argocd/          Argo CD Application manifest
terraform/           EKS, add-ons, IAM, and AWS Secrets Manager resources
```

## The App: NAGP Cloud Wall

The Service API tier is a Kubernetes-themed graffiti wall. Visitors read messages
and **write** new ones, all persisted in PostgreSQL. Every response carries the
name of the pod that served it (`servedBy`), so killing pods or scaling via HPA is
visible in the UI.

Endpoints:

- `GET /` - HTML wall (lists posts + a form to add one; shows the serving pod)
- `GET /api/posts` - JSON list of posts plus `servedBy`
- `POST /api/posts` - create a post (JSON `{author, message, emoji?}` or HTML form)
- `GET /healthz` - liveness
- `GET /readyz` - database readiness (`SELECT 1`)

Write a post from the command line:

```bash
ALB=$(kubectl -n nagp-app get ingress records-api -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -s -X POST "http://$ALB/api/posts" \
  -H 'content-type: application/json' \
  -d '{"author":"Ankit","message":"Hello from the demo!","emoji":"🎉"}'
curl -s "http://$ALB/api/posts" | jq
```

## Local API Development

```bash
cd app
npm install
npm test
npm start
```

Required environment variables for local database access:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb
DB_USER=appuser
DB_PASSWORD=change-me
```

## Build And Push The API Image

Update the image repository/tag to your Docker Hub account, then build and push:

```bash
cd app
docker build -t docker.io/ankitsingh16nagarro/nagp-records-api:<tag> .
docker push docker.io/ankitsingh16nagarro/nagp-records-api:<tag>
```

Update `k8s/app/api-deployment.yaml` with the pushed image tag before syncing with Argo CD.

## Provision EKS

Terraform uses local state by default. No S3 or DynamoDB backend is configured.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Configure kubectl:

```bash
aws eks update-kubeconfig --region us-east-1 --name nagp-assignment
```

## Deploy With Argo CD

Edit `k8s/argocd/application.yaml` and set `spec.source.repoURL` to this repository URL. Then apply the Argo CD application:

```bash
kubectl apply -f k8s/argocd/application.yaml
kubectl -n argocd get applications
kubectl -n nagp-app get all,ingress,pvc,hpa
```

Get the ALB endpoint:

```bash
kubectl -n nagp-app get ingress records-api
```

Call the API:

```bash
curl "http://<alb-dns-name>/api/posts"
```

## Demo Validation Commands

Show running objects:

```bash
kubectl get nodes -L eks.amazonaws.com/capacityType
kubectl -n kube-system get pods
kubectl -n external-secrets get pods
kubectl -n argocd get pods,applications
kubectl -n nagp-app get deploy,sts,pods,svc,ingress,pvc,hpa,pdb
```

Show API records:

```bash
curl "http://<alb-dns-name>/api/posts"
```

Show API self-healing:

```bash
kubectl -n nagp-app delete pod -l app.kubernetes.io/name=records-api
kubectl -n nagp-app rollout status deploy/records-api
```

Show database recovery and persistence:

```bash
kubectl -n nagp-app delete pod postgres-0
kubectl -n nagp-app rollout status statefulset/postgres
curl "http://<alb-dns-name>/api/posts"
```

Trigger a rolling update after pushing a new image tag:

```bash
kubectl -n nagp-app set image deploy/records-api api=docker.io/ankitsingh16nagarro/nagp-records-api:1.1.1
kubectl -n nagp-app rollout status deploy/records-api
```

Generate CPU load for HPA:

```bash
kubectl -n nagp-app run load-generator --rm -it --image=busybox:1.36 --restart=Never -- /bin/sh
while true; do wget -q -O- http://records-api/api/posts >/dev/null; done
```

Observe scaling:

```bash
kubectl -n nagp-app get hpa records-api --watch
kubectl -n nagp-app top pods
```

Show Cluster Autoscaler scale-up by temporarily increasing replicas beyond current node capacity:

```bash
kubectl -n nagp-app scale deploy/records-api --replicas=40
kubectl -n kube-system logs deploy/cluster-autoscaler-aws-cluster-autoscaler --tail=100
kubectl get nodes -L eks.amazonaws.com/capacityType
```

Scale back after evidence is captured:

```bash
kubectl -n nagp-app scale deploy/records-api --replicas=4
```

Delete the Argo CD application and confirm child resources are pruned:

```bash
kubectl -n argocd delete application nagp-records-app
kubectl -n nagp-app get pvc
```

Because the `gp3` StorageClass uses `reclaimPolicy: Delete`, the dynamically created EBS volume is removed after the PVC is deleted.

Destroy the platform after recording evidence:

```bash
cd terraform
terraform destroy
```
