# Spec (`detailed` · `RFC`): session-locus-model

- **Origin:** `[internal]` — worktree-parallelism dogfooding exposed checkout-identity and recovery failures when
  transient work interrupted a live work-unit session.

- **Purpose:** Give every ARC-managed checkout a durable execution role and every live session a recoverable,
  machine-local locus frame, so transient work can leave and return without repurposing a work-unit worktree or
  relying on harness-summary state.

- **Implementation dependency:** `cli-schema-kernel` and `cli-session-envelope` have landed; this WU consumes the
  kernel's canonical Zod schema/registry vocabulary and the validated session-init envelope contract directly.

- **Decomposed 2026-07-25.** This work unit is the base of a three-deliverable stack. Two scopes it had absorbed
  carved out into their own units, each retaining the implementation built here:
  `errand-transient-lifecycle` (`arc errand leave`, `arc errand materialize`) and `claimed-sweep-verbs` (the
  grooming and housekeeping claim drivers). See § Decomposition boundary for what that leaves reachable.

---

## Introduction / Context

ARC's work model distinguishes Work Units, Errands, grooming, and housekeeping correctly, but its execution-locus
rules still assume one checkout whose branch changes as work changes. That assumption fails under linked worktrees.
A work-unit worktree is the unit's workspace from spawn through teardown; switching it onto a transient branch
relabels a durable workspace, entangles foreign work with the unit's uncommitted state, and makes recovery infer
intent from branch shape.

The failure becomes sharper when one agent session temporarily operates elsewhere. A warm Errand discovered while
working on a WU should preserve the discovery context, execute in an out-of-WU locus, close, and return to the WU.
Today that transition has no durable parent-frame record. If compaction or a process failure lands mid-Errand, the
active Errand can be reconstructed, but the suspended WU's workflow, load set, and task cursor survive only in the
harness summary. The session has two bounded frames, while ARC records only one.

The same missing model affects adjacent operations:

- the primary checkout's availability is inferred from its branch rather than recorded occupancy;
- a sanctioned `chore/groom-*` branch is misclassified as unowned residue;
- raw Errand materialization creates worktrees without ARC ownership provenance;
- husk cleanup can prove that contents are disposable without proving that no live session occupies the directory;
- operators cannot query which checkout a session is actively using when its boot directory and write locus differ.

The design introduces one machine-local record substrate for durable checkout roles and session-scoped leases. It
keeps identity, lifecycle, and machine occupancy in their existing authority domains and joins them at read time.

## Goals

- Make checkout roles durable: the physical primary is the launchpad/transient locus while free, and every
  WU-owned checkout belongs only to its WU until ownership ends.
- Preserve same-session continuity when warm transient work leaves a WU and returns.
- Recover both the active transient frame and its suspended WU parent without relying on a harness summary.
- Make primary occupancy, transient-role identity, session liveness, and role residue deterministic reads.
- Prevent cleanup of any checkout with a conclusively live session lease while preserving all existing teardown
  guards.
- Give humans and tools one lean, read-only, network-free roster over sessions, roles, and checkouts.
- Make Errand, spawn, and work-unit fire sites consume the same locus allocation model, and supply the shared
  allocator the carved grooming, housekeeping, leave, and materialize verbs consume unchanged.
- Preserve cross-platform and harness-agnostic behavior, degrading uncertainty to an explicit prompt tier.

## Non-Goals

- A general session-frame stack. Warm transitions have a maximum depth of two; Errands and grooming never nest.
- A synchronized or project-portable occupancy ledger. Locus state is meaningful only on the machine hosting the
  checkout.
- A new WU lifecycle-state vocabulary. Role and subject values remain forward-compatible with the future state
  model, and lifecycle stage is derived from the subject's meta record.
- Rich status cards, watch panels, TUI behavior, or project-level readiness rendering. This work supplies the
  minimal read verb and typed query consumed by those later surfaces.
- Parallel transient work as the default. Out-of-WU sessions remain serialized through the primary; under full
  protection, spawn is an occupancy or isolation fallback.
- Replacing Errand identity records or WU metas. The new record points to those authorities; it does not duplicate
  them.
- Making age a liveness or deletion signal.
- Adding a storage mode, per-artifact tracking flag, harness-specific configuration axis, or resident service.
- Cross-machine arbitration of simultaneous transient claims. Identity claims are first-writer-wins with explicit
  conflict surfacing; concurrent duplicate opens sit outside ARC's operator scale.
- The verbs that let an Errand's identity outlive its local checkout (`arc errand leave`,
  `arc errand materialize`) — carved to `errand-transient-lifecycle`.
- The grooming and housekeeping claim drivers (`arc plan open|close|abandon`,
  `arc housekeep open|close|abandon|mark-execute`) and their consuming workflow arms — carved to
  `claimed-sweep-verbs`.
- One exact generation capability carried through every locus mutation and revalidated under lock. The three
  abandon drivers bind the caller's selected generation, but a contract obliging every mutator, and the
  failure-injection substrate proving it, belong to `locus-generation-binding`.

## Decomposition boundary

The stack cuts where the code's dependency direction cuts: grooming, housekeeping, leave, and materialize all
depend on the locus core and the v3 identity substrate, and none of that substrate depends back on them. This
deliverable therefore keeps every shared authority — the record store, allocator, reader, identity transaction,
recovery, cleanup, and rename composition — and the base Errand verbs (`open`, `link`, `close`, `promote`,
`check`, `abandon`, `partial-settle`) that exercise them.

**The consequence is deliberate and stated rather than hidden: this deliverable ships state vocabulary that no
verb of its own produces.** The `paused` and `awaiting-merge` Errand states, the `groom` and `housekeep` role and
identity kinds, and the `plan-open` / `housekeep-open` mutation operations are all part of the schema, the state
transform, the reader projection, and the recovery and in-flight-identity handling here, because a reader that
cannot classify a claim it may encounter is not a reader. Their producing drivers land in the two carved units.
Until those merge, an ordinary Errand is `open` or nothing, and no grooming or housekeeping claim exists to
classify.

Pulling those producers back to make the vocabulary reachable was the alternative considered and rejected: it
reassembles the absorbed scope this decomposition exists to separate, and it would place a design that was never
independently scoped or reviewed inside a deliverable whose own review is already the largest in the stack.

## Proposed Design

### D1. Durable execution-locus doctrine

ARC recognizes two durable checkout states:

1. **Primary launchpad** — the physical primary checkout while it is record-free and resting on the configured
   base branch. It may host one bounded Errand, grooming, or housekeeping excursion and returns to base at close.
2. **WU-owned workspace** — any checkout owned by one WU from spawn, materialization, or explicit in-place entry
   until ownership ends. This normally means a linked worktree under full protection. The supported `--here`
   escape hatch deliberately converts the physical primary from launchpad state into a WU-owned workspace; while
   its WU role exists it is occupied, never available as the transient primary, and returns to record-free base
   launchpad state only through guarded WU teardown. No Errand, grooming pass, housekeep drain, or other WU may
   switch or reuse a WU-owned workspace.

Spawn remains the intended full-protection WU placement. In-place entry is an explicit compatibility/operability
escape hatch for unavailable spawning or deliberate single-checkout work, not the default allocation path. The
base-to-WU conversion establishes ownership; it is not permission to displace an already-owned workspace.

New work never repurposes an existing workspace. A warm transient entry raised from a WU allocates a separate
active locus while preserving the originating worktree and session:

- use the primary when it is record-free, clean, and resting on base;
- under full protection, spawn a provisioned transient worktree when the primary is occupied, the operator requests
  isolation, or the parallelize-now path is selected;
- under partial protection, run direct-base transient work only in the free primary. A dirty, off-base, or occupied
  primary refuses with defer/finish guidance; ARC never double-checks out the base or invents a branch to imitate
  the full-protection mechanism;
- surface a directed-command capability advisory on warm entry when the entering process anchor is not a
  recognized directed-command harness — an interactive shell, shared host, unrecognized selector, or unverifiable
  anchor gets a confirm-with-recommendation (cold session suggested), never an identity-keyed refusal. Anchor
  recognition is lease metadata and advisory input only; it carries no permission semantics.

State-touching open and attach commands acquire the entering process anchor from bounded native ancestor evidence
before identity or local allocation mutation. They skip only recognized ARC/npm invocation descendants, select the
durable per-session harness or direct interactive shell process, and record an `unverifiable` anchor (unknown
liveness) when ancestry, command identity, start token, or interactive/controlling-terminal evidence is
unavailable or ambiguous. A short-lived CLI child is never the lease anchor.

The originating agent performs work against the allocated checkout through an explicit working-directory or
absolute-path boundary. The human's terminal and the WU worktree do not move. Every warm open reports the session
home and active locus; every close reports return-to-base or teardown and the restored parent frame.

The allocation verdict combines record state with live Git safety facts. Absence of any primary locus record is
necessary but not sufficient for availability: a dirty primary, a primary not on base, malformed records, or an
ambiguous roster produces a spawn offer or a stop-and-reconcile result, never silent occupation.

Allocation is a proposal until its target linearizes. Primary allocation acquires the record lock derived from the
live primary path, revalidates the final locus state and directed Git guards while holding that exact lock, then
checks out the transient branch when applicable and mints the role/lease generation. Full-mode identity claim or
transition happens before this local critical section; exact-claim rollback happens after releasing it, so identity
remote I/O never runs under a locus lock. Spawned allocation linearizes physical creation through `git worktree add`,
then resolves the new roster entry and takes its record lock before role/lease mutation.

The configured worktree-location template remains the placement authority. For a spawned transient, its `{name}`
input is namespace- and generation-qualified as `locus-<role>-<slug>-<claimId>` instead of reusing a WU name or raw
stable slug. Stable branch names can therefore repeat only after their exact tail retires, while checkout paths do
not alias residue from an older claim generation. A configured template that still resolves to an occupied path
refuses rather than choosing another location silently.

### D2. Per-checkout locus records

Records live under the resolver-backed primary user root:

```text
.arc/user/{identity}/.internal/loci/
├── locus-{path-digest}.json
└── .locks/
    └── locus-{path-digest}.lock
```

The directory is gitignored, excluded from user-notes serialization, and never copied or synchronized between
machines. One JSON file represents one checkout. `path-digest` is the 64-character lowercase hexadecimal SHA-256
digest of the normalized absolute checkout spelling emitted by Git's worktree roster; the JSON `recordId` prefixes
that digest with `sha256:`. The record preserves Git's/caller's checkout spelling for display. Physical same-locus
comparisons use the existing ephemeral `canonicalLocalPath` behavior and never persist its realpath result.

The primary stanza from a successful Git worktree-roster read selects this root from every linked checkout. Locus
mutators do not use the ordinary active-checkout fallback when primary resolution fails: the reader reports
topology as unknown and state-touching operations stop, so one repository cannot acquire split occupancy ledgers.

Schema v1 is an exact-key, versioned record:

```json
{
  "schemaVersion": 1,
  "recordId": "sha256:<64 lowercase hex characters>",
  "checkoutPath": "/absolute/path/as-reported-by-git",
  "role": {
    "kind": "work-unit",
    "subject": { "kind": "work-unit", "key": "session-locus-model", "claimId": null },
    "establishedAt": "2026-07-18T00:00:00.000Z",
    "parentCheckoutPath": null,
    "originEntry": null
  },
  "lease": {
    "leaseId": "<unguessable per-attach token>",
    "sessionHomePath": "/absolute/session/boot/path",
    "anchor": {
      "kind": "process",
      "pid": 12345,
      "startToken": "<platform-stable process creation token>",
      "inspector": "linux-proc",
      "selector": "codex"
    },
    "attachedAt": "2026-07-18T00:00:00.000Z",
    "heartbeatAt": "2026-07-18T00:03:00.000Z"
  }
}
```

