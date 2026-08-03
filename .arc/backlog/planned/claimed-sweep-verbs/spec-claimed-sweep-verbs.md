# Spec (`outline`): claimed-sweep-verbs

- **Origin:** `[internal]` — decomposed from `session-locus-model` on 2026-07-25, which built and proved this
  scope before its delivery stack was carved. The implementation is inherited rather than authored here.

- **Purpose:** Give grooming and inbox housekeeping the same claimed, session-bounded shape Errands already have
  — one identity, one branch, one review tail per sweep — so neither can silently run twice or write outside what
  it claimed.

---

## Problem / Context

Grooming and housekeeping are the two ARC operations that edit **other work units' planning artifacts** and the
developer's own inbox. Both were session-shaped conventions rather than claimed operations: a `chore/groom-*`
branch was recognized by its name, a drain was whatever the session decided to route, and nothing prevented a
second pass from cutting a fresh branch over drafts the first pass had not yet shipped.

`session-locus-model` supplies the substrate that fixes this — a v3 identity ref with immutable claim
generations, complete-basis ref transactions, machine-local role records, and a reader that classifies residue
from records rather than branch shape. It also carries the `groom` and `housekeep` role kinds, their identity
schema variants, and the `plan-open` / `housekeep-open` mutation operations, because those are schema vocabulary
the reader must understand whether or not a driver exists.

What it does not carry is the drivers. Without this deliverable the vocabulary is inert: no verb claims a
grooming set, none opens a routing sweep, and the workflows that would consume them still narrate raw branch
mechanics. This work supplies the nine verbs and the two workflow arms that make the claimed shape real.

## Decision(s)

**We will make grooming an explicit, immutable member-set claim** via
`arc plan open <anchor-stub> [--include <stub>...]`, `arc plan close`, and `arc plan abandon`. Open resolves one
non-empty co-design set while scanning planned, provisional, and active lifecycle state; every member must
resolve uniquely to a branchless planned or provisional stub, and any active subject, cross-directory duplicate,
nested alias, or repeated member refuses. The anchor is always a member. The set is **immutable for the claim
generation** — enlarging it means closing or abandoning and reopening with the complete set — because a mutable
claim cannot be the thing another session checks disjointness against.

**We will claim before editing, and record the base we claimed against.** Open atomically claims the complete set
in the identity ref, then records the exact configured-base `HEAD` observed before the claim/branch transition as
immutable `openedBaseHead`. Full protection cuts `chore/groom-<anchor-stub>` at that OID; partial protection keeps
the same identity-backed claim and revalidates the unchanged base `HEAD` under the primary lock before editing
directly. A lost revalidation rolls back only the unchanged claim.

**Overlap refuses; identity resumes.** A later open with the same anchor and exact member set detects the live
claim and returns the state-appropriate resume/wait verdict rather than cutting a second pass from a base that
lacks the first pass's drafts. Any other overlap returns `identity-conflict` naming the exact conflicting
members. Disjoint sets proceed. No winner-arbitration machinery exists — a raced CAS refuses and re-reads.

**We will authorize grooming writes on exact paths, not basenames.** A claimed member's artifacts are resolved to
exact repository-relative paths and compared normalized, so a matching `meta-*` or `draft-*` basename elsewhere
under `planned/` or `provisional/` cannot receive a write. Writes stay bounded to claimed members' planning
artifacts, cohort records those members already name, and mechanically required derived views.

**We will make a housekeeping drain one globally serialized sweep** via `arc housekeep open <slug>`,
`arc housekeep close <slug>`, `arc housekeep abandon <slug>`, and `arc housekeep mark-execute <titles...>`. Full
mode owns one v3 Errand identity with `purpose: "housekeep-routing"`; every routed entry shares its branch and
PR, whose review lane the workflow classifies once, at close, from the writes the sweep actually landed. The
serialization gate is **global per identity, not per slug**: choosing a different sweep name cannot admit a
parallel drain. Partial mode uses the same sweep slug for one direct-base occupancy and promises only
machine-local primary serialization.

**Partial housekeeping will bind to an exact opened base and apply the same changed-path policy as full close.**
Partial open records the base generation it opened against; partial close derives its write set from that
generation rather than proving only that checkout `HEAD` equals a freshly fetched base. Without the binding, an
arbitrary direct-base change completes as an accepted pure-routing sweep.

**Execute-now marking is one atomic write under the notes lock.** `mark-execute` revalidates the complete
selected title set and writes every ``- _Disposition:_ `execute-bound` `` marking through one same-file
replacement, so a partial failure cannot create a smaller accidental queue. Locus-record and notes locks are
never nested.

**The sweep role closes before the first execute-now Errand opens.** Routing is complete before execution starts,
so a retained housekeep parent would create a false third frame. Each execute-now concern becomes a sibling
Errand parented to the original WU session home, and completion offers the next visible execute-bound capture in
file order.

