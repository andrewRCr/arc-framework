# Draft: Operation Resource Ownership

- **Origin:** [internal] — minted at the 2026-11-16 housekeep drain from two `USER-INBOX` captures (2026-08-11 and
  2026-08-20, with follow-ups through 2026-09-05), held until then for `review-checkout-lifecycle`, whose design covers
  only the checkout the frontline review path materializes.
- **Purpose:** Give every checkout and temporary resource an ARC operation creates an owner that reaps it on the
  operation's terminal paths, so none outlives its operation, pollutes the locus roster, or needs filename archaeology
  to clean up.
- **State:** provisional stub. Concerns recorded with candidate directions; none is settled.

---

## Problem / Motivation

### Local review materializations: the reap gap and the roster's misclassification

- _Observation:_ two evidence points from a live incident, both sharpening defects the draft already owns. First,
  the local review lane's TTL sweep (terminally-expired reaping) fires only from `arc review local prepare` /
  `resume`, so a WU's _final_ review leaves never-attested materializations expired but unreaped indefinitely —
  five from `decompose-transition-record`'s 2026-08-09 chunked review lingered under
  `.git/arc/review-gate/materializations/` until manually reaped on 2026-08-11. Even under the draft's
  clone-isolation design, a lane-internal-only trigger leaves expired operation state until the next review
  happens to run; a ship-time or session-init reap hook may still be wanted.

- _Observation:_ second, the draft's "the existing sweep cannot see them — externally managed at best" observation
  now _understates_ the failure: the derived-locus roster (post `session-locus-model`) admits every registered
  worktree with no common-dir or namespace filter, reads the tracked meta file embedded in each checkout, derives
  a WU subject from it, and emitted per-checkout `topology-mismatch` diagnostics plus "inspect before cleanup"
  guidance in every session-init. Loud misclassification of a shipped WU's review residue, not invisibility.

- _Observation:_ second occurrence, 2026-08-20 — one materialization lingered after the
  `terminal-attach-completed-wu` Errand's review (PR #511, head `9af0ba832`), clean and at an ancestor of `main`,
  again reaped by hand. **This widens the case:** the concern above frames the gap as _a WU's final review_ leaving
  expired materializations, but an Errand's review reaches the same dead end — the Errand lane has no
  `prepare`/`resume` re-entry to fire the sweep either. Confirmed the same day that `arc review local` exposes only
  `prepare` / `attest` / `resume`, so no reap path is reachable from outside the lane by any caller. Two hand-reaps
  in eleven days across two different lane entrants makes this recurring rather than incidental.

- _Approach:_ the clone-isolation design dissolves the roster half for future checkouts; decide whether an interim
  filter excluding git-common-dir-internal paths from the user-facing roster/guidance is worth landing first, and
  whether reap triggering needs a surface outside the review lane.

- _Follow-up evidence:_ the discriminator for which residue checkouts go loud is now exact, and it is not
  path-based. Lifecycle authority (`projectWorkUnitLifecycle`) reads the tracked active meta from each checkout's
  own tree and takes its `Branch` field as `expectedTopology.branch`; a detached checkout then fails
  `corroborateCheckoutRole` and lands `unresolved-checkout` + `topology-mismatch`. So a checkout cut from the
  WU-branch/terminal side of a delivery stack carries `meta-<wu>.md` and goes loud, while one cut from a
  non-terminal delivery member stays silent — those members exclude the owning WU's lifecycle artifacts by cohort
  contract, so no subject is derived and they land `unmanaged-checkout`. Verified across 41 registered checkouts:
  the six flagged all carry the meta, the 24 quiet ones do not. This also bounds the interim filter proposed
  above — five of the six loud checkouts were under `/tmp`, so excluding git-common-dir-internal paths would have
  suppressed one of six.

- _Captured during:_ session-init noise-over-signal investigation, free-primary session, 2026-08-11.
- _Follow-up captured during:_ `delivery-native-stack-composition` Member 7 session-init orientation, 2026-09-03.

### Ceremony-created checkouts and other operation-created resources

- _Observation:_ the prepublication / chunked-review ceremony hand-rolls `git worktree add` into `mkdtemp`
  directories, and nothing reaps them. No shipped verb creates that prefix — every `mkdtemp` in
  `packages/arc-framework/src/` uses a different one (`arc-base-sync-`, `arc-merge-`, `arc-diff-`,
  `arc-frontline-review-`) — so the checkouts belong to no operation's cleanup path. Eight accumulated during
  `integration-boundary-accuracy`'s prepublication passes (2026-08-19): five were registered worktrees that
  emitted `topology-mismatch` diagnostics plus "inspect before cleanup" guidance in every session-init, and three
  were unregistered and therefore invisible to orientation entirely — so the roster undercounted the residue it
  did report. Registered worktrees under a temp root are the bad combination: they outlive the operation, pollute
  the derived-locus roster, and a temp-root clear leaves stale registrations rather than a clean slate.

- _Approach:_ decide whether ceremony-created checkouts route through a managed temp-locus primitive that
  registers them for reaping, or stay unregistered (plain clone / `git archive` extraction) so they never enter
  the worktree roster at all. The second is cheaper and needs no reaper, but forfeits worktree-backed sharing of
  the object store — weigh that against how large these checkouts get.

- _Scope:_ same failure shape as the review-lane reap gap already captured against this target — an
  operation-scoped checkout with no lifecycle owner — but a different creator, so it needs its own answer rather
  than inheriting the clone-isolation design. Corroborating detail for that sibling capture: `arc review local`
  exposes only `prepare` / `attest` / `resume`, confirming there is no reap path reachable outside the lane.