Field semantics:

- The worktree topology scanner invokes `git worktree list --porcelain -z` and parses the NUL-delimited protocol
  without line splitting, trimming, or Git's quoted-path presentation. It preserves each decoded `worktree` field
  as the Git-reported checkout spelling, including embedded newlines, before lexical normalization or hashing.
- Checkout spelling normalization is lexical and platform-local: resolve to an absolute path, normalize `.` and
  `..`, remove a non-root trailing separator, convert separators to `/`, and preserve case. Hash the UTF-8 bytes of
  that string. Physical alias detection remains a separate `canonicalLocalPath` comparison.
- `recordId` is exactly `sha256:<path-digest>`. `leaseId` is at least 128 bits from a cryptographically secure
  random source, encoded as lowercase hexadecimal or unpadded base64url. A read verifies that filename digest,
  `recordId`, and the digest recomputed from `checkoutPath` agree. All timestamps are UTC RFC 3339 strings.
- `role.kind` and `role.subject.kind` are non-empty opaque strings. Core readers understand shipped values but
  preserve unknown future values instead of rejecting the record merely because vocabulary evolved. Shipped role
  kinds are `work-unit`, `errand`, `groom`, and `housekeep`; shipped subject kinds additionally include
  `partial-errand`.
- `role.subject.claimId` is always present and nullable. Every identity-backed Errand, groom, and housekeeping
  subject carries the exact immutable v3 `claimId`, including a partial-protection groom. WU, partial-Errand, and
  partial-housekeep subjects require null. A same-key role whose claim differs from the current identity is
  generation conflict/residue, never an idempotent join or adoption.
- Known role/subject pairs are `work-unit/work-unit`, `errand/errand`, `errand/partial-errand`, `groom/groom`,
  `housekeep/errand`, and `housekeep/housekeep`; any other all-known combination is malformed. Claim ID is non-null
  exactly for `errand/errand`, `groom/groom`, and `housekeep/errand`, and null for the other known pairs. The key
  points to the WU slug, full-mode Errand slug, grooming anchor-stub slug, or housekeeping sweep slug.
  A partial-protection Errand has no shared identity record, so `partial-errand` carries its session-local slug as an
  orientation key. A full-protection housekeeping sweep uses one normal Errand identity with
  `purpose: "housekeep-routing"` for its single branch/merge tail, without duplicating identity-record fields in the
  role.
- `parentCheckoutPath` is always present and nullable. A non-null value is legal only on a warm transient role and
  points to the suspended session-home checkout. Maximum parent depth is one. A parent record that itself has a
  non-null parent is invalid and fails closed.
- `originEntry` is an always-present, nullable execution-context field. A partial inbox-origin Errand carries it
  because it has no shared identity record; a description-origin partial Errand, every full Errand (whose origin
  lives in its exact v3 identity), and WU, groom, and housekeep roles require null. `originEntrySourceDigest` is
  present exactly when that partial role's `originEntry` is non-null. The paired title and normalized digest retain
  the exact adopted capture generation for later settlement; neither field grants identity or branch authority.
- `lease` is nullable. A durable WU role with `lease: null` is an idle checkout between sessions. A transient role
  with no live lease is crash-or-walk-away residue requiring resume-and-ship or abandon.
- `anchor` is a tagged union. The shown `process` variant requires a positive PID and non-empty creation token.
  Shipped inspectors are `linux-proc`, `bsd-ps`, and `windows-cim`; shipped selectors are `codex`, `claude`,
  `gemini`, and `interactive-shell`. Both fields are opaque non-empty strings for forward compatibility, but an
  unknown inspector yields `unknown` liveness until code supports it. The alternative is
  `{ "kind": "unverifiable", "reason": "<bounded diagnostic>" }`; its liveness is always `unknown`.
- `sessionHomePath` names the logical home of the current frame: normally the checkout where the session booted and
  will return. Exact Errand promotion is the one re-root edge—it releases the former warm parent lease and attaches
  the promoted WU with its own checkout as the new session home. The active locus is the record's `checkoutPath`; it
  is derived, not duplicated.
- Workflow, stage, session type, task cursor, and load set are not stored. Readers derive them from `role.kind`,
  `role.subject`, the subject identity kind/purpose, the subject meta record, and the existing cursor/load-set
  resolvers.

The primary's free-at-base state is represented by absence of any primary locus record. The roster still renders
the physical primary as a derived `free` row. A transient or in-place WU role makes it occupied; there is no
permanent primary-role file whose stale content could falsely mark the launchpad occupied.

### D3. Record mutation and concurrency discipline

The record store is per-locus rather than one shared index. It uses three mutation rules:

1. **Mint** resolves the checkout through Git's roster, derives its record ID, and exclusively creates the file.
   Existing same-role content is idempotent; an incompatible existing record refuses.
2. **Attach, heartbeat, release, and role updates** take the record-scoped lock, reread the record, validate the
   expected `leaseId` or role state, and replace the JSON with same-directory temp-file-plus-rename. A stale writer
   cannot release or overwrite a newer lease.
3. **Pop** takes the same lock and deletes only the expected role/lease generation. It refuses on a mismatched live
   lease, unknown liveness, malformed content, or a newer role.

The lock is local to one record and uses exclusive creation plus token-verified release. Its bounded JSON content
identifies the lock token and the command process anchor. Acquisition retries for a bounded interval. A live or
unknown holder refuses. A conclusively dead holder enters the same token-safe stale-break discipline as the notes
lock: acquire a secondary record-scoped break lock, reread the main holder while holding it, and unlink only when
the token and anchor are unchanged; a competing change aborts the break. No repository-wide or identity-wide locus
lock exists, and no remote I/O occurs while a locus lock is held. Reads never lock: atomic replacement guarantees
either the previous or next valid record.

If two persisted path spellings resolve to the same physical checkout, the reader reports duplicate-locus
ambiguity. Mutators refuse until a state-touching reconciliation resolves it; destructive consumers never choose a
winner from aliases.

### D4. Role and lease lifecycle

Role creation and removal bind to the operations that establish or end a checkout's purpose:

| Operation                               | Role action                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| WU spawn / materialize / in-place entry | Mint durable WU role; attach an entering lease only when the invoking session continues there.    |
| WU session-init                         | Adopt/backfill the WU role if needed; attach only a durable entering anchor, otherwise stay idle. |
| WU handoff                              | Release only the matching lease; retain the durable role.                                         |
| WU teardown                             | Linearize final lease validation and role pop with linked removal or in-place base restoration.   |
| Errand open / resume                    | Mint `errand` role in the allocated checkout; link the entering WU parent when warm.              |
| Errand complete                         | Full mode retires identity after merge; partial mode pops occupancy after the base commit.        |
| Errand abandon                          | Retire the exact claim, return or tear down the locus, and pop the expected role generation.      |
| Errand promote                          | Replace the exact transient generation with a WU role/marker and make it the session home.        |

Four further bindings are specified by this model but driven by the carved deliverables, and are listed so the
role vocabulary is complete rather than because a verb here performs them: **Errand leave** and **Errand
materialize** (`errand-transient-lifecycle`), and **Grooming open/close** and **Housekeep entry/close**
(`claimed-sweep-verbs`). Each mints or pops its role through the same store, allocator, and expected-generation
discipline as the rows above; none introduces a new role action shape.

A WU role follows physical checkout ownership, not branch or lifecycle presentation. Activation, deactivation,
integration, reopening, and archival leave the same role generation untouched while the checkout remains. Spawn,
resume, materialize, and explicit in-place entry mint the role for a newly owned checkout. Park or post-transition
teardown pops it only while the ownership-ending operation linearizes under the target record lock: linked WU
worktrees physically remove, while an in-place primary WU proves the exact branch/cleanliness state and restores the
configured base without removing the checkout. Archive itself therefore retains the role until post-merge teardown
ends ownership.

Session entry backfills a recordless linked WU only from its ARC marker plus matching meta. For the markerless
in-place escape hatch, it backfills only when the physical primary's current branch and the uniquely resolved active
WU meta name one another exactly; an arbitrary off-base primary branch remains unsafe rather than gaining WU
authority by branch shape alone.

A warm transition leaves the WU record untouched and creates a child transient record with
`parentCheckoutPath`. Both leases may carry the same process anchor. The read graph therefore identifies the WU
frame as suspended and the child as active without mutating the durable parent. Closing the child removes that
edge, making the WU frame active again.

Identity-backed role creation copies the current v3 identity's exact `claimId` into the role subject. Reader joins,
adoption, updates, pop, and cleanup require kind, key, and claim generation to agree. Residue from an earlier use of
the same slug or stable branch name therefore cannot attach to, refresh, or authorize removal for a newer claim.

ARC-created transient worktrees carry the same generation boundary in their ownership marker. New marker subjects
are `{ kind: "errand" | "groom" | "housekeep", slug, claimId }`; WU and legacy branch subjects retain their existing
shape. A transient marker additionally carries `provisioning: "pending" | "ready"`. `pending` is written immediately
after the checkout appears in Git's live roster and before fallible post-create or harness-directory setup; readers
render it as recoverable incomplete provisioning and never adopt it. `ready` means environment setup completed and
permits an exact-identity missing-role adoption. Existing claimless transient markers remain readable diagnostics
but grant neither adoption nor cleanup authority. A primary transient role has no ownership marker because ARC did
not create the primary checkout.

Session leases are verb-scoped, not session-scoped. Transient operation verbs, explicit `arc locus attach`, and
mutation revalidation create and carry them; ordinary WU session entry does not mint one, and a durable WU role
with `lease: null` while a session works in its checkout is the normal mainline state, never residue. The lease's
consumers are the transient frame graph, cleanup's occupancy veto, and residue classification — none of which a
plain WU resume requires. Spawn-for-handoff therefore mints the WU role with no lease — the spawning session does
not continue in the new checkout; in-place entry and promotion, where the session does continue, attach one when
entry resolves a durable process anchor. An explicit WU attachment whose entering anchor is unverifiable adopts or
retains the durable role without a lease; it clears an exact conclusively dead WU lease first, while live or unknown
existing occupancy still refuses. This degradation preserves entry without creating an ownership token that no
later operation could verify or release.

Lease attach is single-session: a null WU lease accepts a new token; the same token/anchor is idempotent; a
different conclusively live anchor refuses as occupied; and unknown liveness stops for reconciliation. A dead WU
lease may be replaced by the next attaching operation with a fresh token. A dead transient lease is not silently
replaced: the caller must choose resume-and-ship or abandon, after which the chosen operation attaches or pops
explicitly.

Transient roles are session-bounded; transient identity may outlive one local occupancy. A full-protection Errand
may become `paused` only after its exact WIP head is committed and pushed, or `awaiting-merge` after its exact change
request is recorded. The departure verb that persists either state, returns the primary to base or tears down the
spawned checkout, and pops the role is `errand-transient-lifecycle`'s; the state vocabulary, its transform arms,
and the resume path that consumes them are specified and shipped here. Pause is operational re-entry for the same
atomic concern, with no task list, session notes, or planned cross-session decomposition; a concern that needs a
durable plan promotes to a WU instead. A remaining unleased transient role is therefore still genuine
crash/walk-away residue rather than a normal pause/review wait.

