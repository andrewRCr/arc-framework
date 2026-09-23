# delivery-rebuild-continuity — reference model

An executable model, in bash and git plumbing, of the git algebra `spec-delivery-rebuild-continuity.md` settles:
construct's first cut and re-anchor, the base's recorded resolution R(B) and its attribution, the delta split, the
contribution proof's window, and the carry across a stopped rewrite loop's broken chain, with the source-top advance.
It was built during that spec's planning to test candidate rules against concrete topologies before they were written
down.

**Status.** This is evidence, not authority. The spec is the contract; where the model and the spec or the
implementation disagree, that is a finding to route, never a reason to follow the model. The model covers the git
algebra only — no Delivery State, refs, reservations, provider, or controller. It was written by the spec's author and
has not been attacked by an independent reviewer, so it catches divergence between the implementation and the model,
not a misconception the two share. It lives on this non-merging branch through the work unit's implementation and is
deleted when the work unit is archived.

## Running

Requires bash and git 2.40 or later (`git merge-tree --write-tree --merge-base`).

```bash
./run.sh              # every case, from a clean state; SAME / DIFF against expected/
./run.sh p9-e p10-i   # named cases (reg/ cases as reg_<name>)
bash p10-i.sh         # one case, output to the terminal
```

Commit identity and dates are pinned (`lib1.sh`), so object ids are reproducible and `expected/` records them. Each
case builds its repositories under `r/` (or `reg/r/`); those, `results/`, and the dot-files the scripts use for
scratch are ignored.

`BREAK10=0` disables the pass-ten carry across a break, and `ADV10=0` the source-top advance; with both on (the
default) the model is the settled rule. Every unbroken-chain case is byte-identical under `BREAK10=0`.

## Libraries

Each layer sources the one below and redefines what changed.

| File      | Adds                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `lib1.sh` | Primitives (`newrepo`, `put`, `norm` strips the lifecycle path, `compose`), the per-member guard             |
| `lib2.sh` | Member sources (`cuts`, `spans`, `oldtop`), placement, attribution (`attributed`), authored-commit check     |
| `lib7.sh` | R(B) (`rset`), attribution's share per member (`rk`), re-anchor on overlap, first cut, the proof window      |
| `lib8.sh` | Delta split (`dkeep`, `split8`), refresh arms, `carry10` (carry across a break, window-bounded), `advance10` |

## Cases

| Case                 | Topology                                                                                                                                                              | What it pins                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `f5`                 | A base merge not directly on the source top; fix-then-merge on the same or another hunk; a fix set aside by `git revert` and re-applied; two base merges around a fix | The delta split and its entangled stop                                            |
| `g-terminal`         | A correction on the terminal, on a path in R(B), under disjoint movement                                                                                              | Which commit carries the fix                                                      |
| `h-structural`       | The terminal's absorption merge with a departure, a conflicting merge, a base-added path                                                                              | The terminal's structural check                                                   |
| `i-window`           | The `4ae7872f35` re-anchor shape                                                                                                                                      | The proof window across the loop's rewrites                                       |
| `p9-a`, `p9-a2`      | An uncut published chain with a conflicting base merge in m2's range, then an overlapping base                                                                        | Recorded-predecessor window against D2's operand                                  |
| `p9-b`               | A disjoint correction, then an overlapping one                                                                                                                        | The terminal's window after its predecessor moved                                 |
| `p9-c`, `-c2`, `-c3` | A rewrite loop stopped after m1; nothing moved, a base moving during the interruption, R read from B0                                                                 | Construct over the mixed records                                                  |
| `p9-d`               | Two disjoint corrections                                                                                                                                              | Where the absorption merge departs, and which window covers it                    |
| `p9-e`               | The stopped loop, then a disjoint base (E1), an overlap on m2 (E2), a second fix (E3)                                                                                 | Mixed records against the loop's candidates; E3 completes by the advance          |
| `p10-f`              | R0 (nothing moved), E1, E2, E4 (overlap on the rewritten m1), at both placements                                                                                      | Carry across the break equals construct over the candidates (ids, trees, parents) |
| `p10-g`              | E5: a later disjoint base whose resolution departs on a path no member authored                                                                                       | The carry's window bound                                                          |
| `p10-i`              | V1 fix above the break; V2 spanning fix; V3a/b second fix and base move in either order; V4 lifecycle commit; V5/V6 tail pending                                      | The carry and advance at the break's edges                                        |
| `p10-u`              | Unbroken control: a fix on m1 conflicting on a path m3 shares                                                                                                         | A fold conflict stops without a break too                                         |
| `reg/a-overlap`      | First cut; overlap on m1 or m2 reconciled on the top; entangled members; disjoint movement                                                                            | Re-anchor and terminal absorption                                                 |
| `reg/b-new`          | Departures on a member's path and a base-added path; the top fixing a base-added file                                                                                 | The terminal carry proof against R(B)                                             |
| `reg/b-sources`      | Sequential pre-publication fixes; a binding stopped after m2 and re-run; a hand recut                                                                                 | Member sources and placement                                                      |
| `reg/c-checks`       | A provider plain-rebase restack; a planted authored commit                                                                                                            | The authored-commit check and the controller's construct predicate                |
| `reg/d-reanchor`     | Targeted re-anchor shapes                                                                                                                                             | Each request's three-dot diff after re-anchor                                     |
| `reg/e-carried`      | A first cut over members carrying lifecycle commits and a base merge inside the chain, with and without forced re-anchor                                              | The guard, completeness, and each request's presentation                          |