- _Follow-up evidence:_ The corrective delivery commit later emitted an in-flight-artifact advisory for a shadow
  recovery checkout, `recovery/dnsc-rzb-before-settlement`, still pointing at the active WU branch. Location-based
  resolution kept the commit safe, but the surviving recovery locus added warning noise and is another concrete
  operation-created checkout/reference whose retirement is not owned by the operation that created it.

- _Follow-up evidence:_ A delivery-correction conflict workspace under the owning repository's Git-common
  directory inherited the primary checkout's root `node_modules` through ordinary Node resolution instead of the
  active WU checkout's package-local dependency tree. Vitest then loaded an incompatible `js-yaml` major and failed
  before any test ran; temporarily linking the WU package dependencies into the prepared workspace made the exact
  correction suite pass. Lifecycle ownership therefore also needs an execution-environment contract: a prepared
  checkout must either resolve dependencies from its authoritative source checkout, provision its own dependencies,
  or fail explicitly instead of silently consuming a sibling checkout's installation.

- _Follow-up evidence:_ hand-rolled residue now sits inside ARC's own managed gate namespace:
  `.git/arc/delivery-gates/<planId>/review-fix-conflict-refresh-and-native-landing`. No shipped verb constructs
  that name — `review-fix-conflict` appears nowhere in `packages/arc-framework/src/` — and its directory segment
  is not one of the plan's eight `chunkKey`s, so `deriveDeliveryResidueLocators` never emits a locator for it and
  `reapCompletedDeliveryResidue` will never reap it even at a clean closeout. The delivery reaper is
  plan-derived, so anything placed in its directory by something other than the plan is permanently invisible to
  it — a stronger failure than an unowned temp checkout, because the location implies an owner that does not
  exist. Alongside it, 24 hand-cut `/tmp` scratch checkouts from the same delivery debugging accumulated on one
  machine holding seven active work units.

- _Follow-up evidence:_ The exact post-review inventory found 41 registered worktrees: eight legitimate primary or
  active-WU checkouts and 33 associated with this delivery (eight plan-owned gates, one unowned conflict gate, and
  24 `/tmp` scratch checkouts), consuming about 2.3 GiB. Seven scratch checkouts were dirty. One still held the
  canonical `delivery/.../terminal-integration` branch, so it can obstruct closeout's member-ref retirement; the
  final plan-owned gate had also been manually moved away from its paired private Candidate ref, so closeout's
  correct candidate/gate exactness would refuse. This run needs evidence-backed one-time repair, while the durable
  fix remains typed lifecycle ownership and reaping for every operation-created checkout, with no raw manipulation
  of canonical gate loci.

- _Follow-up evidence:_ removing the 24 registered scratch worktrees exposed a second, roster-invisible residue
  class: 23 unregistered `/tmp/dnsc-*` directories consuming about another 1.2 GiB. They comprised ten standalone
  inspection/rebuild clones, three saved Git indexes, package/test/npm caches and tarballs, state-recovery snapshots,
  and review-evidence backups. One clone still had staged changes, although its exact index tree matched a committed
  tree; every clean clone had zero commits ahead of its upstream, and every saved index matched a committed tree.
  Cleanup required a separate filesystem inventory and destructive authorization because neither `git worktree`
  topology nor plan-derived delivery closeout could see or own these artifacts. The lifecycle design therefore needs
  to cover all operation-created temporary resources, not only registered checkouts: creation should return an owned
  cleanup handle or manifest, terminal paths should reap it, and recovery should surface retained resources without
  depending on filename-prefix archaeology. After the one-time repair, the machine retained only eight legitimate
  project/WU checkouts and the eight clean plan-owned gates, with every gate exactly paired to its Candidate ref.

- _Follow-up evidence:_ successful in-place `arc teardown` deliberately left a clean, stamped, detached terminal
  husk for the primary stale-worktree sweep, but immediate handoff still selected `release-work-unit` for the
  completed WU, projected its already-retired per-WU `SESSION-NOTES.md` path, and routed `arc sync` through
  `blocked-detached-head`. The notes leg was then blocked behind an impossible worktree push even though the note is
  identity-global and the clean primary already carried the merge commit; completing handoff required running sync
  from that primary checkout. Checkout lifecycle should either classify a stamped terminal husk as disposable /
  between-WUs for handoff or let its notes leg synchronize independently, without recreating the retired WU notes.

- _Captured during:_ free-primary session-init following the `integration-boundary-accuracy` ship, 2026-08-20.
- _Follow-up captured during:_ `delivery-native-stack-composition` corrective integration commit, 2026-08-31.
- _Follow-up captured during:_ `delivery-native-stack-composition` Member 5 correction refresh, 2026-09-02.
- _Follow-up captured during:_ `delivery-native-stack-composition` Member 7 session-init orientation, 2026-09-03.
- _Follow-up captured during:_ `delivery-native-stack-composition` post-review cleanup inventory, 2026-09-04.
- _Follow-up captured during:_ `delivery-native-stack-composition` unregistered-residue cleanup, 2026-09-04.
- _Follow-up captured during:_ `delivery-native-stack-composition` post-teardown handoff, 2026-09-05.

---

## Related

- `review-checkout-lifecycle` covers the frontline review checkout's failure evidence and registration leakage; a
  neighbor, not this unit's design.
- `review-operation-state-isolation` holds the operation-record half: collecting settled local-review records before
  repository-wide parsing can block a new Candidate.
- The detached-husk handoff facet (the last follow-up above) likely retires with `cutover-flip`, which ends user notes.
