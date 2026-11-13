# Cutover window tools

Run from this repository's source. Every operation targets the explicitly named checkout, which may be a separate
rehearsal copy:

```sh
npm run -s cutover-window -- lock --repo /path/to/checkout
npm run -s cutover-window -- check --repo /path/to/checkout --flip-branch feat/flip --flip-pr 7
npm run -s cutover-window -- copy --repo /path/to/checkout --destination /path/to/new-copy
```

`lock` locks the marked linked checkouts and reports each newly locked path. Existing locks keep their reasons,
and unmarked checkouts stay unlocked. An individual lock failure is reported while the remaining checkouts are
locked; the operation exits zero, and `check` refuses a marked checkout left unlocked. Repair the reported failure
and run `lock` again before checking.

`copy` requires an absent destination outside every live checkout. It copies the primary and all registered linked
checkouts, repairs their copied Git registrations, and creates an independent bare mirror of `origin`. All effective
fetch and push URLs in the copy and mirror must name that mirror. Before reporting success it checks every copied
Git pointer, backing-repository setting, host discovery result, and Errand identity snapshot. A copied Errand awaiting
merge refuses because abandoning it would contact its host. The JSON result names the primary, mirror, and copied
checkouts. A failed copy leaves its destination for inspection; repair the cause and use a new absent destination.

`check` refuses pre-existing store, designation, or hold state, then retains its restore point under
`refs/arc-window/`. The record lives at `refs/arc-window/record`; `refs/arc-window/complete` is written last and
points at that record. An interrupted acquisition without the marker is incomplete and must be removed before
another check. A complete earlier hold is preserved for its restore or close route.

Every registered checkout must descend from the sealing commit on `main`. Each present built CLI must pass the
repository's build-freshness check; a checkout without a built CLI is allowed.

Use `--path "$PATH"` to inspect the committing shell's search path explicitly. Without it, `check` inspects its own
process's `PATH`. Every `arc` executable is resolved, including entries after an allowed one; each target must belong
to a registered checkout or the checkout running these source tools. Uninstall a foreign executable or remove its
directory from the committing shell's `PATH` for the window.

The flip request must name the supplied branch into `main`. When every effective remote fetch and push URL is local,
add `--pull-requests /path/to/requests.json` with complete rehearsal facts:

```json
{
  "open": [{ "number": 7, "headBranch": "feat/flip", "baseBranch": "main" }],
  "flip": { "number": 7, "headBranch": "feat/flip", "baseBranch": "main", "autoMergeArmed": false }
}
```

Relative supplied-file paths resolve within the named checkout. A hosted repository refuses supplied host facts
before reading the file or contacting the host.

A hostless rehearsal that predates the tooling's landing may also supply `--anchor <commit>`. Hosted repositories
derive the anchor from `main` and refuse a supplied one.

`rehearse` runs the window's sequence on a copy that `copy` made, naming the copy's primary checkout:

```sh
npm run -s cutover-window -- rehearse --repo /path/to/copy/primary --anchor <commit> --plan abort \
  --cap-wrapper '["bash", "-c", "exec \"$@\"", "cap"]' --json
```

It first repeats copy safety, so a target that is not such a copy refuses before anything is written. It then
prepares the copy as the cleanup before a window prepares the live repository, and runs the window's steps: `lock`,
`check`, the save in every copied checkout, the state-remote designation, the import with publication to the mirror,
a refused sealed write in each checkout with its own build, the identity-ref retirement, `account`, `chain`, and
`recompute`. Every commit, merge, and push it makes runs in a hookless scratch clone of the mirror under
`<copy>/rehearsal/` and reaches the copy by fetch; a plant that must stay apart from the mirror is written in the copy
with `git commit-tree` and `git update-ref`. ARC commands run through each checkout's own built CLI, or the primary
copy's from that checkout where it has none, under a search path holding no other `arc`. `--path` names the search
path `check` judges, `--anchor` the sealing commit of a copy that predates the tooling, `--plan` a run plan
(`abort` or `merge`), `--cap-wrapper` a JSON argv prefix that bounds the import's memory, and `--heap-mb` the
import's heap ceiling, set below that bound. Each step's outcome is reported in order; the run stops at the first
unexpected one, naming the step, and reports the import's wall time and peak resident memory.

Add `--json` for one result on stdout and the human report on stderr. Refusals and stops exit nonzero and include
recovery instructions. The `-s` keeps npm's own banners off stdout.

The family is excluded from the published package, install recipe, and CLI bundle.