**No transient role ever parents another.** A sweep that wants to hand work to an Errand must pop its own role
first, so the successor is a sibling transient frame whose parent is the original WU session home, or null for a
between-WUs session. This is what bounds the graph: maximum persisted depth remains two, and every consumer —
reader, recovery, compaction — may rely on seeing one child or none. The sweep drivers that honor this rule ship
with `claimed-sweep-verbs`; the constraint is the model's.

State-touching transient commands refresh `heartbeatAt` only when their resolved durable process anchor matches
the record lease; explicit `arc locus attach` timestamps the lease it creates or reuses. Directed commands refresh
the target checkout's record, not the caller's current directory. Ordinary WU session work, read verbs, probes
without a write flag, and status rendering never refresh, reconcile, or reap records.

Lease release is a handoff operation. Abrupt process exit leaves a dead-anchor lease that session entry may replace;
this WU adds no harness-session-end hook or release asset because correctness cannot depend on delivery after the
process anchor exits.

### D5. Cross-platform process anchors and liveness

The process anchor prevents PID reuse from making an old lease look live. Every supported inspector exposes one
common result:

```text
inspect(pid) → present { pid, parentPid, startToken, commandIdentity }
             | absent
             | unverifiable { reason }
```

Production adapters use native machine-local sources:

- **Linux:** `/proc/{pid}/stat` supplies parent PID and kernel start-time ticks; `/proc/{pid}/exe` or `comm`
  supplies command identity.
- **macOS / BSD:** `ps` supplies parent PID, command identity, and the exact process start string used as an opaque
  comparison token.
- **Windows:** PowerShell/CIM `Win32_Process` supplies `ParentProcessId`, executable identity, and `CreationDate`.

Entry acquisition walks a bounded, cycle-checked ancestor chain from the invoking ARC process and captures the
selector's complete evidence through argument-array native calls. The walk returns one ordered snapshot or an
unverifiable reason; a missing parent, permission boundary, malformed record, ambiguous wrapper identity, or
unsupported facility resolves to an `unverifiable` anchor rather than truncating the chain into a guess; each
consumer then applies its operation-specific authority policy without guessing liveness. Production transient open
and lease-required attach drivers derive this anchor once and carry it through allocation and lease provisioning.
WU entry is the bounded exception: because its durable role is sufficient session authority, an unverifiable
selection remains evidence that no lease may attach, while a separately process-verifiable session or command anchor
holds its short-lived mutation lock.

Missing platform facilities, permission failures, malformed output, unsupported operating systems, and legacy
records return `unverifiable`; they never guess dead.

Anchor selection walks upward from the ARC command and skips only the known invocation wrapper chain. The selected
process must bound exactly one interactive agent session; a shared daemon or application host is not a valid
anchor. Shipped harness adapters identify a per-session Codex, Claude Code, or Gemini process by
executable/environment evidence. Direct interactive invocation may anchor to the controlling shell. A
non-interactive, unrecognized caller—or a harness exposing only a shared host—records an unverifiable lease when the
operation requires one rather than anchoring to the wrong process; a WU entry that can safely remain leaseless does
so instead.

Verification compares both PID and `startToken` and returns exactly four states:

- **self** — the recorded anchor is the anchor the running process would select right now (same inspector kind, PID,
  and creation token). A refinement of `live`, not a peer of it: the holder is the caller;
- **live** — the anchored PID exists with the same creation token and is not the caller's own;
- **dead** — the PID is absent or exists with a different creation token;
- **unknown** — the inspector cannot prove any of the above.

`self` is strictly stronger evidence than `dead` for authorizing a recovery action, because the process asserting it
is the one whose exit every other exit is waiting on. It is evidence about **authority**, never about occupancy: the
process still holds live shell state and full write capability in that checkout, so `self` never suppresses an
occupancy guard and never licenses a general override. D6 states what it authorizes.

Occupancy identity and conversation identity are orthogonal and diverge in both directions — compaction is the same
process and the same conversation, a conversation reset is the same process and a new conversation, and a resumed
session is a new process already treated as a new session. Verification tracks the process, and no path detects a
conversation reset; the vocabulary above is what makes detecting one unnecessary.

Heartbeat age is rendered as context only. It never changes a self/live/unknown result and never grants cleanup.

### D6. Read-time join, reconciliation, and `arc locus`

One public reader surrounds a pure projection core and is assembled as a fixed pipeline:

1. acquire one topology/root snapshot plus locus records, record-lock state, ARC worktree ownership markers, WU
   metas, the complete identity tree, and process-inspector liveness results through bounded, network-free ports;
2. project provisional rows by joining role subjects to exact WU or v3 identity authority and deriving session type,
   task cursor, cohort context, and load set through the existing resolvers;
3. enrich those rows with frames, current state, primary availability, recovery, and reconciliation; and
4. validate and emit the final `LocusEnvelopeV1` / `LocusStateV1` values.

No earlier pipeline value is a public roster. `arc locus`, session-init, recovery, and later mutation revalidation
all call the same final reader rather than composing evidence or frame state independently.

The new public command is:

```text
arc locus [--json]
```

`arc locus` is singular because it queries the locus model, while its output is a machine roster. It is preferable
to `arc sessions` because durable WU roles exist without live sessions, and preferable to another `arc status`
flag because status/HUD rendering is a separate consumer over this lean record query.

The command is zero-input, read-only, network-free, and plain-stdout safe. Human output includes checkout path,
role/subject, lease state, session home, active locus, and derived workflow/stage where available. JSON output is a
schema-registered versionless envelope that additionally carries derived session type, task cursor, load set,
record/roster mismatch, and residue classifications for session-init and recovery consumers.

Implementation builds on the landed `cli-schema-kernel`. These schemas are authored Zod-first against
`src/lib/kernel/`'s vocabulary and registered through a locus registry composed from `createKernelRegistry()` (the
pattern `createSessionEnvelopeRegistry()` established), each entry carrying the kernel's
`{ id, version, migrationPosture }` metadata. The Zod values are the sole type authority; TypeScript types use
`z.infer`, emit paths use `parse`, and untrusted record, identity, and other consume paths use `safeParse`
(`zod@4`). No parallel hand-written types, runtime codecs, or JSON schemas ship. The block below is normative
TypeScript-shaped notation for the inferred semantic surface, not a second implementation declaration;
`TaskListCursorFileResult` and `LoadSetManifest` are imported from the landed `cli-session-envelope` registered
roots (`task-list-cursor-file-result` / `load-set-manifest`), not redefined here. Registration makes each schema
discoverable for `schema-introspection-layer`, but appearing in the shipped `schemas/kernel.json` bundle needs
separate build-projection wiring — a downstream seam this WU neither depends on nor drives, and it adds no
`arc schema`:

```typescript
type LocusRowKind =
  | "free-primary" | "managed-role" | "identity-only" | "unmanaged-checkout"
  | "stale-record" | "malformed-record" | "duplicate-locus";

type LocusDiagnosticCode =
  | "record-without-checkout" | "worktree-without-role" | "subject-unresolved"
  | "unsupported-version" | "duplicate-locus" | "marker-missing"
  | "lease-dead" | "lease-unknown" | "lock-dead" | "lock-unknown"
  | "cross-identity" | "record-malformed" | "identity-malformed"
  | "lock-without-record" | "path-unavailable";

interface LocusDiagnosticV1 {
  code: LocusDiagnosticCode;
  source: {
    kind: "checkout" | "record" | "identity" | "lock";
    key: string;
  };
  message: string;
}

interface LocusChangeRequestV1 {
  repositoryRef: string;
  hostRef: string;
  baseRef: string;
  headRef: string;
  headSha: string;
}

type LocusIdentityV1 =
  | ({
      kind: "errand";
      key: string;
      claimId: string;
      protection: "full";
      branch: string;
      purpose: "errand";
    } & (
      | { origin: "description"; originEntry: null }
      | { origin: "inbox"; originEntry: string; originEntrySourceDigest: string }
    ) & (
      | { state: "open"; savedHead: null; changeRequest: null }
      | { state: "paused"; savedHead: string; changeRequest: null }
      | { state: "awaiting-merge"; savedHead: null; changeRequest: LocusChangeRequestV1 }
    ))
  | ({
      kind: "errand";
      key: string;
      claimId: string;
      protection: "full";
      branch: string;
      purpose: "housekeep-routing";
    } & (
      | { state: "open"; savedHead: null; changeRequest: null }
      | { state: "awaiting-merge"; savedHead: null; changeRequest: LocusChangeRequestV1 }
    ))
  | ({
      kind: "groom";
      key: string;
      claimId: string;
      purpose: null;
      anchorStub: string;
      members: string[];
      openedBaseHead: string;
    } & (
      | {
          protection: "full";
          branch: string;
          state: "open";
          savedHead: null;
          changeRequest: null;
        }
      | {
          protection: "full";
          branch: string;
          state: "awaiting-merge";
          savedHead: null;
          changeRequest: LocusChangeRequestV1;
        }
      | {
          protection: "partial";
          branch: null;
          state: "open";
          savedHead: null;
          changeRequest: null;
        }
    ));

interface LocusRowV1 {
  kind: LocusRowKind;
  checkoutPath: string | null;
  primary: boolean | null;
  recordId: string | null;
  role: null | {
    kind: string;
    subject: { kind: string; key: string; claimId: string | null };
    parentCheckoutPath: string | null;
    originEntry: string | null;
    originEntrySourceDigest?: string;
  };
  identity: LocusIdentityV1 | null;
  lease: null | {
    leaseId: string;
    state: "live" | "dead" | "unknown";
    sessionHomePath: string;
    attachedAt: string;
    heartbeatAt: string;
  };
  frame: "active" | "suspended" | "idle" | "residue" | null;
  derived: null | {
    workflow: string | null;
    stage: string | null;
    sessionType: string | null;
    taskCursor: TaskListCursorFileResult | null;
    loadSet: LoadSetManifest | null;
  };
  diagnostics: LocusDiagnosticV1[];
}

type LocusEnvelopeV1 =
  | {
      mode: "locus";
      ok: true;
      primaryPath: string;
      rows: LocusRowV1[];
      diagnostics: LocusDiagnosticV1[];
    }
  | {
      mode: "locus";
      ok: false;
      error: {
        code:
          | "identity-missing"
          | "identity-root-unavailable"
          | "git-topology-unavailable"
          | "record-root-unavailable";
        message: string;
      };
    };
```

Version fields sit only where a reader meets version skew. The persisted locus record (D2) carries `schemaVersion`,
and a reader that meets an unsupported one surfaces `unsupported-version` at the record parse boundary; the
compaction seed (D9) is likewise versioned, with a mismatch failing closed as `cli-session-envelope`'s `seed-invalid`
recovery stop. The freshly-computed, immediately-consumed surfaces — the `arc locus` envelope, the `LocusStateV1`
slot, and every mutation result — carry no wire version field; their schema version lives in the registry entry,
matching `cli-session-envelope`'s versionless-envelope convention.

The identity projection preserves the v3 discriminants and immutable `claimId`: Errands are always `full`, have
non-null `purpose` and `branch`, and carry `savedHead` only while paused. Ordinary Errands preserve their origin
entry. Grooms have `purpose` null, preserve the anchor and canonical member set, carry the
protection/branch pairing defined in D8, and never carry `savedHead`.
`changeRequest` is non-null exactly for an awaiting-merge identity. An identity joined to its local role appears
only on that managed row after role-subject kind, key, and `claimId` all match; a valid identity without a locus has
`kind: "identity-only"`, `recordId`, `role`, and `lease` null, and `frame: "idle"`.

