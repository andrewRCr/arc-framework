# Merge-Gate Recipe (GitHub)

Copy-ready recipe for the **auto-merge lane**: planning and backlog grooming auto-merges once checks pass,
while constitutional docs (rules, ADRs, strategies) and all code stay in the reviewed lane. See
[strategy-work-organization.md § Auto-Merge Lane][doctrine] for the doctrine these files implement.

This recipe is **GitHub-flavored**. The doctrine is host-agnostic — other hosts adapt the same three
conditions (a stable required check, owner review on reviewed-lane paths only, and native auto-merge) using
their own primitives; only this recipe is GitHub-specific.

## What ships here

- **`CODEOWNERS`** — a drop-in file. The reviewed-lane ownership skeleton: owned paths require review; the
  trailing unowned block clears the auto-merge-lane paths so they need none. Place it at `.github/CODEOWNERS`
  (or repo root / `docs/`) and replace `@your-org/reviewers` with your reviewers.
- **The `merge-ok` gate** — a *snippet*, below, NOT a drop-in file. It must be **merged into the workflow that
  runs your required CI jobs**, because GitHub `needs:` only reaches jobs in the same workflow. Dropping it in
  as a second standalone workflow would roll up nothing and leave your real CI ungated — see § Why a snippet.

## The `merge-ok` gate (merge into your CI workflow)

Add these two jobs to the workflow that already runs your required build/lint/test jobs, and add the two
marked lines to each of those heavy jobs:

```yaml
# --- add to your CI workflow (the one with your required jobs) ---
jobs:
  classify:
    name: Classify lane
    runs-on: ubuntu-latest
    outputs:
      lane: ${{ steps.lane.outputs.lane }}
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - id: lane
        run: |
          base='${{ github.event.pull_request.base.sha }}'
          head='${{ github.event.pull_request.head.sha }}'
          changed="$(git diff --name-only "$base...$head")"
          echo "changed paths:"; printf '%s\n' "$changed"
          # Auto-merge lane = per-WU / per-cohort planning artifacts only,
          # matched by PREFIX: draft- / tasks- / meta- / notes- / cohort-*
          # under active/ or backlog/. Any other path -> reviewed lane.
          if printf '%s\n' "$changed" \
            | grep -qvE '^\.arc/(active|backlog)/([^/]+/)*(draft|tasks|meta|notes|cohort)-'; then
            echo "lane=reviewed" >> "$GITHUB_OUTPUT"
          else
            echo "lane=auto" >> "$GITHUB_OUTPUT"
          fi

  # your existing heavy jobs gain these two lines each:
  #   needs: classify
  #   if: ${{ needs.classify.outputs.lane == 'reviewed' }}

  merge-ok:
    name: merge-ok                      # <- the one check to mark "Required" in branch protection
    needs: [classify, build, test]      # <- list classify + EVERY heavy job
    if: ${{ !cancelled() }}             # run even when the heavy jobs were lane-skipped
    runs-on: ubuntu-latest
    steps:
      - name: Roll up required jobs
        run: |
          # Pass when every needed job succeeded OR was skipped; fail otherwise.
          for r in ${{ join(needs.*.result, ' ') }}; do
            echo "needed job result: $r"
            case "$r" in
              failure|cancelled) echo "::error::a required job did not succeed"; exit 1 ;;
            esac
          done
          echo "merge-ok ✓ (lane=${{ needs.classify.outputs.lane }})"
```

Branch protection requires **only** `merge-ok`. The heavy jobs are lane-skipped on planning-only PRs; `merge-ok`
runs unconditionally and treats a skipped job as success, so a planning PR gets a green required check without
the heavy jobs running — while a code/constitutional PR waits on them. This is why the recipe uses a
roll-up gate and **not** a path-ignored CI workflow (a path-filtered required check never reports and stalls
the merge at *Pending*).

## CI layouts

- **Single CI workflow** (common): paste the snippet into it and add the two marked lines to each heavy job.
- **CI split across workflow files** (e.g. `lint.yml` / `test.yml` / `build.yml`): a single gate can't `needs:`
  jobs in other files. Add `on: workflow_call` to each CI workflow and a thin **parent** workflow that `uses:`
  them and hosts `classify` + `merge-ok` (the gate `needs:` the called workflows; children stay separate
  files). Mark only the parent's `merge-ok` as required. The advanced fallback, when a parent isn't viable, is
  a `workflow_run`-triggered aggregator that reports `merge-ok` from the completed runs.

## Why a snippet, not a file

`needs:` is intra-workflow only, so the gate must live alongside the jobs it rolls up. A standalone
`merge-ok.yml` dropped in next to an untouched CI workflow would roll up only its own (empty) jobs — leaving
real CI ungated, or, if real CI is also marked required, stalling planning-only PRs at *Pending*. Shipping the
gate as a snippet to merge in — rather than a droppable file — keeps that failure mode off the table.

## Apply

1. Merge the gate snippet into your CI workflow per § CI layouts; commit it.
2. Place `CODEOWNERS` (`.github/CODEOWNERS` by default) and set your reviewers.
3. In branch protection for your base branch, mark **`merge-ok`** as the required status check and enable
   **Require review from Code Owners**. Do not require the heavy jobs directly.
4. Enable the repository's **native auto-merge** setting.

A planning-only PR then merges unattended once `merge-ok` is green; a reviewed-lane PR additionally waits on
owner approval. The [Set Up the Auto-Merge Gate workflow][setup-workflow] walks through all four steps.

---

[doctrine]: ../../../strategies/arc/strategy-work-organization.md#auto-merge-lane
[setup-workflow]: ../../../../system/workflows/arc/supplemental/setup-merge-gate.md
