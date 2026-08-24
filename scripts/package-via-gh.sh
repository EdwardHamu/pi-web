#!/usr/bin/env bash
set -Eeuo pipefail

REMOTE="${REMOTE:-origin}"
GH_REPO="${GH_REPO:-EdwardHamu/pi-web}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
WORKFLOW="${WORKFLOW:-package.yml}"
ARTIFACT_NAME="${ARTIFACT_NAME:-pi-web-npm-package}"
OUTPUT_DIR="${OUTPUT_DIR:-artifacts}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Package Pi Web}"
MAX_RETRIES="${MAX_RETRIES:-5}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-5}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-10}"
POLL_MAX_ATTEMPTS="${POLL_MAX_ATTEMPTS:-180}"

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

[[ "$MAX_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "MAX_RETRIES must be a positive integer"
[[ "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] || die "RETRY_DELAY_SECONDS must be a non-negative integer"
[[ "$POLL_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || die "POLL_INTERVAL_SECONDS must be a non-negative integer"
[[ "$POLL_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || die "POLL_MAX_ATTEMPTS must be a positive integer"

# Retry commands that make network requests. The final failure is returned to the caller.
retry() {
  local attempt=1 status
  while true; do
    if "$@"; then
      return 0
    else
      status=$?
    fi

    if (( attempt >= MAX_RETRIES )); then
      printf 'Command failed after %s attempts: %s\n' "$attempt" "$*" >&2
      return "$status"
    fi

    printf 'Attempt %s/%s failed; retrying in %ss: %s\n' \
      "$attempt" "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" "$*" >&2
    sleep "$RETRY_DELAY_SECONDS"
    ((attempt++))
  done
}

# Capture output while keeping retry diagnostics on stderr.
retry_capture() {
  local attempt=1 status output
  while true; do
    if output=$("$@" 2>&1); then
      printf '%s\n' "$output"
      return 0
    else
      status=$?
    fi

    if (( attempt >= MAX_RETRIES )); then
      printf '%s\n' "$output" >&2
      printf 'Command failed after %s attempts: %s\n' "$attempt" "$*" >&2
      return "$status"
    fi

    printf 'Attempt %s/%s failed; retrying in %ss: %s\n%s\n' \
      "$attempt" "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" "$*" "$output" >&2
    sleep "$RETRY_DELAY_SECONDS"
    ((attempt++))
  done
}

command -v git >/dev/null 2>&1 || die "git is required"
command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) is required"

branch=$(git symbolic-ref --quiet --short HEAD) || die "current checkout is detached; switch to a branch first"
[[ "$branch" == "$TARGET_BRANCH" ]] || die "current branch '$branch' is not target branch '$TARGET_BRANCH'"

remote_url=$(git remote get-url "$REMOTE" 2>/dev/null) || die "git remote not found: $REMOTE"
case "${remote_url%.git}" in
  "https://github.com/$GH_REPO"|"git@github.com:$GH_REPO"|"ssh://git@github.com/$GH_REPO") ;;
  *) die "remote '$REMOTE' points to '$remote_url', expected GitHub repository '$GH_REPO'" ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  git add -A
  git commit -m "$COMMIT_MESSAGE"
fi

commit_sha=$(git rev-parse HEAD)
printf 'Pushing %s at %s to %s...\n' "$branch" "$commit_sha" "$REMOTE"
retry git push "$REMOTE" "$branch"

printf 'Triggering workflow %s on %s...\n' "$WORKFLOW" "$branch"
retry_capture gh workflow run "$WORKFLOW" --repo "$GH_REPO" --ref "$branch"

run_id=""
for ((attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++)); do
  run_id=$(retry_capture gh run list \
    --workflow "$WORKFLOW" \
    --repo "$GH_REPO" \
    --branch "$branch" \
    --commit "$commit_sha" \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId' 2>/dev/null || true)

  if [[ "$run_id" =~ ^[0-9]+$ ]]; then
    break
  fi

  if (( attempt == POLL_MAX_ATTEMPTS )); then
    die "workflow run was not found for commit $commit_sha"
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

printf 'Watching workflow run %s...\n' "$run_id"
for ((attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++)); do
  state=$(retry_capture gh run view "$run_id" --repo "$GH_REPO" --json status,conclusion,url \
    --jq '[.status, (.conclusion // ""), .url] | @tsv') || die "could not read workflow run $run_id"
  IFS=$'\t' read -r status conclusion run_url <<< "$state"

  case "$status" in
    completed)
      [[ "$conclusion" == "success" ]] || die "workflow failed ($conclusion): $run_url"
      printf 'Workflow completed successfully: %s\n' "$run_url"
      break
      ;;
    queued|in_progress|waiting|requested|pending)
      printf 'Run %s: %s\n' "$run_id" "$status"
      ;;
    *)
      die "workflow entered unexpected status '$status': $run_url"
      ;;
  esac

  if (( attempt == POLL_MAX_ATTEMPTS )); then
    die "workflow did not finish within the polling limit: $run_url"
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

mkdir -p "$OUTPUT_DIR"
printf 'Downloading artifact %s to %s...\n' "$ARTIFACT_NAME" "$OUTPUT_DIR"
retry gh run download "$run_id" --repo "$GH_REPO" --name "$ARTIFACT_NAME" --dir "$OUTPUT_DIR"
printf 'Downloaded files:\n'
find "$OUTPUT_DIR" -maxdepth 2 -type f -print