Malformed or inconsistent rows do not fail the whole read when topology, the record root, and the complete identity
tree are available; they appear as rows and bounded source-keyed diagnostics so operators can identify the exact
checkout spelling, record ID, identity tree key, or lock key at issue. A diagnostic carries no authority, and stored
diagnostic text is never executed or used as a path. Missing `arc.identity`, topology failure, an unreadable record
root, or an incomplete identity-tree read returns the error arm because the reader cannot prove that identity-only
tails or transient authority are absent. A proven-absent identity ref and never-created `loci/` or `.locks/`
directory are complete empty snapshots, not root errors. Human mode writes only display text; JSON mode writes
exactly one envelope to stdout. A successful envelope exits zero even when it contains row diagnostics; a root
failure exits one.

Paused Errand and awaiting-merge Errand/groom records render as `identity-only` rows. An `open` identity also renders
that way when allocation failed and its exact-claim rollback could not complete, or while claim creation has
linearized before local role minting. Active partial Errands render as ordinary managed-role rows with
`identity: null`. These are valid states, not record/roster mismatches.

Success output is deterministic regardless of filesystem or Git enumeration order: checkout-backed rows sort by
normalized checkout spelling in UTF-8 byte order; identity-only rows follow sorted by identity kind/key; diagnostics
are de-duplicated and sort by code, source kind, then raw UTF-8 source key; in-flight identities sort by identity
kind/key; reconciliation actions sort by kind, checkout path, then record ID; and every advertised action list
filters the fixed resume → wait → finalize → abandon order. A non-missing physical-path canonicalization failure
produces `path-unavailable` evidence and never fabricates alias equality or absence.

Session init, recovery, and handoff each compute the locus reader once and carry the same required
`locusState: Probe<LocusStateV1>` projection. The strict `SessionInitProbeResultSchema` and
`SessionRecoverProbeResultSchema` roots declare that slot; the existing typed handoff producer carries it without
introducing a second value shape. Its success arm is `{ ok: true, value: LocusStateV1 }`; its error arm is
`{ ok: false, error: { kind, message } }`, where `kind` is `"identity-missing" | "runtime"`. Missing identity is
projected without invoking the reader, while record-root, identity-tree, or Git-topology failure becomes `runtime`.
This RFC owns the value schema below, not a parallel serialization wrapper; a successful slot has these exact
verdicts:

```typescript
interface LocusStateV1 {
  roster: Extract<LocusEnvelopeV1, { ok: true }>;
  current:
    | { kind: "none" }
    | {
        kind: "resolved";
        sessionHomeRecordId: string | null;
        activeRecordId: string;
        parentRecordId: string | null;
      }
    | { kind: "ambiguous"; recordIds: string[]; reasons: LocusStopReason[] };
  primaryAvailability:
    | { kind: "free"; checkoutPath: string }
    | {
        kind: "occupied";
        checkoutPath: string;
        recordId: string;
        leaseState: "absent" | "live" | "dead" | "unknown";
      }
    | { kind: "unsafe"; checkoutPath: string; reasons: LocusStopReason[] };
  inFlightIdentities: {
    identity: LocusIdentityV1;
    actions: ("resume" | "wait" | "finalize" | "abandon")[];
  }[];
  recovery:
    | { kind: "none" }
    | { kind: "resume"; activeRecordId: string; parentRecordId: string | null }
    | { kind: "residue"; recordId: string; actions: ("resume" | "abandon")[] }
    | { kind: "stop"; reasons: LocusStopReason[] };
  reconciliation:
    | { kind: "clean" }
    | { kind: "apply"; actions: LocusReconcileAction[] }
    | { kind: "stop"; reasons: LocusStopReason[] };
}

type LocusStopReason =
  | "primary-dirty" | "primary-off-base" | "lease-live" | "lease-unknown"
  | "lock-live" | "lock-unknown"
  | "role-conflict" | "record-malformed" | "unsupported-version"
  | "identity-malformed" | "path-unavailable"
  | "duplicate-locus" | "cross-identity" | "marker-missing" | "subject-unresolved";

type LocusReconcileAction = {
  kind: "adopt-work-unit" | "adopt-transient" | "reap-stale-record" | "break-dead-lock";
  checkoutPath: string | null;
  recordId: string | null;
};
```

Frame derivation uses one exact matrix. A conclusively live role is `active` unless a conclusively live child names
it through the one legal parent edge, in which case the parent is `suspended` and the child is `active`. A WU role
with `lease: null` and a valid identity-only tail are `idle` — for a WU checkout the normal state between and
during ordinary sessions, since leases are verb-scoped (D4), never a finding. A WU role whose lease is conclusively
dead likewise reads `idle`, carrying a `lease-dead` diagnostic — the durable role, not the lease, holds WU
ownership, and the next attaching operation reaps the stale lease. Any other managed role whose lease is absent,
dead, or unknown is `residue`; attach may replace a conclusively dead WU lease, but unknown liveness always stops
automatic replacement and routes to the authority rule below.

A self-held live lease is the **ordinary** state of a running transient session, not residue — an Errand, grooming
pass, or housekeeping sweep holds exactly that for its whole life, and current-state selection below claims it as
the active frame. It becomes residue-eligible only in conjunction: self-held **and** unable to become the current
frame, which is the stranded shape — the role survives while its subject no longer resolves, so nothing can claim
it and, under deadness-keyed exits, nothing could release it either. Self-identification alone never demotes a
frame.

**Recovery actions key on authority over the lease, not on deadness.** Deadness is one proof of authority, not the
only one, and treating it as the only one leaves two safe states with no exit at all. The rule is:

- **dead or absent** — anyone may resolve. Automatic, unchanged.
- **self** — the holder may resolve, gated on operator confirmation, and scoped to an unresolved subject or an
  explicit abandon. Never a general force, never agent-asserted.
- **unknown** — the same operator-confirmed path is reachable, and the stop that reports it names it. The operator
  can observe their own machine where the inspector cannot; this is the evidence asymmetry the confirmation exists
  to close, and it is the same idiom as awaiting-merge resume accepting operator-confirmed host truth.
- **live and foreign** — stop. No confirmation path. The code holds positive evidence of another session that the
  operator's context does not contradict, and overriding it would open a genuine concurrent-occupancy hole.

Confirmation authorizes acting on the **lease**; it never relaxes an occupancy, cleanliness, provenance, exact-head,
or generation guard, and no recovery state is ever resolved by hand-editing the record store.
Malformed, unmanaged, duplicate, and unresolved rows have `frame: null`. Current-state selection follows D9: among
live leases matching the entering anchor **whose authority is established**, prefer the transient role, resolve its
optional parent, otherwise take the matching WU; multiple plausible children or parents are ambiguous.

**A frame no operation can enter is not a frame.** Selection reads the same trust predicate attach does, rather
than liveness and anchor alone. A row carrying authority-fatal evidence — an unresolved subject, a missing
ownership marker — would otherwise be claimed as `current` and then refused by every operation that tried to act
on it, which is the deadlock in its general form; the self-held instance is only where it was first observed. The
rule also keeps the three verdicts consistent by construction: selection, the recovery verdict, and the frame all
read trust, so no consumer can be handed a `current` that the recovery verdict has already routed to residue.
Trust is not a lease property, so an untrusted row is excluded whatever its liveness says.

Primary availability is likewise exact. A record-free, clean primary on the configured base is `free`. A valid
transient role or exact in-place WU role is `occupied`, including `leaseState: "absent"` for crash/walk-away
residue. An unexpected role/branch pairing, relevant live/unknown lock, malformed target record, unresolved physical
path, or duplicate alias is `unsafe`. Unrelated unmanaged linked worktrees remain visible diagnostics and do not by
themselves make the primary unsafe or stop reconciliation.

Availability and recovery answer different questions and never substitute for each other. `recovery` reports only
whether a frame resumes or a residual role must be resolved; an `unsafe` primary is an allocation fact, carried by
`primaryAvailability` and read by the verbs that allocate. A record-free primary parked off base — the steady state
whenever an Errand is in flight — therefore leaves ordinary session entry, handoff, and recovery unblocked, and
never masks a residual transient behind an allocation stop.

`inFlightIdentities.actions` lists state-appropriate next operations, not authorization to perform them: `open`
and `paused` offer resume/abandon, while `awaiting-merge` advertises wait/finalize/abandon/resume as possible. The
network-free reader does not query host state; each selected mutation revalidates its local, ref, remote, and
change-request predicates, and permits awaiting-merge resume once the recorded change request is verified still
open at its stored head.

Allocation runs only inside state-touching verbs, after protection mode and the requested operation are known. All
such verbs return the exact shared result shape below; there are no undisclosed command-specific JSON fields:

```typescript
type LocusOperation =
  | "locus-attach" | "locus-release" | "locus-resolve"
  | "errand-open" | "errand-link" | "errand-leave" | "errand-close" | "errand-abandon"
  | "errand-materialize" | "errand-promote"
  | "plan-open" | "plan-close" | "plan-abandon"
  | "housekeep-open" | "housekeep-close" | "housekeep-abandon";

type LocusMutationResultV1 =
  | {
      outcome: "applied" | "idempotent";
      operation: LocusOperation;
      allocation: null | { kind: "primary" | "spawned"; checkoutPath: string };
      recordId: string | null;
      leaseId: string | null;
      activeLocusPath: string | null;
      sessionHomePath: string | null;
      identity: LocusIdentityV1 | null;
      originEntry: string | null;
      restoredParent: null | { recordId: string; checkoutPath: string };
      nextOffer: null | {
        kind: "errand";
        key: string;
        parentCheckoutPath: string | null;
      };
      recommendedPromptText: string;
    }
  | {
      outcome: "refused";
      operation: LocusOperation;
      reason:
        | "primary-occupied" | "primary-dirty" | "primary-off-base"
        | "topology-unknown" | "record-malformed" | "duplicate-locus"
        | "checkout-missing" | "lease-live" | "lease-unknown"
        | "lease-generation-mismatch" | "role-conflict"
        | "full-protection-required"
        | "remote-unreachable" | "identity-conflict" | "change-request-open"
        | "change-request-unverifiable"
        | "partial-handoff-forbidden" | "preservation-unproven"
        | "inbox-link-conflict" | "work-unit-name-taken" | "promotion-source-invalid"
        | "stub-ambiguous";
      recommendedPromptText: string;
    }
  | {
      outcome: "error";
      operation: LocusOperation;
      error: { code: LocusErrorCode; message: string };
      recommendedPromptText: string;
    };
```

Mutation `--json` writes exactly one result on every path. `applied`/`idempotent` exit zero; `refused`/`error` exit
one. Human rendering uses the same `recommendedPromptText`, so workflows dispatch on `outcome`, then `reason` or
`error.code`, and never reconstruct safety logic or narration. Expected safety denials remain `refused`; unexpected
parse, topology, persistence, locking, or mutation-boundary failures retain the locally exhaustive `LocusErrorCode`
in the `error` arm. Open/resume success makes allocation, record/lease IDs, active locus, and session home non-null.
Leave/close may instead populate `identity`, `originEntry`, `restoredParent`, and
`nextOffer`; promotion returns the originating capture until its WU meta commit makes removal safe. Fields
irrelevant to the completed operation are null. Repeating an already-applied mutation with its exact expected
generation is `idempotent`; a different lease token or generation is `refused` with
`lease-generation-mismatch`.

The reader reports, but never repairs:

- stale record with no backing checkout;
- WU worktree with marker/meta but no role;
- transient worktree with marker/identity record but no role;
- malformed, unsupported-version, or duplicate-locus records;
- a role whose authority-domain subject no longer resolves;
- transient role with a dead or unknown lease;
- unmanaged/legacy markerless checkout.

