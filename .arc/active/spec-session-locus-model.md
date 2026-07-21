# Spec (`detailed` · `RFC`): session-locus-model

- **Origin:** `[internal]` — worktree-parallelism dogfooding exposed checkout-identity and recovery failures when
  transient work interrupted a live work-unit session.

- **Purpose:** Give every ARC-managed checkout a durable execution role and every live session a recoverable,
  machine-local locus frame, so transient work can leave and return without repurposing a work-unit worktree or
  relying on harness-summary state.

- **Implementation dependency:** `cli-schema-kernel` and `cli-session-envelope` have landed; this WU consumes the
  kernel's canonical Zod schema/registry vocabulary and the validated session-init envelope contract directly.

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
- Make Errand, grooming, housekeeping, spawn, and materialize fire sites consume the same locus allocation model.
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
- permit warm entry only when the entering process anchor selects Codex or Claude in a fixed directed-command
  capability table. Every other selector, an interactive shell, shared host, or unverifiable anchor refuses with
  `cold-entry-required` before identity or local allocation state changes and recommends a cold session.

State-touching open and attach commands acquire the entering process anchor from bounded native ancestor evidence
before identity or local allocation mutation. They skip only recognized ARC/npm invocation descendants, select the
durable per-session harness or direct interactive shell process, and refuse when ancestry, command identity, start
token, or interactive/controlling-terminal evidence is unavailable or ambiguous. A short-lived CLI child is never
the lease anchor.

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
    "dispatchId": null,
    "originEntry": null,
    "routingPlanDigest": null
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
- `dispatchId`, `originEntry`, and `routingPlanDigest` are always present and nullable execution-context fields. A
  partial inbox-origin Errand carries `originEntry` because it has no shared identity record, plus `dispatchId`
  exactly when that capture is execute-bound; a description-origin partial Errand carries neither. Every full
  Errand derives both from its exact v3 identity and requires all three role fields null. A partial housekeep role
  carries its freshly minted dispatch ID and exact routing-plan digest with a null origin entry. WU, groom, and
  unrelated transient roles require all three null. These fields coordinate continuation only; they never grant
  identity, branch, or cleanup authority.
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

| Operation | Role action |
| --- | --- |
| WU spawn / materialize / in-place entry | Mint durable WU role; attach the applicable entering lease. |
| WU session-init | Adopt/backfill the WU role if needed; attach or refresh the session lease. |
| WU handoff | Release only the matching lease; retain the durable role. |
| WU teardown | Linearize final lease validation and role pop with linked removal or in-place base restoration. |
| Errand open / resume | Mint `errand` role in the allocated checkout; link the WU parent when warm. |
| Errand leave | Full mode returns/tears down the local locus and pops its role while retaining identity. |
| Errand complete | Full mode retires identity after merge; partial mode pops occupancy after the base commit. |
| Errand promote | Replace the exact transient generation with a WU role/marker and make it the session home. |
| Grooming open | Mint `groom` role and matching groom-kind identity record; link warm parent when present. |
| Grooming close | Pop local role; retain full awaiting-merge identity or retire the completed partial claim. |
| Housekeep entry | Full mode mints one routing-sweep role/identity; partial mode mints one sweep occupancy. |
| Housekeep close | Pop the sweep role; retain the full-mode routing PR identity tail. |
| Errand materialize | Write ARC ownership marker and `errand` role in the materialized worktree. |

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

Lease attach is single-session: a null WU lease accepts a new token; the same token/anchor is idempotent; a
different conclusively live anchor refuses as occupied; and unknown liveness stops for reconciliation. A dead WU
lease may be replaced during session entry with a fresh token. A dead transient lease is not silently replaced:
the caller must choose resume-and-ship or abandon, after which the chosen operation attaches or pops explicitly.

Transient roles are session-bounded; transient identity may outlive one local occupancy. A full-protection Errand
may become `paused` only after its exact WIP head is committed and pushed, or `awaiting-merge` after its exact change
request is recorded. `arc errand leave` persists that identity state, returns the primary to base or tears down the
spawned checkout, then pops the role. Later resume allocates afresh. Pause is operational re-entry for the same
atomic concern, with no task list, session notes, or planned cross-session decomposition; a concern that needs a
durable plan promotes to a WU instead. A remaining unleased transient role is therefore still genuine
crash/walk-away residue rather than a normal pause/review wait.

