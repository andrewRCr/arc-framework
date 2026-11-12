# Strategy: Review Projection

**Purpose:** Give a work unit that lands on a single branch host-visible review one chunk at a time, by projecting
its review chunks as stacked draft pull requests beside its one real pull request.

**Scope:** Project-internal and transitional. A projection is a review surface only: it carries no ARC review
evidence, never merges, and retires when stacked delivery returns after the storage cutover (the review-projection
row of the storage-coupling register in `cohort-state-storage.md`).

---

## When to Project

Project a work unit whose change set is chunked for review (the `review-chunking` method) and whose Owner wants to
read it chunk by chunk in the host UI. Storage-program work units land single-branch until the program completes,
so they are the expected users. An Errand or a small work unit gains nothing: its one pull request already reads
in a sitting.

## The Chunk File

A `[name]` line starts a chunk; every other line that is not blank or a `#` comment is a git pathspec belonging to
that chunk. Keep the file outside the change set — the work unit's gitignored `.arc/user/{identity}/{slug}/`
directory is a natural home.

```text
# Stack order: each chunk after every chunk whose changed declarations it consumes.
[kernel]
packages/arc-framework/src/lib/kernel/
packages/arc-framework/__tests__/unit/kernel/

[consumers]
packages/arc-framework/src/handlers/
```

- **Order is the stack.** Chunk 1 sits on the merge base and each later chunk on the one before it, so put every
  chunk after the chunks it depends on; each pull request then reads against code that already exists below it.
- **Files, not hunks.** Every changed path outside `.arc/active/` belongs to exactly one chunk. A boundary that
  would split one file's hunks cannot be projected; move the file or merge the two chunks.
- **The seam has no branch.** The cross-chunk seam scope reviews surface that spans chunks, so read it on the top
  projection or the real pull request.

## Commands

Run from the work unit's checkout after fetching the base; `--head` defaults to `HEAD` and `--base-ref` to
`origin/main`.

```bash
bash scripts/review-projection.sh build <slug> <chunk-file>
bash scripts/review-projection.sh publish <slug> <chunk-file> --pr <real-pr-number>
bash scripts/review-projection.sh close <slug>
```

- `build` validates the chunk file against the change set and prints the stack — one `<k> <sha> <chunk>` line per
  commit, line 0 being the merge base. It changes no ref.
- `publish` builds, pushes `review-projection/<slug>/<k>` for every commit in one leased, atomic push, deletes
  branches a shorter stack no longer uses, opens a draft pull request for each new chunk, and retitles the rest.
- `close` closes the projection's pull requests and deletes its branches.

## What a Projection Guarantees

- **Chunk k alone per pull request.** Commit k holds the merge base plus chunks 1 through k, and its pull request
  opens against branch k−1.
- **The top matches the head.** The last commit's tree equals the head's everywhere except `.arc/active/`, which is
  never projected: a projection branch must not read as a work unit. In-flight discovery also skips every
  `review-projection/` branch.
- **Refusal, not guessing.** A path no chunk covers, a path two chunks claim, and a chunk that covers nothing each
  refuse the build before anything is pushed.
- **Stable lower chunks.** Commits are dated at the merge base, so a rebuild leaves every chunk below the first
  changed one at the same commit, and its pull request and review threads undisturbed.

## Lifecycle

1. Open the work unit's real pull request first; it carries the review obligation. Pass its number with `--pr`.
2. Run `build` until the chunk file is accepted, then `publish`.
3. After every push to the work-unit branch — a fix, a base merge — run `publish` again. It force-pushes the
   projection branches, which is expected: they are disposable and exist only to be rebuilt.
4. When the real pull request merges, or the work unit is abandoned, run `close`.

## Authority

Review on a projection is attention, not ARC review evidence. Fix what it finds on the work-unit branch and
republish. The real pull request's standard review closes by the Owner-directed review stop, and merge authority
stays with that pull request's integration interlock.

## Host Behavior

- **No CI.** `ci.yml` runs only for pull requests into `main`, and the first projection opens against the base
  anchor `review-projection/<slug>/0`, so no projection pull request runs CI.
- **No lane attestation.** `arc-lane-attestation.yml` skips `review-projection/` heads, and the review-defer
  workflow skips pull requests that do not target `main`.
- **No automatic hosted review.** CodeRabbit does not auto-review drafts. Comment `@coderabbitai review` on a
  projection for an extra read; its findings are attention like any other projection review.

## Retirement

Retire with the register row: delete `scripts/review-projection.sh` and its integration test, this strategy and its
`STRATEGY-INDEX` entry, the lane-attestation guard, and the `review-projection/` exclusion in in-flight discovery.