State-touching entry points run a separate reconciliation plan derived from the same reader:

- recordless ARC-marked WU worktree adopts from its meta;
- recordless ARC-marked transient worktree adopts from its Errand/groom identity record;
- recordless primary resting cleanly on base remains free by design;
- stale records with no checkout are reaped only when the lease is conclusively dead and no duplicate ambiguity
  exists;
- a token-stable conclusively dead record lock is breakable through the secondary-lock protocol, while live or
  unknown holders stop reconciliation;
- malformed, live, unknown, cross-identity, or unverified markerless cases remain prompt/manual; the sole markerless
  adoption is D2's exact physical-primary branch ↔ uniquely resolved active-WU-meta match.

The public reconciliation actions are deterministic summaries, not mutation capabilities. The in-process plan
pairs an applicable record action with the exact record bytes/generation observed by the reader, or a lock action
with the exact holder token/anchor. The driver reruns the final reader before acquiring the target record lock. Once
it owns that lock, it rechecks only the proof-bearing record, marker, roster, and authority inputs through an
owned-lock mutation seam; it does not rerun the public reader and misclassify its own live lock as contention. WU
adopt and stale-record reap linearize under the target record lock and recheck the exact record generation. A dead
main lock is never acquired in order to break itself: its removal uses D3's secondary-break protocol and proceeds
only while the holder token/anchor remains unchanged. Unrelated unmanaged worktrees stay diagnostic-only; uncertain
evidence stops a plan when it affects the current, primary, or selected subject or prevents safe alias resolution.

Session-init consumes the typed current, primary-availability, in-flight-identity, recovery, and reconciliation
surfaces above. Workflows dispatch on those verdicts; they do not reimplement record, Git, or liveness comparisons
in prose.

### D7. Warm-entry allocation and transient workflows

A shared allocator backs the existing operation verbs instead of adding workflow-level Git mechanics:

- under full protection, `arc errand open <slug>` allocates the free primary or a spawned transient worktree and
  mints/updates the shared Errand identity; under partial protection it occupies only the free primary, creates no
  branch or shared identity, and retains the direct-base commit path. An inbox-origin open records the inspected
  entry title and normalized source digest in the v3 identity or partial role, and resume requires that exact
  generation. Before either mode mutates identity or occupancy, the driver acquires and selects the entering
  process anchor defined by D5; the selected anchor is the single lease input carried through allocation,
  provisioning, and the shared result;
- `arc errand link <slug>` remains the late inbox-adoption edge, but mutates only an exact ordinary v3 claim through
  the complete-basis transaction. It never rewrites legacy identity, changes an existing different origin or
  capture generation, or treats a missing/incomplete inbox read as a linkable capture;
- `arc errand close <slug>` remains completion and may run later from base context. The departure verb that closes
  a local locus without retiring identity (`arc errand leave`) is `errand-transient-lifecycle`'s;
- new `arc errand abandon <slug>` retires an ordinary Errand's identity-only open, paused, or awaiting-merge
  claim. It requires explicit selection and the same clean/provenance/ref-preservation checks as residue
  abandonment. Awaiting-merge abandonment additionally requires exact host truth that the stored change request is
  closed-unmerged; merged routes to finalization, while open or unverifiable refuses. Abandon is close's
  counterpart and the sole driver behind `arc locus resolve --action abandon`, so it stays here rather than
  travelling with the departure verbs;
- `arc errand promote <slug>` remains the explicit wrapper-floor crossing and becomes a locus-aware subject driver.
  It requires the exact live ordinary v3 claim, committed branch head, role, lease, and checkout generation. It
  renames the branch and mints the WU meta recoverably, converts a spawned transient marker plus the target role to
  WU authority under owned-lock revalidation, and makes that checkout the new session home. For a warm promotion it
  releases the former parent WU lease so two active WU roots never survive the frame replacement; the former WU role
  remains idle. Errand identity retires last, and an originating inbox capture remains until the workflow commits
  the WU meta. The standalone `arc errand retire` command disappears because retirement has no independently safe
  v3 transition;
- `arc start`, `arc materialize`, and worktree lifecycle mutators mint WU roles beside ownership markers.

The grooming and housekeeping claim verbs, and full-protection `arc errand materialize`, allocate through this
same allocator but ship with `claimed-sweep-verbs` and `errand-transient-lifecycle` respectively. Session-init's
raw `git worktree add` materialization path is retired by the latter; until then it remains the only way to bring
a remote-only Errand onto a machine.

Linked-worktree implementation has explicit layers. `createLinkedWorktree()` is the target-agnostic Git creation
primitive: it resolves configured placement, performs one `git worktree add`, and returns a proof-bearing creation
receipt. The existing WU-specific spawn/in-place/teardown mutator is named `reconcileWorkUnitWorktree()` and composes
that primitive with WU marker and lifecycle behavior. `provisionTransientLocus()` owns transient composition and
never routes a transient subject through the WU wrapper.

Transient provisioning is a recoverable staged transaction rather than a claim of cross-system atomicity. For a
spawn, the composer creates the checkout, verifies its roster entry, writes the exact pending marker, runs configured
post-create and registered harness-directory setup outside any locus lock, promotes the unchanged marker to ready,
then locks and revalidates the target before minting role and lease. For primary use it writes no marker and performs
the final Git/role/lease sequence under the primary record lock. A proof-bearing receipt records whether the branch
and worktree were newly created plus the marker bytes, record generation, and lease token. Rollback removes only
unchanged state created by that invocation; otherwise the command preserves evidence and returns an identity-only,
pending-marker, or marker/record mismatch for reconciliation.

`resume` is a reader/action verdict, not another public command: selecting it dispatches to the subject's open
driver, which validates the identity state before allocating a fresh locus. `arc errand open` is that driver
here; the recorded-key housekeeping and groom-anchor drivers arrive with `claimed-sweep-verbs`, and the verdict
already names them so the dispatch does not change when they land.
The fresh role links the entering process's current WU when warm or records a null parent when cold; the portable
identity tail never persists a machine-local checkout path. Resume reuses the retained branch only at the exact
`savedHead` or `changeRequest.headSha`, and allocation failure restores the unchanged identity tail rather than
retiring it. Awaiting-merge resume additionally requires the recorded change request to be verified still open at
its stored head; an unreachable host degrades to an explicit operator confirm rather than a refusal.

Three new state-touching companions cover lifecycle sites that do not already own allocation:

- `arc locus attach [--checkout <path>] [--json]` reconciles/adopts the roster-backed role, attaches the entering
  session, and returns the record and lease IDs. It derives role and subject from trusted markers, metas, and
  identity records; callers cannot supply them.
- `arc locus release <record-id> --lease <lease-id> [--json]` releases exactly the expected lease generation.
  Handoff invokes it once for each lease in the current frame; mismatched generations refuse safely with
  `lease-generation-mismatch` rather than releasing another session. Abrupt exit relies on dead-anchor recovery.
- `arc locus resolve <record-id> --action resume|abandon [--json]` owns dead transient residue. Resume reattaches
  through the subject's operation driver. Abandon is explicit and refuses unless the lease is dead, the checkout is
  clean, ARC provenance resolves, and branch/ref preservation is proven; only then may the subject driver retire
  identity, return/teardown the locus, and pop the role. Live, unknown, dirty, or unpreserved cases remain manual.

Every open result returns the shared mutation shape: active-locus path, session-home path, allocation kind, record
and lease IDs, and precomposed narration. Workflows invoke the verb, report that narration, and direct subsequent
commands to the returned path.

Every local leave/close is ordered to preserve recoverability:

1. finish and verify the transient work;
2. when identity must outlive the locus, persist its state and exact head in `savedHead` (`paused`) or
   `changeRequest.headSha` (`awaiting-merge`), after proving that head preserved on the remote;
3. return the primary to base, or teardown the spawned worktree through the ownership-aware driver;
4. release/pop the transient role using the expected IDs;
5. rederive and report the restored parent frame;
6. only then report local close success.

If work completes but locus pop fails, local work remains valid and the record is surfaced as recoverable residue.
The close never rewrites correct work merely because cleanup failed.

Full-mode Errand completion is independent of local-locus close. The merge finalizer calls `arc errand close` to
prove completion, retire the identity, clean refs, and remove its inbox capture. Resume of a `paused` claim, or of
an `awaiting-merge` claim once its recorded change request is verified still open, allocates a new local locus and
returns identity state to `open` — the resume half of that round trip is reachable here, while the departure that
produces either state is `errand-transient-lifecycle`'s.

Promotion is neither departure nor resume. The workflow decides that a wrapper floor has been crossed, then the
command performs one generation-checked frame replacement. It cannot infer “promotion-worthy” work, and no
departure verb attempts that judgment either. The promoted checkout becomes the WU root for the continuing
session; any former warm parent becomes an idle WU after exact lease release rather than a persisted WU-to-WU
parent edge.

Promotion performs no remote I/O while local locks are held. After a final reader and clean/exact-HEAD proof, it
acquires the target and optional parent record locks in deterministic record-ID order, revalidates both generations,
then performs the local branch rename, atomic meta write, marker conversion, target role/lease replacement, and
parent lease release. It releases both locks before CAS-retiring the exact Errand identity. A failure before the
local frame replacement rolls back only unchanged state created by that invocation; a failure after replacement
preserves the WU meta/role plus old exact identity as explicit reconciliation evidence. Re-running the same promotion
recognizes the exact old/new branch, meta, marker, role, parent lease, and claim states and completes idempotently.

Partial mode deliberately stays near-zero: no Errand identity ref, branch, PR, spawned checkout, materialize path,
or cross-session pause. Its machine-local `partial-errand` role supplies occupancy and compaction orientation only.
After the direct base commit, completion pops that role and removes any originating capture through the existing
inbox-removal verb. An incomplete partial Errand must finish, promote, or explicitly abandon before handoff.

There is no in-place displacement fallback. Existing v1/v2 Errand identity records, including v2 records with
`returnBranch`, remain readable only through the close path as bounded rollout compatibility. Every other
state-changing Errand verb refuses them with deterministic migration guidance, and every new identity write emits
v3 rather than upgrading or rewriting a legacy record in place. The existing `close --force` escape hatch is
accepted only by that legacy close arm; explicit v3 abandonment never bypasses host, provenance, or ref proof.

### D8. Identity records and the complete-basis transaction

This section owns the identity substrate every transient subject writes through: the versioned record shapes, the
claim generation, the ref transaction, and the change-request port. The grooming and housekeeping **claim
protocols** that drive it — member-set resolution and disjointness, `openedBaseHead` capture, sweep serialization,
and execute-bound marking — ship with `claimed-sweep-verbs`. The record variants below are specified here in full
regardless, because the reader, recovery, and residue classifiers must understand a claim they may encounter
without owning the verb that wrote it.

