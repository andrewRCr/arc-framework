# Cutover window tools

Run from this repository's source. Every operation targets the explicitly named checkout, which may be a separate
rehearsal copy:

```sh
npm run -s cutover-window -- check --repo /path/to/checkout --flip-branch feat/flip --flip-pr 7
```

`check` refuses pre-existing store, designation, or hold state, then retains its restore point under
`refs/arc-window/`. The record lives at `refs/arc-window/record`; `refs/arc-window/complete` is written last and
points at that record. An interrupted acquisition without the marker is incomplete and must be removed before
another check. A complete earlier hold is preserved for its restore or close route.

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

Add `--json` for one result on stdout and the human report on stderr. Refusals and stops exit nonzero and include
recovery instructions. The `-s` keeps npm's own banners off stdout.

The family is excluded from the published package, install recipe, and CLI bundle.