**We will update the two consuming workflow arms** — `drain-inbox` opens one routing sweep after confirmation and
closes it before handing execution to sibling Errands; `draft-design`'s grooming arm becomes exact-set open →
groom → ship → close. Work-organization's "one PR per lane" and large-sweep chunking are replaced by one PR per
confirmed pure-routing sweep.

## Scope boundary (No-gos)

- **The identity ref, its transaction, and the schema variants.** The complete-basis ref transaction, the v3
  tagged union including its `groom` and `housekeep-routing` arms, the change-request lifecycle port, and the
  reader's projection of them all ship with `session-locus-model`. This work drives them; it does not define them.
- **The locus record, allocator, and role/lease machinery.** Grooming and housekeeping allocate through the base
  deliverable's shared allocator and mint roles through its record store.
- **A persisted plan artifact.** No canonical plan file, per-entry source digest, or plan-digest generation. The
  durable record of an interrupted sweep is what it already wrote — routed entries on the branch and visible
  markings in the inbox — and a resumed drain re-confirms whatever remains unrouted against the live inbox.
- **Per-lane or chunked routing PRs.** Review lane stays a blast-radius classification, not a packaging boundary.
  Large sweeps use ordered increments and commits on one branch and PR.
- **Cross-machine serialization under partial protection.** Partial mode carries no synchronized identity ref;
  its one-at-a-time guarantee is machine-local primary occupancy and is stated as such.
- **A nested execution model.** No Errand queue artifact, and no third frame.

## Consequences & Risks

**This deliverable is where the origin's scope absorption concentrated.** Neither grooming nor housekeeping traces
to any of the six failures that motivated `session-locus-model`; both were adopted mid-flight because their domain
overlapped. Carving them into their own unit is the correction, and it means this spec records a design that was
never separately scoped or reviewed. Review should treat it as first-pass scope, not as ratified scope
re-presented.

**The base deliverable merges with `groom` and `housekeep` vocabulary no driver produces**, exactly as it does for
the paused Errand states. That is the cost of cutting where the dependency direction cuts; the base spec records
the same boundary from its side.

**Immutability of the member set is a real ergonomic cost.** Discovering mid-pass that a seventh stub belongs in
the set means closing and reopening. Accepted: a set that can grow under another session's disjointness check is
not a claim.

**Documentation is the one carve cost no gate catches.** The `arc-housekeep` and `arc-plan` skills, and
`session-init`'s signal-leaf spine, describe these commands in prose that no test asserts against the live CLI
surface. A green suite proves nothing about them, so the doc pass is deliberate manual work on both sides of the
cut.

## Success Criteria

1. Grooming claims one explicit fixed set of related backlog WUs under one anchor, identity, branch, role, and
   review tail. Disjoint sets proceed; a same-anchor exact-set reopen resumes; any other overlap refuses with the
   conflicting members named.
2. Grooming writes are bounded to the claimed pre-WU planning concern, authorized on exact normalized
   repository-relative paths, so a duplicate or relocated basename under an unrelated subtree is refused.
3. Reuse of `chore/groom-<anchorStub>` waits for exact change-request, claim, and recorded branch-generation
   retirement.
4. A live grooming claim is classified from its record, not its branch shape: it is neither reported as residue
   nor offered as an orphan-branch deletion, and an incomplete identity read suppresses branch cleanup offers.
5. Full-mode housekeeping globally serializes the complete confirmed pure-routing sweep under one identity,
   branch, and PR, and safely reuses repeated sweep names only after exact tail and branch-generation retirement.
   A second drain under a different slug is refused while any live routing identity exists.
6. Partial housekeeping binds to an exact opened base generation and applies the same changed-path policy as full
   close, so an arbitrary direct-base change cannot complete as an accepted pure-routing sweep.
7. The workflow classifies the routing PR's lane at close from the writes the sweep landed, with reviewed winning
   over auto-merge.
8. The sole routing locus closes before execute-now work begins; each concern opens on its own sibling Errand PR
   whose completion or leave offers the next visible execute-bound capture in file order, without creating a third
   frame.
9. Execute-now marking is atomic: an interrupted or abandoned sweep leaves already-marked entries visible as the
   next session's resume trail, abandoning a sibling Errand clears only its own mark, and a malformed marking
   surfaces reconciliation rather than being silently skipped.
10. A fresh installation receives the `arc-housekeep` entry skill, asserted through fresh-init installation plus
    command and workflow reference checks.
11. The `arc-housekeep` and `arc-plan` skills and every reference surface describe only commands the shipped CLI
    provides, verified by deliberate inspection rather than by a passing suite.
12. Package-source and self-hosted workflow copies stay synchronized, and all Tier 1–3 quality gates pass.

## Open items

- **Housekeep and plan open paths** carry remediation inherited from the origin's review — the base-binding and
  path-policy corrections above are built as scope here, not as separate design.
- **Skill and reference trim.** Which command surfaces move with this deliverable versus stay with the base is
  settled by the verb list, but the prose passes on both sides land during the carve and are the one part no gate
  validates.

---
