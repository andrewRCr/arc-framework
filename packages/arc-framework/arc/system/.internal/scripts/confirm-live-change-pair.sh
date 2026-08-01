#!/usr/bin/env bash
#
# Confirm that one classified pull-request/base pair is still live on GitHub.

set -euo pipefail

readonly EX_USAGE=64
readonly OBJECT_ID='^([0-9a-f]{40}|[0-9a-f]{64})$'

repository="${1:-}"
pull_request="${2:-}"
base_ref="${3:-}"
classified_base="${4:-}"
classified_head="${5:-}"

if [[ "$#" -ne 5
  || ! "${repository}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$
  || ! "${pull_request}" =~ ^[1-9][0-9]*$
  || -z "${base_ref}"
  || ! "${classified_base}" =~ ${OBJECT_ID}
  || ! "${classified_head}" =~ ${OBJECT_ID}
  || "${#classified_base}" -ne "${#classified_head}" ]]; then
  echo "live-pair: repository, pull request, base ref, base SHA, and head SHA are required" >&2
  exit "${EX_USAGE}"
fi

owner="${repository%%/*}"
name="${repository#*/}"
qualified_base_ref="refs/heads/${base_ref}"
# GraphQL variables are intentionally literal in the query document.
# shellcheck disable=SC2016
query='
query($owner: String!, $name: String!, $number: Int!, $qualifiedName: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      baseRepository {
        nameWithOwner
      }
      headRefOid
      state
    }
    ref(qualifiedName: $qualifiedName) {
      target {
        oid
      }
    }
  }
}'

if ! live_pair="$(gh api graphql \
  -f query="${query}" \
  -F owner="${owner}" \
  -F name="${name}" \
  -F number="${pull_request}" \
  -F qualifiedName="${qualified_base_ref}" \
  --jq '[
    .data.repository.pullRequest.headRefOid,
    .data.repository.ref.target.oid,
    .data.repository.pullRequest.state,
    .data.repository.pullRequest.baseRepository.nameWithOwner
  ] | @tsv')"; then
  echo "live-pair-unreadable" >&2
  exit 1
fi

IFS=$'\t' read -r live_head live_base live_state live_repository extra <<<"${live_pair}"
if [[ -n "${extra:-}"
  || ! "${live_head:-}" =~ ${OBJECT_ID}
  || ! "${live_base:-}" =~ ${OBJECT_ID}
  || "${#live_head}" -ne "${#classified_head}"
  || "${#live_base}" -ne "${#classified_base}" ]]; then
  echo "live-pair-unreadable" >&2
  exit 1
fi
if [[ "${live_state}" != "OPEN" || "${live_repository}" != "${repository}" ]]; then
  echo "change-not-live" >&2
  exit 1
fi
if [[ "${live_head}" != "${classified_head}" ]]; then
  echo "head-moved" >&2
  exit 1
fi
if [[ "${live_base}" != "${classified_base}" ]]; then
  echo "base-moved" >&2
  exit 1
fi
