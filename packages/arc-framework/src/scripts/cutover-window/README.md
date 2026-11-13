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

Add `--json` for one result on stdout and the human report on stderr. Refusals and stops exit nonzero and include
recovery instructions. The `-s` keeps npm's own banners off stdout.

The family is excluded from the published package, install recipe, and CLI bundle.