Housekeeping never parents an Errand frame. Under full protection, one confirmed pure-routing sweep opens one
`housekeep/errand` role and one v3 Errand identity; every routing write in that sweep shares its branch and PR. The
PR is classified by the strictest lane touched. A large sweep may use multiple ordered in-session review increments
and commits on that PR, but never splits into per-lane or per-chunk routing PRs. Under partial protection, one
`housekeep/housekeep` role covers the same sweep's direct-base commits. Once the complete routing sweep is preserved,
its full-mode change request is recorded, and the routing role closes, the drain hands execute-now work to
`run-errand`. The routing PR tail remains as one identity-only v3 Errand. Each execute-now Errand is a sibling
transient frame whose parent is the original WU session home, or null for a between-WUs session. The inbox and
Errand identity preserve pending work; `run-errand`'s next-offer replaces “return to the still-open drain frame.”
Maximum persisted depth remains two.

State-touching CLI commands refresh `heartbeatAt` only when their resolved durable process anchor matches the
record lease. Directed commands refresh the target checkout's record, not the caller's current directory. Read
verbs, probes without a write flag, and status rendering never refresh, reconcile, or reap records.

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
unsupported facility refuses before any state mutation rather than truncating the chain into a guess. Production
open and attach drivers derive this anchor once and carry the exact PID/start token through allocation and lease
provisioning.

Missing platform facilities, permission failures, malformed output, unsupported operating systems, and legacy
records return `unverifiable`; they never guess dead.

Anchor selection walks upward from the ARC command and skips only the known invocation wrapper chain. The selected
process must bound exactly one interactive agent session; a shared daemon or application host is not a valid
anchor. Shipped harness adapters identify a per-session Codex, Claude Code, or Gemini process by
executable/environment evidence. Direct interactive invocation may anchor to the controlling shell. A
non-interactive, unrecognized caller—or a harness exposing only a shared host—records an unverifiable lease rather
than anchoring to the wrong process.

Verification compares both PID and `startToken` and returns exactly three states:

- **live** — the anchored PID exists with the same creation token;
- **dead** — the PID is absent or exists with a different creation token;
- **unknown** — the inspector cannot prove either result.

Heartbeat age is rendered as context only. It never changes a live/unknown result and never grants cleanup.

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
      | { origin: "description"; originEntry: null; dispatchId: null }
      | { origin: "inbox"; originEntry: string; dispatchId: string | null }
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
      routingLane: "auto" | "reviewed";
      dispatchId: string;
      routingPlanDigest: string;
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
    dispatchId: string | null;
    originEntry: string | null;
    routingPlanDigest: string | null;
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
entry and optional execute-dispatch binding; housekeep identities preserve their required dispatch ID, routing-plan
digest, and routing lane. Grooms have `purpose` null, preserve the anchor and canonical member set, carry the
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
with `lease: null` and a valid identity-only tail are `idle`. Any other managed role whose lease is absent, dead, or
unknown is `residue`; recovery may replace a conclusively dead WU lease on entry, but unknown liveness always stops.
Malformed, unmanaged, duplicate, and unresolved rows have `frame: null`. Current-state selection follows D9: among
live leases matching the entering anchor, prefer the transient role, resolve its optional parent, otherwise take the
matching WU; multiple plausible children or parents are ambiguous.

Primary availability is likewise exact. A record-free, clean primary on the configured base is `free`. A valid
transient role or exact in-place WU role is `occupied`, including `leaseState: "absent"` for crash/walk-away
residue. An unexpected role/branch pairing, relevant live/unknown lock, malformed target record, unresolved physical
path, or duplicate alias is `unsafe`. Unrelated unmanaged linked worktrees remain visible diagnostics and do not by
themselves make the primary unsafe or stop reconciliation.

