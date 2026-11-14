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
checkouts, repairs their copied Git registrations, and creates an independent bare mirror of `origin`. A checkout
registered while the copy runs refuses it before any repair, since the copy would hold that registration without its
folder and a repair would rewrite the live checkout's pointer; retry once no checkout is being added. All effective
fetch and push URLs in the copy and mirror must name that mirror. Before reporting success it checks every copied
Git pointer, backing-repository setting, host discovery result, and Errand identity snapshot. A copied Errand awaiting
merge refuses because abandoning it would contact its host; merge or abandon it on the live repository, then take a
new copy. The JSON result names the primary, mirror, and copied checkouts. A copy that fails after creating its
destination removes its copied worktree registrations, so the partial copy names no live checkout; remove it, repair
the cause, and use a new absent destination.

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

The hold `check` retains stays until `close` releases it or `restore` uses it. `recompute`, `last-read`, `compare`,
`confirm`, and `restore` read that hold and refuse without it; `account` and `chain` read the repository and the store
alone. `close` with no hold to release passes as a cleanup only, so run it from the checkout that holds the window.

After the import, `recompute` compares every input the check recorded with what is there now: local and `origin` branch
and store-ref tips, the host's branch tips, and each checkout's head, cleanliness, and personal files. It fetches and
writes nothing, and names each moved input. `account` reports every tracked state file the import's own discovery finds
and refuses any whose state did not land. `chain` compares each Candidate's review chain as the repository held it with
the chain the store now holds, reading the import's `--json` output:

```sh
npm run -s cutover-window -- recompute --repo /path/to/checkout
npm run -s cutover-window -- account --repo /path/to/checkout
npm run -s cutover-window -- chain --repo /path/to/checkout --report /path/to/import-report.json
```

Immediately before the merge, `last-read` repeats recompute's comparison with the flip exempted. It requires each side
of the flip the record holds, among its local, `origin`, and host tips and its checkout, to name one commit whose only
parent is the recorded flip head and which only deletes tracked-state files, and it refuses while auto-merge is armed on
the flip request. It takes the flip options `check` took, with `--pull-requests` for a hostless rehearsal:

```sh
npm run -s cutover-window -- last-read --repo /path/to/checkout --flip-branch feat/flip --flip-pr 7
```

After the merge, `compare` records where one branch or checkout stands against the hold. With `--branch` it marks a
live branch's local and `origin` tips, or those of a state-bearing branch the record holds no tip of, and reports each
range changed since the check; a branch the record holds but did not count live has nothing to compare. An unrecorded
branch that shares no history with `main` refuses until it is deleted or `main` is merged into it. With `--checkout` it
reports a late change to a registered checkout's personal files. Reapply each reported branch range through the store,
then `confirm` the branch at the exact tip of each reported range:

```sh
npm run -s cutover-window -- compare --repo /path/to/checkout --branch feat/example
npm run -s cutover-window -- compare --repo /path/to/checkout --checkout /path/to/linked
npm run -s cutover-window -- confirm feat/example --repo /path/to/checkout --local-tip <oid> --origin-tip <oid>
```

`close` releases the hold once `origin` contains the flip, every side the record holds of a live branch and every side
of a state-bearing branch the record holds no tip of has a comparison mark, every range is confirmed at its current
mark, and no checkout's committed head still tracks state. Otherwise it refuses, naming each gap, and keeps the hold.
It deletes the completion marker before the remaining hold refs, and it removes an incomplete hold on its own.

To abort before the merge, `restore` returns every recorded ref locally and on `origin`, verifies them, and deletes the
hold. It takes the recorded flip's options, and refuses while auto-merge is armed or once the flip has merged, which is
then fixed forward from the landed store. When another writer changed a `refs/arc/` ref on either side after the check
or the import read it, settle the change and name the value the restore should keep with
`--accept <ref>=<object ID or absent>`, repeated as needed: the value found, or, for a consumed identity ref whose kept
tip remains, that kept tip. The refusal names the ref and the value to give. A restore interrupted before it deletes
the completion marker resumes when run again; one interrupted after leaves an incomplete hold for `close` to remove:

```sh
npm run -s cutover-window -- restore --repo /path/to/checkout --flip-branch feat/flip --flip-pr 7
```

`rehearse` runs the window's sequence on a copy that `copy` made, naming the copy's primary checkout:

```sh
npm run -s cutover-window -- rehearse --repo /path/to/copy/primary --anchor <commit> --plan abort \
  --cap-wrapper '["bash", "-c", "ulimit -v 8388608 && exec \"$@\"", "cap"]' --heap-mb 4096 --json
```

It first repeats copy safety, so a target that is not such a copy refuses before anything is written. It then prepares
the copy as the cleanup before a window prepares the live repository, and runs the window's steps: `lock`, `check`, the
save in every copied checkout, the state-remote designation, the import with publication to the mirror, which must then
hold every store ref the push publishes at the copy's object, a refused sealed write in each checkout with its own
build, the identity-ref retirement, `account`, `chain`, and `recompute`. Every commit, merge, and push it makes runs in
a hookless scratch clone of the mirror under `<copy>/rehearsal/` and reaches the copy by fetch; a plant that must stay
apart from the mirror is written in the copy with `git commit-tree` and `git update-ref`. ARC commands run through each
checkout's own built CLI, or the primary copy's from that checkout where it has none, under a search path holding no
other `arc`. `--path` names the search path `check` judges, `--anchor` the sealing commit of a copy that predates the
tooling, `--plan` a run plan (`abort` or `merge`), `--cap-wrapper` a JSON argv prefix the import runs under, which
must set its address-space limit itself, as the example's `ulimit -v` (in KiB) does, and `--heap-mb` the import's heap
ceiling, set below that limit. Without a wrapper the import inherits the driver's own limit. Each step's outcome is
reported in order; the run stops at the first unexpected one, naming the step, and reports the import's wall time and
peak resident memory with the address-space limit and heap ceiling its process ran under, and how many files `account`
placed in each classification.

The npm script bounds each WebAssembly memory's address-space reservation, so the family also runs under an
address-space limit: unbounded, the TypeScript loader's two reservations can fill most of such a limit before any work
starts. A run under a limit launches through the script, or passes the same `--wasm-max-mem-pages` flag to `node`.

Add `--json` for one result on stdout and the human report on stderr. Refusals and stops exit nonzero and include
recovery instructions. The `-s` keeps npm's own banners off stdout.

The family is excluded from the published package, install recipe, and CLI bundle.