The identity ref remains backward-compatible. Existing v1/v2 entries parse as close-only Errands. New writes use a
v3 tagged union. Every v3 record carries an immutable, randomly minted `claimId` with at least 128 bits of entropy;
it identifies the claimant generation across lifecycle transitions and is never inferred from timestamps or record
content. A v3 Errand carries `version: 3`, its current fields, `kind: "errand"`, `purpose: "errand" |
"housekeep-routing"`, and `updatedAt`; new v3 records never carry `returnBranch`. Ordinary Errands permit
`state: "open" | "paused" | "awaiting-merge"` and keep their existing origin fields. Housekeep routing permits only
`open | awaiting-merge` because the confirmed sweep must complete or be explicitly abandoned before handoff. A
`housekeep-routing` record's branch-safe slug identifies the complete confirmed routing sweep and its single
branch/PR, whose review lane the workflow classifies at close from the writes the sweep actually landed — no lane,
dispatch, or plan-digest field persists in the record. `savedHead` is required for `paused` and
must be proven on the remote; `awaiting-merge` requires
`changeRequest: { repositoryRef, hostRef, baseRef, headRef, headSha }`. A v3 groom carries `version: 3`,
`kind: "groom"`, `slug: "groom-<anchorStub>"`, `anchorStub`, canonical non-empty `members`, immutable
`openedBaseHead`, `protection: "full" | "partial"`, `branch: string | null`,
`state: "open" | "awaiting-merge"`, `createdAt`, and `updatedAt`; `members` contains `anchorStub`, has no duplicates,
and is immutable for the claim generation. The full-mode awaiting state requires the same `changeRequest`, while
partial mode permits only `open`. Full mode requires the conventional anchor branch; partial mode requires
`branch: null`. Fields not selected by the state/protection discriminants are absent. The tree key remains `slug`
and must byte-match the embedded slug.

The identity tree is one global key namespace per ARC identity. `groom-<anchorStub>` is reserved for
`kind: "groom"`; creation treats an occupied key of an incompatible kind as a conflict rather than a resumable
record. The per-kind admission rules layered over that namespace — groom member-set disjointness and the global
single-live-sweep gate for `housekeep-routing` — are the claim protocols carried by `claimed-sweep-verbs`.

No persisted sweep plan exists at any layer: no canonical plan file or plan-digest generation. The source digest
paired with one adopted capture is an exact settlement handle, not a sweep plan. The durable record of an
interrupted sweep is what it already wrote, and this substrate stores nothing that would let a resumed drain replay
a stored plan instead of re-confirming against live state.

Every v3 identity mutation is a complete-read, expected-state ref transaction over tip-pinned local and remote
snapshots. With a configured remote it fetches the exact identity ref into a caller-unique temporary ref; a proven
absent remote ref is a complete empty basis, while an unreachable remote or incomplete, malformed, oversized, or
unreadable tree refuses mutation. The transaction reconciles local and remote history per key from their common
basis so independent additions, updates, and deletions survive, while divergent changes to the same key refuse.
It then applies a transform returning one typed `applied | idempotent | refused | error` outcome, CAS-moves the local
ref, and pushes. A non-fast-forward or an ambiguous push re-enters from a fresh remote snapshot and the same
idempotent expected-state transform; contention is bounded. With no configured remote, the same transform is local
CAS. Ordinary Errand transitions require the immutable `claimId` and exact previous same-slug record, so
resume/leave/close cannot blind-upsert over another session. No identity-ref remote I/O runs while a locus lock is
held, and no read or transport failure is interpreted as absence.

The transaction supports create-if-absent claim shapes as well as the ordinary upsert, so a driver may require its
key absent and its admission predicate satisfied on the complete basis. No winner-arbitration or retry-adoption
machinery exists — concurrent duplicate opens sit outside ARC's operator scale, so a raced CAS simply refuses and
re-reads. If subsequent locus allocation fails, open CAS-retires only the unchanged record carrying its own
`claimId`; a failed rollback surfaces the claim for explicit resume/abandon rather than hiding it.

Tail retirement and awaiting-merge re-entry use a narrow developer-authenticated change-request lifecycle port, not
a review-provider result. The port validates the configured repository/base against the stored `repositoryRef`,
`hostRef`, `baseRef`, `headRef`, and `headSha`, then returns exactly
`merged | open | closed-unmerged | changed-head | missing | ambiguous | unreachable`. Only `merged` for the exact
stored change request authorizes automatic retirement; `closed-unmerged` authorizes only explicit abandonment;
`open` at the stored head permits resume and materialization. Every other result retains the claim and prompts —
an unreachable host degrades re-entry to an explicit operator confirm and never blocks a path that retires
nothing.
Branch absence and base containment are never merge proof, so merge, squash, and rebase strategies share one rule.
An incomplete or malformed identity-ref read likewise blocks open/retirement; unreadable state is never absence.

Identity records make sanctioned branches first-class in-flight entries. Residue detectors classify from records,
not from `chore/` branch shape, so a live claim of any kind stops drawing cleanup warnings. This holds for groom
and housekeeping claims the moment their drivers land, without a second classifier: the record kinds are already
in the schema the detectors read.

Inbox writes taken by any subject share one notes-lock discipline. The visible managed field
``- _Disposition:_ `execute-bound` `` and inbox removal at completion both go through that lock, so a sibling
worktree cannot overwrite concurrent marking or another completion, and locus-record and notes locks are never
nested. Settlement removes only the entry whose normalized source digest matches the persisted adoption handle;
absence is idempotent, while a same-title replacement is preserved and refused. The session-init inbox-state slot
reports well-formed execute-bound entries separately from its routable count and surfaces malformed markings as
typed diagnostics. Execute-bound captures are a plain durable queue: any session may offer the next one in file
order, and the selected Errand open revalidates the entry before execution. The sweep that writes those markings is
`claimed-sweep-verbs`'; the queue they form is read here.

### D9. Recovery and compaction

The locus graph becomes the authority for frame relationships. The compaction seed remains a local snapshot and
adds one optional correlated hint object:

```typescript
interface CompactionSeedLocusHintV1 {
  sessionHomePath: string;
  activeLocusPath: string;
  recordId: string;
  leaseId: string;
  parentRecordId: string | null;
}

interface CompactionSeedV1 {
  // Existing schema-v1 fields remain unchanged.
  locus?: CompactionSeedLocusHintV1;
  locusAbsence?: "none" | "unavailable";
}
```

The emitter includes `locus` only when the required locus-state slot resolves one active record with a live entering
lease; `current: none`, ambiguity, or a probe error omits the whole object rather than persisting a partial hint.
Omission is never silent: a current producer that omits `locus` records **why** in `locusAbsence` — `none` when the
reader established that no generation was current, `unavailable` when ambiguity or a probe error meant it could not
be established. The two are not interchangeable. `none` is a positive attestation the audit can compare against;
`unavailable` is the absence of one.

These references are recovery hints, not new required keys, so the seed keeps `schemaVersion: 1` and a pre-model
seed lacking both keys still reads — and keeps the permissive pre-model comparison, since it cannot be held to a
disposition its producer never wrote. That compatibility is bounded: it applies only to seeds emitted before this
model, which any later session-init write replaces.

Audit rules follow from the disposition rather than from absence alone:

- `locus` present — any record, lease, parent, or normalized-path mismatch against the fresh reader is a recovery
  stop.
- `locusAbsence: "unavailable"` — always a recovery stop. The frame cannot be bound to the seed in either
  direction, so no fresh state makes it ready.
- `locusAbsence: "none"` — ready only while the fresh reader also resolves no live generation. A generation that
  appeared after the seed is a state change the seed cannot attest to, so it stops.

An absent hint is never a wildcard: it must not read as agreement with an arbitrary freshly resolved generation,
which would leave record, lease, active path, session home, and parent generation entirely unbound on a `ready`
verdict. The seed's stored workflow/load-set/task-cursor values likewise remain audit inputs, not authority.

Execute-now continuity derives from the visible inbox markings rather than the compaction seed or routing
identity tail. The inbox-state probe preserves file order, reports well-formed execute-bound entries separately
from the routable housekeep count, and surfaces malformed markings as typed diagnostics. Recovery offers the next
pending execute-bound entry the same way any session does.

Recovery consumes the fresh reader rather than resolving the graph a second time:

1. run the required recovery-envelope `locusState` probe once;
2. consume `current` and its referenced rows, where the reader has already selected the matching transient before
   its optional parent and joined exact identity authority;
3. derive the governing workflow, current load set, and task cursor from those validated row projections;
4. compare an optional seed `locus` object and the existing seed audit fields to those facts;
5. resume the transient frame first, then close/pop it and restore the WU frame.

A cold or between-WUs transient with `parentCheckoutPath: null` therefore follows the same reader-owned selection as
a warm child. Multiple plausible children, an ambiguous `current` verdict, or dead/unknown residue stops without a
recovery-side tiebreaker.

A missing harness summary is irrelevant. A missing or mismatched record/lease token, multiple plausible children,
or unknown process state stops and asks instead of guessing. A stale seed never overwrites a newer record.

An open Errand/groom identity without a locus records interrupted allocation or a failed exact-claim rollback;
session-init treats it as in-flight resume/abandon work. A paused full-mode Errand or awaiting-merge full-mode
Errand/groom likewise has identity but intentionally no locus role and is offered for resume, wait, finalization, or
abandonment rather than classified as missing occupancy. A partial Errand has no shared identity, but its live
machine-local role and session-local slug recover `run-errand` during compaction; partial handoff remains forbidden
until completion, promotion, or abandonment.

Maximum recoverable depth is two frames in every case, so recovery sees one ordinary child or none — never a third.
That invariant is what lets the sweep drivers in `claimed-sweep-verbs` close their routing role before the first
execute-now Errand opens rather than parenting one transient to another; recovery here needs no sweep-specific arm
to honor it.

During rollout, recovery may encounter an already-open pre-model v2 Errand with `returnBranch` and no child locus
record. It may use the shipped restore behavior to close that Errand once; no new operation recreates the shape,
and branch-shape inference never enters normal locus recovery.

The success path explicitly covers compaction during a warm Errand raised from a planning or execution WU: recovery
returns to `run-errand`, completes, leaves, or abandons the Errand, then rederives the WU's current workflow, load
set, and task cursor from its durable role and meta.

### D10. Occupancy-aware cleanup

The live-locus lease is an additional teardown veto, never deletion authority. Existing cleanup predicates remain
mandatory: trusted ARC provenance, clean worktree, exact terminal `HEAD`, valid lifecycle/retirement evidence,
remote/ref disposition, user-surface reconciliation, and current-locus protection.

Cleanup behavior is:

- live lease → suppress removal;
- dead lease → proceed only if every existing predicate independently authorizes removal;
- unknown, malformed, legacy, cross-identity, or duplicate-locus state → prompt/manual;
- no record on a markerless checkout → manual;
- age or heartbeat staleness alone → informational only.

Physical removal remains bounded and sequential. Teardown runs from outside the target worktree and uses
`git worktree remove`; no record condition licenses raw directory deletion.

Branch-residue and orphan-branch surfaces consume the complete locus identity projection before offering cleanup.
Every exact live v3 Errand, groom, or housekeep branch is protected by kind, key, and `claimId`; a live
`chore/groom-*` branch is therefore never reclassified as a recordless cheap branch merely because the legacy
Errand-only exclusion set does not contain it. An incomplete identity read suppresses branch cleanup offers.

The same projection covers the intentional WU archive-to-teardown interval. Once archival removes the active meta,
the retained WU role remains sufficient lifecycle authority for in-flight artifact classification until guarded
teardown pops it; scanners must not warn merely because the meta is already archived. A later detached checkout or
missing branch is aftermath evidence, not an explanation of the earlier advisory. Unknown or recordless artifacts
remain warning-worthy, so this transition does not broaden branch-shape inference into ownership authority.

Attach and physical removal share one linearization point. Cleanup may compute an advisory candidate outside the
lock, but before deletion it acquires the target locus lock (derived from the roster path even when the record is
absent), rereads the exact role/lease generation or confirmed absence and the live worktree roster, and revalidates
every mutable local predicate (lease, clean tree, `HEAD`, marker/evidence, current-locus protection, and subject
authority). It holds that lock across local `git worktree remove` and the expected-generation role pop; no fetch,
push, or host query occurs inside. Attach waits or refuses on the same lock. If removal fails, cleanup leaves the
record unchanged and releases the lock. Thus an attach either linearizes before the final check and vetoes removal,
or after successful removal and fails because the checkout is no longer in the roster.

