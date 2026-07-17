#!/usr/bin/env bash
# infra-down.sh — tear down local processes or AWS Lambda stack
# Usage: ./scripts/infra-down.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

printf '\n=== edgar-rag-demo — tear down ===\n\n'
printf '  [1] Local   — stop uvicorn + Next.js processes\n'
printf '  [2] AWS     — destroy Lambda, ECR, CodeBuild, S3 (workspace: lite)\n'
printf '\nChoice [1/2]: '
read -r _MODE

if [[ "$_MODE" == "1" ]]; then
  bold 'Stopping local processes...'
  pkill -f "uvicorn app.main:app" 2>/dev/null && green '  uvicorn stopped' || dim '  uvicorn not running'
  pkill -f "next dev"             2>/dev/null && green '  Next.js stopped' || dim '  Next.js not running'
  green 'Done.'
  exit 0
fi

[[ "$_MODE" != "2" ]] && { red 'Invalid choice.'; exit 1; }

DEPLOY_WORKSPACE="lite"
TF_VAR_name_prefix="edgar-lite"
INFRA_DIR="$ROOT/infra/aws"

bold "AWS teardown — workspace: $DEPLOY_WORKSPACE"

command -v terraform >/dev/null 2>&1 || { red 'terraform not found'; exit 1; }
command -v aws       >/dev/null 2>&1 || { red 'aws CLI not found'; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { red 'AWS credentials not configured — run: aws configure'; exit 1; }
dim "  Credentials: $(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null)"

bold '\nInitialising Terraform...'
cd "$INFRA_DIR"
terraform init -upgrade -input=false

terraform workspace select "$DEPLOY_WORKSPACE" 2>/dev/null || {
  red "Workspace '$DEPLOY_WORKSPACE' not found — nothing to destroy."
  exit 0
}

STATE_FILE="$INFRA_DIR/terraform.tfstate.d/$DEPLOY_WORKSPACE/terraform.tfstate"

_resource_count() {
  [[ -f "$STATE_FILE" ]] || { echo 0; return; }
  python3 -c "import json; d=json.load(open('$STATE_FILE')); print(sum(len(r.get('instances',[])) for r in d.get('resources',[])))" 2>/dev/null || echo 0
}

BEFORE=$(_resource_count)
if [[ "$BEFORE" == "0" ]]; then
  green 'Workspace is already empty — nothing to destroy.'
  exit 0
fi

printf '\n  Resources currently in state: %s\n' "$BEFORE"
printf '  This will destroy: Lambda, API Gateway, ECR, CodeBuild, S3, IAM, CloudWatch\n'
printf '\n  Proceed? [Y/n]: '
read -r _CONFIRM
[[ "${_CONFIRM:-y}" =~ ^[Yy]$ ]] || { red 'Aborted.'; exit 1; }

bold '\nFlushing ECR images...'
for _repo in "${TF_VAR_name_prefix}-backend"; do
  _ids=$(aws ecr list-images --repository-name "$_repo" \
    --query 'imageIds[*]' --output json --no-cli-pager 2>/dev/null || echo '[]')
  if [[ "$_ids" != "[]" && "$_ids" != "" ]]; then
    aws ecr batch-delete-image --repository-name "$_repo" \
      --image-ids "$_ids" --no-cli-pager >/dev/null 2>&1 \
      && green "  $_repo — images deleted" || dim "  $_repo — delete skipped"
  else
    dim "  $_repo — already empty"
  fi
done

bold '\nRunning terraform destroy...'
terraform destroy -auto-approve -var "name_prefix=${TF_VAR_name_prefix}"

AFTER=$(_resource_count)
if [[ "$AFTER" -gt 0 ]]; then
  red "Destroy completed but $AFTER resources still in state — check AWS console."
  exit 1
fi
green "  All resources destroyed."

bold '\nRemoving SSM parameters...'
for _param in database-url openai-key anthropic-key nvidia-key google-key edgar-ua; do
  aws ssm delete-parameter \
    --name "/${TF_VAR_name_prefix}/${_param}" \
    --no-cli-pager 2>/dev/null \
    && green "  deleted /${TF_VAR_name_prefix}/${_param}" \
    || dim   "  /${TF_VAR_name_prefix}/${_param} not found"
done

if command -v vercel >/dev/null 2>&1; then
  bold '\nRemoving Vercel project...'
  vercel remove edgar-rag-demo --yes 2>/dev/null \
    && green '  Vercel project removed' \
    || dim   '  Vercel project not found or already removed'
fi

green '\nAWS infrastructure torn down.'