`inFlightIdentities.actions` lists state-appropriate next operations, not authorization to perform them: `open`
and `paused` offer resume/abandon, while `awaiting-merge` advertises wait/finalize/abandon/resume as possible. The
network-free reader does not query host state; each selected mutation revalidates its local, ref, remote, and
change-request predicates, and permits awaiting-merge resume only for host-reported requested work.

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
      dispatchId: string | null;
      routingPlanDigest: string | null;
      restoredParent: null | { recordId: string; checkoutPath: string };
      nextOffer: null | {
        kind: "errand" | "housekeep";
        key: string;
        dispatchId: string;
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
        | "full-protection-required" | "cold-entry-required"
        | "remote-unreachable" | "identity-conflict" | "change-request-open"
        | "change-request-unverifiable"
        | "partial-handoff-forbidden" | "preservation-unproven"
        | "inbox-link-conflict" | "work-unit-name-taken" | "promotion-source-invalid"
        | "dispatch-conflict" | "routing-plan-mismatch" | "routing-lane-downgrade" | "stub-ambiguous";
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
Leave/close may instead populate `identity`, `originEntry`, `dispatchId`, `routingPlanDigest`, `restoredParent`, and
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
  branch or shared identity, and retains the direct-base commit path. An inbox-origin open reads any exact
  execute-dispatch binding and carries it in the v3 identity or partial role. Before either mode mutates identity
  or occupancy, the driver acquires and selects the entering process anchor defined by D5; the selected anchor is
  the single lease input carried through allocation, provisioning, and the shared result;
- `arc errand link <slug>` remains the late inbox-adoption edge, but mutates only an exact ordinary v3 claim through
  the complete-basis transaction. It never rewrites legacy identity, changes an existing different origin, or
  treats a missing/incomplete inbox read as a linkable capture;
- new `arc errand leave <slug> --state paused|awaiting-merge` validates the pushed WIP head or exact change request,
  then closes the full-mode local locus without retiring Errand identity; `arc errand close <slug>` remains
  completion and may run later from base context;
- new `arc plan open <anchor-stub> [--include <stub>...]` / `arc plan close <anchor-stub>` verbs own one fixed
  single- or multi-member grooming-branch lifecycle;
- new `arc errand abandon <slug>` retires an ordinary Errand's identity-only open, paused, or awaiting-merge claim,
  while `arc plan abandon <anchor-stub>` retires an open or awaiting-merge groom claim. Both require explicit
  selection and the same clean/provenance/ref-preservation checks as residue abandonment. Awaiting-merge
  abandonment additionally requires exact host truth that the stored change request is closed-unmerged; merged
  routes to finalization, while open or unverifiable refuses;
- `arc errand promote <slug>` remains the explicit wrapper-floor crossing and becomes a locus-aware subject driver.
  It requires the exact live ordinary v3 claim, committed branch head, role, lease, and checkout generation. It
  renames the branch and mints the WU meta recoverably, converts a spawned transient marker plus the target role to
  WU authority under owned-lock revalidation, and makes that checkout the new session home. For a warm promotion it
  releases the former parent WU lease so two active WU roots never survive the frame replacement; the former WU role
  remains idle. Errand identity retires last, and an originating inbox capture remains until the workflow commits
  the WU meta. The standalone `arc errand retire` command disappears because retirement has no independently safe
  v3 transition;
- new `arc housekeep open <slug>` / `arc housekeep close <slug>` / `arc housekeep abandon <slug>` verbs own
  session-bounded routing occupancy. In full mode `<slug>` identifies the complete confirmed pure-routing sweep and
  its one v3 Errand identity with `purpose: "housekeep-routing"`; every routed entry shares that identity's branch
  and PR. Open receives a canonical complete-plan file plus its `auto | reviewed` lane, mints one dispatch ID, and
  persists the plan's canonical digest; re-entry may upgrade `auto` to `reviewed` but never downgrade it, and adopts
  only when the supplied plan re-digests exactly. Partial mode uses the same sweep slug for one direct-base
  occupancy and carries a fresh dispatch ID plus plan digest in its local role. The sweep role closes before any
  execute-now Errand begins. Abandonment requires explicit selection and the same preservation checks as Errand
  abandonment; an awaiting-merge routing identity additionally requires exact host truth that its change request
  closed unmerged;
- new full-protection `arc errand materialize <slug>` replaces session-init's raw `git worktree add` path; partial
  Errands have no remote branch to materialize. Materialization accepts only an identity-only paused claim at
  `savedHead`, or an awaiting-merge claim at `changeRequest.headSha` after exact host truth requests work. It refuses
  `open` identities, branch-derived legacy candidates, changed/missing remote heads, and incomplete snapshots;
- `arc start`, `arc materialize`, and worktree lifecycle mutators mint WU roles beside ownership markers.

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
driver (`arc errand open`, `arc housekeep open <recorded-key>` for `housekeep-routing`, or `arc plan open` with the
recorded groom anchor/member set), which validates the identity state before allocating a fresh locus.
Awaiting-merge resume additionally requires exact host truth that the recorded change request needs work.

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

Full-mode Errand completion is independent of local-locus close. A reviewed or auto-merge Errand normally calls
`arc errand leave --state awaiting-merge` after its PR reaches the waiting state. An explicitly interrupted Errand
may use `--state paused` only after committing and pushing the WIP head; needing a durable cross-session plan instead
fires promotion. The later merge finalizer calls `arc errand close` to prove completion, retire the identity, clean
refs, and remove its inbox capture. Paused resume, or awaiting-merge resume after exact host truth reports requested
work, allocates a new local locus and returns identity state to `open`.

Promotion is neither leave nor resume. The workflow decides that a wrapper floor has been crossed, then the command
performs one generation-checked frame replacement. It cannot infer “promotion-worthy” work, and `leave` does not
attempt that judgment. The promoted checkout becomes the WU root for the continuing session; any former warm parent
becomes an idle WU after exact lease release rather than a persisted WU-to-WU parent edge.

Promotion performs no remote I/O while local locks are held. After a final reader and clean/exact-HEAD proof, it
acquires the target and optional parent record locks in deterministic record-ID order, revalidates both generations,
then performs the local branch rename, atomic meta write, marker conversion, target role/lease replacement, and
parent lease release. It releases both locks before CAS-retiring the exact Errand identity. A failure before the
local frame replacement rolls back only unchanged state created by that invocation; a failure after replacement
preserves the WU meta/role plus old exact identity as explicit reconciliation evidence. Re-running the same promotion
recognizes the exact old/new branch, meta, marker, role, parent lease, and claim states and completes idempotently.

Full-mode housekeep close applies the same identity-tail rules to the complete routing sweep before popping its
role. Partial housekeep must finish the sweep's direct-base routing commits before its role pops. In both modes,
every routing occupancy is gone before execute-now Errands begin.

The first full-mode housekeep close after shipping records `awaiting-merge`, returns or tears down the local locus,
and leaves the identity tail. Reinvoking close from base context after exact host truth reports merged finalizes the
tail, cleans refs, and permits the next drain. Until then, session-init offers wait/finalize/resume/abandon without
recreating housekeeping occupancy unless requested work requires resume.

Partial mode deliberately stays near-zero: no Errand identity ref, branch, PR, spawned checkout, materialize path,
or cross-session pause. Its machine-local `partial-errand` role supplies occupancy and compaction orientation only.
After the direct base commit, completion pops that role and removes any originating capture through the existing
inbox-removal verb. An incomplete partial Errand must finish, promote, or explicitly abandon before handoff.

There is no in-place displacement fallback. Existing v1/v2 Errand identity records, including v2 records with
`returnBranch`, remain readable only through the close path as bounded rollout compatibility. Every other
state-changing Errand verb refuses them with deterministic migration guidance, and every new identity write emits
v3 rather than upgrading or rewriting a legacy record in place. The existing `close --force` escape hatch is
accepted only by that legacy close arm; explicit v3 abandonment never bypasses host, provenance, or ref proof.

### D8. Groom-and-ship identity and Errand sweep continuity

Grooming becomes session-bounded `groom-and-ship`, not a parked multi-session branch:

- `arc plan open <anchor-stub> [--include <stub>...]` resolves one explicit, non-empty co-design set while scanning
  planned, provisional, and active lifecycle state. Every member must resolve uniquely to a branchless planned or
  provisional stub; any active/started subject, duplicate across state directories, nested alias, or repeated member
  refuses, and planned does not silently win over provisional. The anchor is always a member; `members` is the
  unique raw-UTF-8-sorted member set. The set is immutable for the claim generation—enlarging it requires closing
  or abandoning and reopening with the complete set;
- open atomically claims the complete set in the Errand records ref before editing and mints one machine-local
  role/lease. After the required base refresh, the claim records the exact configured-base `HEAD` observed before
  the claim/branch transition as immutable `openedBaseHead`. Full protection creates the conventional
  `chore/groom-<anchor-stub>` at that exact OID; partial protection keeps the same identity-backed claim and
  revalidates the unchanged base `HEAD` under the primary lock before editing/committing directly. A lost
  revalidation rolls back only the unchanged claim;
- the grooming session edits only planning artifacts belonging to the claimed members, cohort coordination records
  those members already name, and mechanically required derived project views. Full protection opens one doc-only
  PR. Full close refreshes the configured base outside locus locks, then validates the branch diff from its live
  merge-base after proving ancestry from `openedBaseHead`; partial close validates the exact
  `openedBaseHead..HEAD` range and refuses a non-descendant or unrelated intervening commit. This is pre-WU
  co-design only: a started WU's branch remains isolated and cross-WU changes use normal coordination routing;
- full-mode close records the exact awaiting-merge change request, returns/tears down the local locus, and pops
  machine occupancy while retaining identity through the ship-to-merge window. Partial-mode close retires the
  claim after the direct base commit and required push discipline completes;
- a later open with the same anchor and exact member set detects the live identity record and offers resume/wait
  instead of cutting a second pass from a base that lacks the previous drafts. Any non-identical set overlapping a
  live groom claim returns `identity-conflict` and names the exact conflicting members in precomposed guidance;
- after the recorded change request is proven merged, the next state-touching reconcile retires the groom identity
  record, allowing the same stable branch name to serve a new pass.

The identity ref remains backward-compatible. Existing v1/v2 entries parse as close-only Errands. New writes use a
v3 tagged union. Every v3 record carries an immutable, randomly minted `claimId` with at least 128 bits of entropy;
it identifies the claimant generation across lifecycle transitions and is never inferred from timestamps or record
content. A v3 Errand carries `version: 3`, its current fields, `kind: "errand"`, `purpose: "errand" |
"housekeep-routing"`, and `updatedAt`; new v3 records never carry `returnBranch`. Ordinary Errands permit
`state: "open" | "paused" | "awaiting-merge"`; its existing origin fields gain nullable `dispatchId`, which is
non-null only for an inbox origin carrying the same execute binding. Housekeep routing permits only
`open | awaiting-merge` because the confirmed sweep must complete or be explicitly abandoned before handoff. A
`housekeep-routing` record's branch-safe slug identifies the complete confirmed routing sweep and its single
branch/PR; it also carries required `routingLane: "auto" | "reviewed"`, `dispatchId`, and `routingPlanDigest`
fields, with lane updates monotonic toward `reviewed` and the digest immutable for the claim generation.
`routingPlanDigest` uses the canonical `sha256:<64 lowercase hex>` grammar. `savedHead` is required for `paused` and
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
record. It also scans every live groom record's canonical member set: disjoint sets may proceed, the same anchor and
exact set may produce the state-appropriate resume/wait/finalize verdict, and any other overlap refuses rather than
letting two branches co-design the same WU concurrently. Housekeep sweep slugs may intentionally repeat across
non-overlapping drains, but each reuse is a fresh `claimId` generation and cannot begin while any live
`housekeep-routing` identity exists, even under a different slug.

Housekeep open accepts one bounded exact-key `HousekeepPlanV1` JSON file representing the confirmation gate's
write-affecting decisions in inbox order. Each entry carries its exact current inbox title plus a closed disposition
and a `sourceDigest` over that entry block's UTF-8 bytes after CRLF-to-LF normalization and exactly one terminal
newline. It selects a closed disposition (`dismiss`, `existing-stub`, `owner-adoption`, `new-stub`, `defer`,
`retain`, or `execute-now`) and only the destination/commitment fields legal for that disposition. The canonical
digest covers this ordered entry set and its disposition-specific data. It deliberately excludes overlap
advisories, review-increment chunking, and the separately persisted lane, so presentational changes and monotonic
`auto → reviewed` escalation do not create a new plan generation. Unknown keys, duplicate titles, illegal field
combinations, oversized input, or a title/source digest that does not match the current inbox snapshot refuses
before claim or role mutation. The notes-lock phase revalidates every planned entry preimage; a race rolls back only
the unchanged claim rather than applying a stale plan. The normalized plan is an invocation input, not another
persisted queue: only its digest enters identity or role state.

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

Groom open applies that transaction as a create-if-absent, no-overlap claim rather than the existing upsert: the
deterministic `groom-<anchorStub>` key must be absent and its canonical member set must be disjoint from every live
groom on the complete basis. The first claimant wins; a losing exact-set retry CAS-adopts the winner at that key
while preserving unrelated entries and returns resume/wait, so its competing blob cannot remain as a recurring
same-slug conflict. An overlapping non-identical claim returns `identity-conflict` with the conflicts named in
`recommendedPromptText`. The claimant's random `claimId` distinguishes simultaneous otherwise-identical records.
If subsequent locus allocation fails, open CAS-retires only the unchanged record carrying its own `claimId`; a
failed rollback surfaces the claim for explicit resume/abandon rather than hiding it.

Tail retirement uses a narrow developer-authenticated change-request lifecycle port, not a review-provider result.
The port validates the configured repository/base against the stored `repositoryRef`, `hostRef`, `baseRef`,
`headRef`, and `headSha`, then returns exactly `merged | open | closed-unmerged | changed-head | missing | ambiguous |
unreachable`. Only `merged` for the exact stored change request authorizes automatic retirement;
`closed-unmerged` authorizes only explicit abandonment, while every other result retains the claim and prompts.
Branch absence and base containment are never merge proof, so merge, squash, and rebase strategies share one rule.
An incomplete or malformed identity-ref read likewise blocks open/retirement; unreadable state is never absence.

Groom records make sanctioned branches first-class in-flight entries. Residue detectors classify from records,
not `chore/groom-*` branch shape, and stop emitting cleanup warnings for live grooming.

A full-mode housekeep open first finalizes any exact host-proven merged routing tail, then scans the complete
identity tree and CAS-creates one sweep identity only when no live `housekeep-routing` identity exists. This is a
global per-identity gate, not a same-slug check: choosing another sweep slug cannot admit a parallel drain. A losing
cross-machine retry adopts the winner only when its canonical plan digest matches; a missing or changed plan returns
resume/abandon guidance rather than cutting from a base that may not contain its routing writes. All confirmed
routing entries use that one identity, branch, and PR; the persisted strictest lane classifies the PR after
compaction or resume. Large sweeps may contain multiple ordered review increments and commits without minting
another identity. Until the exact routing change request merges or is explicitly abandoned, its identity tail
blocks a second drain but not the already-confirmed execute-now sibling Errands.

Repeated sweep names such as `inbox-drain` are intentionally reusable only across generations. Exact merged-tail
finalization or explicit closed-unmerged abandonment first cleans the recorded local branch and deletes the remote
head under a lease bound to the recorded `headSha`; a missing branch is never itself completion proof, and a moved
head refuses cleanup. The driver refreshes base before minting the next `claimId` and cutting the same branch name.
Partial protection carries no synchronized identity ref, so its one-at-a-time guarantee is deliberately
machine-local primary occupancy; it does not claim cross-machine serialization. This keeps multi-lane routing
recoverable without storing an Errand queue or treating the harness summary as authority.

After confirmation, housekeeping updates all execute-now captures in one identity-notes-lock critical section. It
writes visible managed fields ``- _Disposition:_ `execute-bound` `` and ``- _Dispatch:_ `<dispatchId>` `` through
one atomic same-file replacement, so partial marking cannot create a smaller accidental queue. These entries are
triaged and do not re-enter ordinary housekeep routing, while the existing session-init inbox-state slot reports
their exact pending dispatch groups separately from its routable count. Inbox removal at completion uses the same
notes lock so a sibling worktree cannot overwrite concurrent dispatch marking or another completion. The mutation
returns its exact post-image for next-offer derivation; the selected Errand open revalidates that entry and dispatch
before execution.

Housekeep open composes that write recoverably. It validates and canonicalizes the complete plan before mutation.
Full mode first owns the exact routing claim, dispatch ID, and immutable plan digest. Partial mode first acquires the
free primary under its record lock and mints the exact housekeep role/lease carrying dispatch ID and plan digest; it
does not mark the inbox while the proposal is still memory-only. It releases the record lock before the notes-lock
transaction revalidates and marks the complete confirmed entry set; the two locks are never nested. Full mode
subsequently allocates/provisions its local locus; partial mode already owns its primary locus. A notes-write failure
rolls back only the unchanged full claim or partial role. A
later full-mode allocation failure clears only unchanged bindings carrying that dispatch ID and CAS-retires only the
unchanged claim. If any rollback loses a race, the identity, role, or visible dispatch group remains as explicit
resume/abandon work. A retry adopts that generation only after re-supplied plan content produces the same digest; a
different or unavailable plan cannot bind to the live sweep.

Housekeeping closes its sweep role before the first execute-now item. `run-errand` completion/leave then receives
one precomputed next-offer selected only from well-formed captures carrying the caller's exact dispatch ID, in file
order. It never scans all execute-bound captures as one queue. A different housekeep run may report an older pending
group but cannot consume or rebind it without a newly confirmed plan. Explicit housekeep abandonment clears only
an open sweep's exact still-pending bindings before handoff; after successful close, the dispatch group is
independent of later routing-tail abandonment. Errand abandonment clears its own binding without deleting the
capture.
Malformed, unreadable, or partially inconsistent dispatch state refuses and surfaces reconciliation instead of
skipping to another group. When matching captures remain, the result offers the next sibling Errand in the same
session, parented directly to the original WU when warm. Execute-now captures remain visible in the inbox until
their own Errand completion; no separate Errand queue artifact or nested execution model is introduced.

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
}
```

The emitter includes `locus` only when the required locus-state slot resolves one active record with a live entering
lease; `current: none`, ambiguity, or a probe error omits the whole object rather than persisting a partial hint.
These references are recovery hints, not new required keys, so the seed keeps `schemaVersion: 1` and a pre-model
seed lacking `locus` still reads. When the object is present, any record, lease, parent, or normalized-path mismatch
against the fresh reader is a recovery stop. Its stored workflow/load-set/task-cursor values likewise remain audit
inputs, not authority.

Execute-dispatch continuity derives from the visible inbox bindings rather than the compaction seed or routing
identity tail. The inbox-state probe preserves file order, groups well-formed execute-bound entries by exact
dispatch ID, excludes them from the routable housekeep count, and surfaces malformed or partial bindings as typed
diagnostics. Recovery may offer an exact pending group, but an unrelated later drain cannot consume or rebind it
without a newly confirmed routing plan.

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

The housekeep-to-Errand boundary is also deterministic. During routing, exactly one sweep role exists; compaction
resumes that role and its single identity. Before the first execute-now Errand opens, the housekeep role has popped
and the parent WU frame is active again, while any routing review tail is identity-only. Recovery therefore sees one
ordinary child or none—never a third frame. At the close/open boundary, the inbox retains not-yet-open captures so
the next sibling offer can be rederived after compaction; a resumed Errand derives the next offer after it leaves or
completes.

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
- session-init attaches the selected role. Handoff dispatches from the active locus before branch/meta heuristics:
  it leaves an active full-mode ordinary Errand through its subject driver, refuses an incomplete housekeep,
  unshipped groom, or incomplete partial transient until completion/abandonment, then hands off the restored WU or
  record-free between-WUs frame. It releases the restored WU lease when one exists; a cold transient close/pop
  leaves a free primary with no record or lease to release;
- `run-errand` gains protection-mode-specific open, leave, resume, and completion arms and consumes the next-offer;
- work-organization and `run-errand` retain the single-concern/single-session planning boundary while clarifying
  that full-mode WIP+push re-entry and the asynchronous review tail preserve identity without creating a WU plan,
  meta, task list, or session notes;
- work-organization replaces “one PR per lane” and large-sweep PR chunking with one PR per confirmed pure-routing
  sweep. Any reviewed-lane or foreign-owner write makes the whole routing PR reviewed; size may introduce multiple
  ordered review increments and commits on that PR, not more routing PRs;
- `drain-inbox` opens that one routing sweep after confirmation, closes it before handing execution to sibling
  Errand frames, and keeps every execute-now concern on its own subsequent Errand PR;
- `draft-design`'s grooming arm becomes exact-set open → groom → ship → close, supporting one explicit fixed
  co-design set of branchless backlog WUs without weakening started-WU isolation;
- materialize arms invoke ARC verbs rather than narrating raw worktree mechanics;
- recovery consumes the locus graph and validated seed references;
- cleanup surfaces render CLI-precomposed lease/residue text.

This keeps deterministic branching in TypeScript, typed record/slot structure in code, and only orientation,
recommendation, and user-choice framing in workflow prose.

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

### Keep housekeeping open while execute-now Errands run

Rejected. Routing is complete before execution starts, so preserving a housekeep parent would create a false third
frame. Closing routing occupancy first and opening sibling Errands preserves the confirmed sweep through inbox and
identity state without nesting loci.

### Preserve per-lane or chunked routing PRs

Rejected. Review lane remains a blast-radius classification, not a packaging boundary: any reviewed-lane write can
classify the complete routing PR without weakening its gate. Splitting one confirmed routing concern into several
identities and PRs adds recovery and cross-machine coordination states that the actual sweep does not need. Large
sweeps remain reviewable through ordered increments and commits on the same branch and PR.

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

### Testing

- Unit tests cover Zod parse/emit enforcement, `z.infer` type parity, kernel registration/versioning, opaque future
  kinds, parent-depth rejection, record-ID derivation, record-scoped locking and stale breaking, lease-token races,
  bounded tip-pinned identity snapshots, v3 claim generations and transitions, mutation idempotency, and
  duplicate-locus classification.
- Process-inspector tests cover Linux, macOS/BSD, Windows, PID reuse, missing processes, permission errors,
  unsupported platforms, harness ancestor selection, and short-lived shell rejection through injected snapshots.
- Reconciliation tests cover WU/groom/Errand backfill, recordless free primary, stale-record reap, malformed and
  unknown-liveness refusal, failed-primary-resolution refusal, and read-only query non-mutation.
- Integration tests use temporary repositories with linked worktrees to cover primary allocation, occupied-primary
  spawn, partial-mode primary-only refusal, cross-directory heartbeat, close ordering, async Errand leave/resume,
  three-way identity reconciliation, ambiguous-push retry, one-sweep housekeep claims, repeated sweep-name branch
  reuse, cross-machine routing-claim races, disjoint/overlapping groom-set races, materialization provenance, and
  attach racing physical removal.
- E2E tests cover a warm WU → Errand → WU round trip, compaction/recovery mid-Errand, single- and multi-WU grooming
  passes, multi-lane one-PR housekeep → sibling Errand continuation (including compaction mid-sweep and at the
  close/open boundary), reviewed/auto-merge Errand tails, and close-only migration of a pre-model v2 Errand.
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
- Existing v1/v2 Errand records remain readable by close, but open, link, leave, resume, promote, retire, and abandon
  refuse them and no new open uses in-place displacement; retiring that close-only read path once in-flight legacy
  Errands drain is routed as a planning-close follow-up capture, so the rollout-compat shim does not linger
  unscheduled.
- Unknown schema versions and legacy markerless worktrees remain manual; no compatibility parser silently widens
  cleanup authority.
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

1. A warm Errand or grooming pass raised from a live WU never switches the WU worktree's branch. Full mode allocates
   the free primary or a spawned transient worktree; partial mode uses only the free primary or refuses. Spawn
   remains the normal full-protection WU placement, while explicit `--here` makes the physical primary WU-owned and
   unavailable to transient allocation until guarded teardown restores record-free base.
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
6. Existing ARC-marked WU and transient worktrees and the exact markerless in-place WU case adopt safely, live
   grooming is neither classified as residue nor offered as an orphan branch deletion, and
   stale/malformed/unverified-markerless cases fail closed with deterministic guidance.
7. Grooming may claim one explicit fixed set of related backlog WUs under one anchor, identity, branch, role, and
   review tail. Disjoint sets may proceed concurrently; every overlapping open across machines produces one uniquely
   generated fresh-CAS winner, and only a same-anchor exact-set retry adopts it. Writes remain bounded to the claimed
   pre-WU planning concern, while reuse of `chore/groom-<anchorStub>` waits for exact change-request, claim, and
   recorded branch-generation retirement.
8. Full-mode Errand materialization accepts only an exact paused or requested-work awaiting-merge v3 identity head,
   writes ARC ownership provenance and a role record, and leaves session-init with no raw materialization path that
   can create a markerless ARC-owned worktree.
9. Cleanup suppresses every live lease, prompts on unknown occupancy, and holds the target locus lock across its
   final expected-generation recheck, local physical removal, and role pop, so attach cannot race deletion.
10. Full-mode housekeeping globally serializes the complete confirmed pure-routing sweep under one identity,
    branch, and PR, safely reuses repeated sweep names only after exact tail and branch-generation retirement,
    persists an immutable digest of the canonical write-affecting plan plus the strictest lane touched (reviewed
    wins over auto-merge), and adopts a retry only when its re-supplied plan matches that digest. It closes its sole
    routing locus before execute-now work, then opens each concern on its own sibling Errand PR whose
    completion/leave offers only the next capture in the same visible dispatch group without creating a third
    frame. Interrupted groups stay separately visible and cannot leak into an unrelated later drain. Partial
    protection promises only machine-local primary serialization, but carries the same exact-plan digest in a role
    minted before dispatch marking.
11. A full-mode Errand may leave its local locus in remote-preserved `paused` or exact `awaiting-merge` identity
    state, resume in a newly allocated locus, and finalize later without turning operational re-entry into a durable
    plan or classifying any unleased transient role as normal waiting.
12. A partial-mode Errand remains a direct base commit with machine-local occupancy only—no shared Errand identity,
    branch, PR, spawned checkout, materialization, or cross-session pause.
13. Linux, macOS/BSD, and Windows process inspectors satisfy the same PID-plus-start-token liveness contract, with
    unsupported or unverifiable environments deterministically returning `unknown`.
14. Implementation builds on the landed `cli-schema-kernel` and `cli-session-envelope`; package-source and
    self-hosted workflow/rule copies stay synchronized, locus schemas register through a kernel-composed registry
    without a parallel contract layer, and all Tier 1–3 quality gates pass.
15. `arc errand promote` converts one exact live v3 Errand checkout into the sole active WU session home, leaves any
    former warm parent as an idle WU, preserves its originating capture until the WU meta commit, and exposes no
    independent v3 identity-retirement command.

## Open Questions

None. Platform command invocation details and internal module/file partitioning may be selected during task
generation and implementation so long as they satisfy the process-inspector and layer-boundary contracts above.