### D11. Doctrine and packaged workflow updates

The implementation updates both canonical package sources and the self-hosted instance. Adopter-facing guidance
places hard constraints at their operation fire sites and keeps explanatory doctrine in the existing
concurrent-work/work-organization surfaces. It does not add a new always-loaded document.

Workflow changes use precomputed CLI verdicts and operation verbs:

- session-init dispatches on `locusState` current, primary-availability, in-flight-identity, recovery, and
  reconciliation results;
- session-init re-attaches only a resolved live-lease re-entry; ordinary resume proceeds leaseless on the durable
  role (D4). Handoff dispatches from the active locus before branch/meta heuristics:
  it leaves an active full-mode ordinary Errand through its subject driver, refuses an incomplete housekeep,
  unshipped groom, or incomplete partial transient until completion/abandonment, then hands off the restored WU or
  record-free between-WUs frame. It releases the restored WU lease when one exists; a cold transient close/pop
  leaves a free primary with no record or lease to release;
- `run-errand` gains protection-mode-specific open, resume, and completion arms and consumes the next-offer when
  one is present. Its departure arm arrives with `errand-transient-lifecycle`, and the sweep that produces
  next-offers with `claimed-sweep-verbs`;
- work-organization and `run-errand` retain the single-concern/single-session planning boundary, clarifying that
  operational re-entry preserves identity without creating a WU plan, meta, task list, or session notes;
- work-unit spawn and materialize arms invoke ARC verbs rather than narrating raw worktree mechanics;
- recovery consumes the locus graph and validated seed references;
- cleanup surfaces render only actionable CLI-precomposed unknown-occupancy and residue text;
- user-facing narration names the model only where a diagnostic or recovery surface requires it, and then always
  as "session locus", never bare "locus"; routine happy-path output speaks in concrete terms (checkout, worktree,
  branch) or stays silent. Non-actionable roster facts — unmanaged sibling worktrees, an unleased durable role,
  clean reconciliation — render nothing at session entry.

This keeps deterministic branching in TypeScript, typed record/slot structure in code, and only orientation,
recommendation, and user-choice framing in workflow prose.

### D12. Rename composition

`arc rename` changes a work unit's slug and, for a spawned subject, its checkout path. A locus record binds both:
`role.subject.key` carries the slug, and `recordId` is the canonical checkout-path digest. Every rename shape
invalidates the first — the reader resolves `meta-<subject key>.md` and requires exactly one match, so an unrekeyed
record reads `subject-unresolved` and surrenders its derived projection. A spawned rename additionally moves the
worktree and invalidates the second, leaving a `stale-record` beside an `unmanaged-checkout`. Rename therefore
rekeys both axes under the record lock; no roster inference reconciles a renamed subject.

Liveness disposition selects whether the rekey proceeds. It follows the frame matrix (D6) rather than teardown's
stricter predicate, because rename preserves the work unit instead of retiring it:

- absent lease → rekey the role alone;
- conclusively dead lease → rekey and clear the lease. A WU role with a dead lease already reads `idle` and the next
  attaching operation reaps that lease (D6), so clearing changes no frame; carrying it forward would assert a lease
  held by a proven-dead anchor at a session home the move may have invalidated;
- live lease held by the entering anchor → rekey and rebase `sessionHomePath` onto the new checkout path;
- live lease held by another anchor, or unknown liveness → refuse. A foreign live session stands in that checkout,
  and unknown liveness never authorizes a mutation (D6).

The transaction follows promotion's shape (D7). Rename acquires the old and, for a spawned move, the new record lock
in deterministic record-ID order, revalidates the worktree roster generation and the exact record generation under
lock, performs the physical `git worktree move`, mints the rekeyed record, removes the superseded one, then releases
both locks. Mint-before-remove is deliberate: an interruption between the two leaves a `stale-record` at a path that
no longer exists — visible and cleanable — where the inverse order would leave a live checkout with no role.
Re-running the same rename recognizes the rekeyed record and completes idempotently.

Record authority stays in an injected driver, mirroring guarded teardown (D10) rather than widening the worktree
mutator: the `move` operation stays mechanical, and the driver owns lock acquisition, revalidation, and the rekey.

## Alternatives & Rationale

### Keep frame state in the harness summary

Rejected. The summary is a lossy, harness-specific recovery channel and was the channel that lost the suspended WU
frame during dogfooding. ARC already has machine-local state and typed recovery probes; frame authority belongs
there.

### Extend the identity-scoped Errand records with checkout and lease fields

Rejected. Errand identity is machine-agnostic and ref-backed; checkout paths, PIDs, and occupancy are machine facts.
Synchronizing them would produce misleading cross-machine state and mix two authority domains.

### Use a general stack of session frames

Rejected. No warm WU-entry path exists and transient work cannot nest. A stack would add invalid states and
recovery complexity without a reachable third frame.

### Warn before displacing a WU worktree

Rejected. Warning preserves the category error and leaves foreign work coupled to WU state. Existing
return-branch records are close-only migration input, not authority to open new displaced work.

### Spawn an ephemeral worktree for every transient operation

Rejected as the default. Observed transient work is serialized by human attention; the free primary already
provides isolation from WU worktrees without provisioning and teardown on every item. Under full protection, spawn
remains the correct fallback for occupancy, isolation preference, and parallelize-now; partial mode keeps its
direct-base floor and refuses when the primary is unavailable.

### Store workflow, stage, task cursor, or load set in the locus record

Rejected. Each value already has an authority and may change while the checkout role remains stable. Storing copies
would make every stage/task transition a multi-record write and create stale recovery inputs. The record stores the
stable join keys; the reader derives the rest.

### Place the read surface under `arc status`

Rejected for the substrate command. `arc status` already serves a broad composite probe and future HUD projection.
`arc locus` is a narrow, network-free record query suitable for polling and reuse. Rich status rendering may consume
it later without changing the locus interface.

### Treat heartbeat age as dead-session evidence

Rejected. A quiet but live session can have an old heartbeat. Only a missing or creation-token-mismatched process
anchor proves death; age may explain a prompt but cannot authorize removal.

### Key every recovery action on a conclusively dead lease

Rejected — it is the shape D4/D6 originally carried, and it leaves two safe states with no exit. A lease whose
anchor is provably the caller's own process satisfies the safety condition without being dead: an in-place Errand
close left the expected role at the primary reading `subject-unresolved`, a conversation reset started a new session
inside the same process, and the anchor still verified live against its own parent. Abandon refused `lease-live`,
release refused `role-conflict`, and handoff refused `locus-unresolved` — leaving hand-deletion of the record, the
out-of-band action the model exists to prevent. Unverifiable liveness strands the same way whenever inspection
fails. D5's `self` verdict and D6's authority rule replace deadness as the sole proof.

### Add portable machine identity to the process anchor

Rejected as solving an already-solved case. It was proposed so a differing inspector kind could still conclude dead
or self across platforms, but record identity is derived from a flavor-normalized checkout spelling, and
normalization rejects a Windows drive or UNC spelling under the POSIX flavor and a rooted POSIX spelling under the
Windows flavor. Windows and POSIX record spaces are therefore disjoint by construction and never read each other's
anchors. The residual mismatch is two same-flavor inspector kinds at an identically spelled absolute path, which
requires a shared or synchronized mount; it degrades to `unknown` and reaches the operator-confirmed path like any
other unverifiable reading. Adding a machine axis to record identity would also duplicate a partition the path
flavor already provides.

### Scope the record store per platform

Rejected for the same reason, and additionally as an axis that earns nothing. Records already resolve under
`<primary>/.arc/user/{identity}/.internal/loci/`, so separate checkouts yield separate stores and one shared
checkout yields distinct digests per flavor. Keying the store or record ID to an inspector kind would enforce a
partition the normalization layer already enforces, at the cost of changing record identity and every consumer that
derives it.

## Cross-cutting Considerations

### Security and trust boundaries

- Locus JSON is untrusted local input. Parsers enforce exact schema keys, bounded strings, absolute path shape,
  schema version, digest/token grammar, and parent-depth limits. Consume paths use `safeParse` and classify failures
  against the kernel `ArcError` taxonomy through a `locus.*`-namespaced `LocusError` subclass (the kernel's
  `SchemaError` / `schema.registry.*` pattern); a producer-side `arc locus` emit defect fails deterministically
  rather than emitting invalid JSON, mirroring `cli-session-envelope`'s producer-validation boundary. The wire
  refusal `reason` and diagnostic codes stay data discriminants, not error codes.
- Stored paths never independently authorize file or Git operations. Mutators re-resolve them against the live Git
  worktree roster and ARC ownership markers before acting.
- Record-derived subject pointers are joined back to WU metas or identity records; a record cannot manufacture WU
  state or full-mode Errand identity. Identity-backed roles must match the exact v3 `claimId`, so reused keys cannot
  inherit stale local authority. The documented `partial-errand` subject is session-local orientation only and never
  enters identity or cleanup authority.
- Lock and record filenames derive only from validated lowercase hexadecimal path digests under the fixed locus
  directory. Stored content cannot select an arbitrary lock or output path, and filenames remain valid on Windows.
- Process command identity is compared as data and never executed. Inspector failures degrade to `unknown`.
- Identity-tree readers pin one ref tip, enumerate exact tree entries, check each blob size before decoding, require
  the tree key to match the schema-validated embedded slug, and preserve malformed or unknown-version entries as
  diagnostics. Mutators additionally require the whole snapshot to be complete and valid.
- Identity-record change-request coordinates are untrusted. Readers require the configured repository/base and
  exact current host object to match before query or retirement; stored values never authorize mutation of another
  repository, ref, or change request.
- A lease only vetoes cleanup. It cannot grant deletion, branch removal, ref mutation, or remote authority.

### Performance

- `arc locus` performs no fetch and scans only the bounded local worktree roster and per-checkout record set.
- Independent record, marker, subject, and process reads may run in bounded parallel batches; physical cleanup is
  sequential.
- Heartbeats write only on state-touching CLI operations, not on read/status polling.
- Per-record files avoid rewriting a machine-wide index when one session advances.

### Proportionality boundary

Exactness in this design is budgeted by consequence. Data-destroying paths — teardown, cleanup, abandonment,
record reap — keep their full guard set: provenance, cleanliness, exact-head, generation, and liveness checks, with
uncertainty degrading to a prompt. Routine operator paths — entry, resume, re-entry, drain continuation — use
advisory or simple-conflict semantics and never hard-refuse on identity recognition or replayable-state exactness.
Retained hardening behind this line (platform inspectors, record-scoped locks with stale-break, staged provisioning
receipts, the complete-basis identity transaction) is deliberate and closed: extend none of it without a new
motivating failure.

**The refusal vocabulary carries the same budget.** `LocusStopReason` is one flat set whose members differ in what
they cost to be wrong about, so each is classified into exactly one tier:

- **hard** — proceeding destroys or strands work, or the evidence needed to act is absent rather than merely
  unverified. No override exists at any layer. A foreign live lease or lock sits here, matching D6: the code holds
  positive evidence of another session, so there is no confirmation to give. Malformed, unsupported-version,
  duplicate, cross-identity, and role-conflicting records sit here too — each leaves the target itself unestablished.
- **authority** — the target is established but its disposition needs evidence the caller cannot supply, and the
  operator can. Every self-held and unverifiable reading sits here under D6's authority rule, together with an
  unresolved subject, a missing ownership marker, and an unavailable path — cases where the operator can attest to
  what became of a checkout and the inspector cannot.
- **advisory** — the code cannot verify a condition that session context may settle, and proceeding destroys
  nothing. `primary-dirty` and `primary-off-base` are allocation preconditions on non-destructive paths and belong
  here.

The governing test: **an agent may act on evidence the code lacks, and may not act where the code holds evidence
the agent lacks.** An unverifiable anchor on a session that knows it is alone is the first; a live foreign lease is
the second. An advisory proceeding emits exactly one line recording that it did — visible, never a prompt — so a
wrong call stays catchable without restoring the friction the tier removes.

Narration follows the same budget. Residue guidance states that a lease **dies when the process exits** rather than
that it dies with the session, and the self-held case reads as its own instruction — this lease is yours; exit this
process to release it — rather than a bare reconciliation stop.

### Testing

- Unit tests cover Zod parse/emit enforcement, `z.infer` type parity, kernel registration/versioning, opaque future
  kinds, parent-depth rejection, record-ID derivation, record-scoped locking and stale breaking, lease-token races,
  bounded tip-pinned identity snapshots, v3 claim generations and transitions, mutation idempotency, and
  duplicate-locus classification.
- Process-inspector tests cover Linux, macOS/BSD, Windows, PID reuse, missing processes, permission errors,
  unsupported platforms, harness ancestor selection, and short-lived shell rejection through injected snapshots.
- Reconciliation tests cover WU/groom/Errand backfill, recordless free primary, stale-record reap, malformed and
  unknown-liveness refusal, failed-primary-resolution refusal, and read-only query non-mutation.
- Errand entry tests cover interrupted-open recovery, aggregate provisioning disposition, exact inbox-generation
  continuity across full identities and partial roles, same-title replacement refusal, and exact-generation
  settlement.
- Integration tests use temporary repositories with linked worktrees to cover primary allocation, occupied-primary
  spawn, partial-mode primary-only refusal, cross-directory heartbeat, close ordering, three-way identity
  reconciliation, ambiguous-push retry, derivation-floor promotion through its real runtime, and attach racing
  physical removal.
- E2E tests cover a warm WU → Errand → WU round trip, compaction/recovery mid-Errand, real v3 Errands for the
  current-open, ROADMAP, and inbox-adoption cases, the merged close path and its foreign-occupancy refusal, and
  close-only migration of a pre-model v2 Errand. Coverage for the carved verbs travels with them; nothing here
  asserts a path this deliverable does not ship.
- Platform CI runs the inspector contract on every supported OS. Package/source workflow parity and Markdown lint
  remain mandatory.

### Migration and rollout

- `cli-schema-kernel` and `cli-session-envelope` are landed implementation dependencies. This WU does not build
  against a temporary codec/type layer; it consumes the kernel's Zod vocabulary/registry and the validated
  session-init envelope slot directly.
- No bulk synchronized-data migration runs. `.internal/loci/` is machine-local and starts empty; v1/v2 Errand
  identities stay readable while new identity writes use v3.
- Session-init adopts existing ARC-marked linked WU worktrees from their metas, exact markerless in-place WUs only
  from a mutually matching physical-primary branch and active meta, and existing transient worktrees from
  Errand/groom records. The free primary intentionally remains recordless.
- Existing v1/v2 Errand records remain readable by close, but open, link, resume, promote, retire, and abandon
  refuse them and no new open uses in-place displacement; the carved departure verbs refuse them on the same rule.
  Retiring that close-only read path once in-flight legacy Errands drain is routed as a planning-close follow-up
  capture, so the rollout-compat shim does not linger unscheduled.
- Unknown schema versions and legacy markerless worktrees remain manual; no compatibility parser silently widens
  cleanup authority.
- The record and identity field narrowing (no dispatch, lane, or plan-digest fields) lands pre-release: no adopter
  state exists, and this repository's own live v3 records and machine-local loci reconcile by finalizing or
  re-opening them on the narrowed schema.
- The default warm path turns on only when record, allocator, recovery, and cleanup consumers land together in the
  WU. No long-lived configuration flag or dual authority is introduced.

### Documentation and integration seams

- The design aligns with the existing main-on-main and sequential Errand doctrine while making its occupancy rule
  mechanical.
- `cli-schema-kernel` (landed) owns the Zod schema/registry vocabulary, the inferred-type convention, the Result
  seam, and the error taxonomy this WU consumes; `cli-session-envelope` (landed) owns the validated session-init
  envelope and its `probe()` slot algebra. Locus schemas register through a kernel-composed locus registry rather
  than creating a parallel contract system.
- `cli-git-executor` (landed) owns the typed Git-command executor and its `execa` dependency; the locus reader and
  worktree mutators route their Git invocations through that seam. This WU reuses it without a dependency edge — it
  is already on the base — rather than re-narrating raw worktree mechanics.
- `schema-introspection-layer` is downstream: it may expose registered locus schemas through `arc schema`, but this
  WU neither waits on nor implements that consumer-facing surface. Registration alone does not place the locus
  schemas in the shipped `schemas/kernel.json` bundle — that build-projection wiring is routed to
  `schema-introspection-layer` as an explicit planning-close coordination capture, so its scope picks up the locus
  registry.
- `status-hud` may consume the typed reader for richer presentation; it does not own or mutate locus records.
- `wu-lifecycle-state-model` may change derived vocabulary without a locus schema migration because stored role
  kinds remain opaque and WU stage stays a read-time join.
- `husk-lifecycle-drivers` keeps physical cleanup ownership; the lease is one additional predicate.
- `shared-inbox-model` may replace the inbox backend without changing the sequential next-offer contract.
- The machine-local record remains outside the materialized backing-store target, while the groom identity record
  remains in the existing identity-scoped ref.

### Project alignment

- Checked against the PROJECT-PRD **Operational friction down, judgment friction up** principle — passes: checkout
  allocation, frame recovery, and cleanup liveness become deterministic, while ambiguous recovery and destructive
  cleanup still stop for judgment.
- Checked against PROJECT-PRD Out of Scope — passes: the design supports bounded co-development sessions and does
  not pursue throughput optimization, autonomous execution, or a prescribed harness.
- Checked against TECHNICAL-OVERVIEW § 2 **Architecture Components — CLI Package and Cross-Machine User State** —
  passes: the implementation stays in the existing typed CLI layers, uses the established gitignored user
  `.internal/` machine-state boundary, adds no locus-specific runtime service or dependency, and consumes the
  upstream canonical Zod substrate.
- Checked against the storage, knowledge, and procedure forward-compatibility directions — passes: machine facts
  stay outside the backing store, derived access paths replace new loading flags, and workflows consume typed
  verbs/precomputed verdicts rather than evaluating state in prose.

## Success Criteria

1. A warm Errand raised from a live WU never switches the WU worktree's branch. Full mode allocates the free
   primary or a spawned transient worktree; partial mode uses only the free primary or refuses. Spawn remains the
   normal full-protection WU placement, while explicit `--here` makes the physical primary WU-owned and
   unavailable to transient allocation until guarded teardown restores record-free base. The same allocator serves
   the carved transient verbs unchanged.
2. With compaction landing mid-Errand, recovery consumes the shared locus-state projection, checks any atomic
   optional seed `locus` hint, resumes the transient frame, and then restores the WU's freshly derived workflow,
   load set, and task cursor without reading a harness summary.
3. `arc locus` renders the specified human roster and v1 JSON union without network access or durable writes,
   including free primary, idle WU, active warm child, identity-only allocation gap/merge wait, dead transient, and
   unknown/legacy states. Its Zod-first value schema is the sole type authority, is registered through a
   kernel-composed locus registry, and reaches session init, recovery, and handoff through one required
   `probe()`-wrapped projection rather than a second frame-selection authority.
4. Locus records are excluded from notes serialization, survive ordinary session compaction/re-entry on the same
   machine, cannot be clobbered or released by a stale lease token, and reclaim only token-stable conclusively dead
   locks.
5. Primary occupancy is decided from the locus reader plus live Git guards; a live/unknown occupation never shares
   the checkout or silently queues another transient session, and partial mode never spawns a second base checkout.
6. Existing ARC-marked WU and transient worktrees and the exact markerless in-place WU case adopt safely, and
   stale/malformed/unverified-markerless cases fail closed with deterministic guidance.
7. Residue and orphan-branch classification reads identity records rather than branch shape, for every record kind
   in the schema including those whose drivers ship later, and an incomplete identity read suppresses branch
   cleanup offers.
8. Cleanup suppresses every live lease, prompts on unknown occupancy, and holds the target locus lock across its
   final expected-generation recheck, local physical removal, and role pop, so attach cannot race deletion.
9. An identity-only `paused` or `awaiting-merge` claim renders as such, is offered for resume, wait, finalize, and
   abandon, resumes through the subject's open driver into a newly allocated locus returning state to `open`, and
   finalizes through `arc errand close` — without turning operational re-entry into a durable plan or classifying
   any unleased transient role as normal waiting.
10. A partial-mode Errand remains a direct base commit with machine-local occupancy only—no shared Errand identity,
    branch, PR, spawned checkout, materialization, or cross-session pause.
11. Linux, macOS/BSD, and Windows process inspectors satisfy the same PID-plus-start-token liveness contract, with
    unsupported or unverifiable environments deterministically returning `unknown`.
12. Implementation builds on the landed `cli-schema-kernel` and `cli-session-envelope`; package-source and
    self-hosted workflow/rule copies stay synchronized, locus schemas register through a kernel-composed registry
    without a parallel contract layer, and all Tier 1–3 quality gates pass.
13. `arc errand promote` converts one exact live v3 Errand checkout into the sole active WU session home, leaves any
    former warm parent as an idle WU, preserves its originating capture until the WU meta commit, and exposes no
    independent v3 identity-retirement command. Derivation-floor promotion carries real-runtime integration
    coverage, and lost-response replay preserves the originating capture handle.
14. Ordinary WU session entry proceeds leaseless on the durable role, warm entry never hard-refuses on harness
    identity, and routine session narration renders no locus lines for expected state — unmanaged sibling
    worktrees, an unleased durable role, and clean reconciliation stay silent, with the model named only as
    "session locus" where diagnostics require it.
15. Renaming a work unit rekeys its locus record on both binding axes — subject key for every shape, checkout-path
    record ID for a spawned move — under deterministic-order record locks, so the renamed subject resolves without
    leaving a stale record, an unmanaged checkout, or an unresolved subject. The rekey clears a conclusively dead
    lease, rebases an entering-anchor lease onto the new path, refuses foreign-live and unknown liveness, and
    re-runs idempotently.
16. Every residue state reaches an in-model exit: a dead lease resolves automatically, a self-held or unverifiable
    lease resolves through operator confirmation scoped to an unresolved subject or explicit abandon, and a foreign
    live lease stops. No recovery state requires hand-editing the record store, and each stop reason is classified
    into exactly one of the hard, authority, and advisory tiers.
17. A fresh installation receives the `arc-errand` entry skill, asserted through fresh-init installation plus
    command and workflow reference checks.
18. Every reference surface this deliverable ships — `QUICK-REFERENCE`, `session-init`'s signal-leaf spine, and the
    `arc-errand` / `arc-session` skills — describes only commands the shipped CLI provides, with no advertised
    option the exact-head command does not declare. This is verified by deliberate inspection: no test asserts a
    documented command against the live command surface, so a green suite is not evidence here.

## Open Questions

Platform command invocation details and internal module/file partitioning may be selected during task generation
and implementation so long as they satisfy the process-inspector and layer-boundary contracts above.
