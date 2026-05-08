# Notes: Release Wrappers — Foundation

Implementation rationale, design alternatives, and audit-derived design decisions for
`tasks-release-wrappers-foundation.md`. Companion notes file — task list cross-references this
where load-bearing context exceeds inline-note scope.

Sections are organized by phase and parent task. Each entry carries its source finding ID
(F1-A, F2-D, etc.) for traceability back to the Pass 3 audit.

---

## Phase 1 — Validation Library Foundation

### § 1.1 — `AuthorizationDecision` payload shape per code

[F1-C] Per-code discriminated payloads handle each refusal's distinct context cleanly:

```typescript
export type AuthorizationDecision =
  | { kind: "authorize" }
  | { kind: "refuse"; code: 10; identifier: "no-active-wu"; hint?: string }
  | { kind: "refuse"; code: 11; identifier: "interlock-not-authorized" }
  | { kind: "refuse"; code: 12; identifier: "destructive-flag"; flag: string }
  | { kind: "refuse"; code: 13; identifier: "branch-protection-violation"; branch: string }
  | { kind: "refuse"; code: 14; identifier: "pushability-precheck-failed"; conditions: PushabilityCondition[] }
  | { kind: "refuse"; code: 15; identifier: "arg-grammar-fallthrough" };
```

Code 15 is reserved-for-empirical (not runtime-emitted by the wrapper) per F2-B. The doc
comment on the type declaration calls this out so future maintainers don't add a runtime check
for it.

### § 1.1 — `AuditEntry.interlockState` discriminated union

[F1-G] `interlockState` shape varies by command. Discriminated union keyed by the entry's
top-level `command` field:

```typescript
export type AuditInterlockState =
  | { command: "release-commit"; commitInterlock: ResolvedConfigOverride<CommitInterlock>;
      pushInterlock: ResolvedConfigOverride<PushInterlock> }
  | { command: "release-push"; pushInterlock: ResolvedConfigOverride<PushInterlock>;
      syncInterlock: ResolvedConfigOverride<SyncInterlock> }
  | { command: "sync"; pushInterlock: ResolvedConfigOverride<PushInterlock>;
      notesPush: ResolvedConfigOverride<NotesPushPolicy>;
      syncInterlock: ResolvedConfigOverride<SyncInterlock> };
```

Schema enforcement at write time (1.6.c) refuses entries whose `interlockState` shape doesn't
match the discriminator.

### § 1.1 — `formatRefusal()` helper signature

[F2-E] Shared composer placed in 1.5 (`interlock-validation.ts`) so refusal-message format is
consistent across 2.1, 3.2, 5.1 from day one (rather than retrofit at R15 / 6.3).

```typescript
export function formatRefusal(decision: AuthorizationDecision): string {
  // identifier line + what-happened sentence + remediation hint
  // single-source-of-truth for refusal message format
}
```

### § 1.2 — `release.*` key surface in `resolved-settings.ts`

[F4-F, F5-A] Constants, type aliases, and resolver function additions:

```typescript
// --- release.enabled ---
export type ReleaseEnabled = "true" | "false";

export const RELEASE_ENABLED_GIT_CONFIG_KEY = "arc.releaseEnabled";
export const RELEASE_ENABLED_YAML_KEY = "release.enabled";
export const DEFAULT_RELEASE_ENABLED: ReleaseEnabled = "false";
const RELEASE_ENABLED_VALUES: readonly ReleaseEnabled[] = ["true", "false"];

function isReleaseEnabled(value: string): value is ReleaseEnabled {
  return (RELEASE_ENABLED_VALUES as readonly string[]).includes(value);
}

export async function resolveReleaseEnabled(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<ReleaseEnabled>> {
  return resolveGitConfigOverride<ReleaseEnabled>({
    ...opts,
    gitConfigKey: RELEASE_ENABLED_GIT_CONFIG_KEY,
    yamlKey: RELEASE_ENABLED_YAML_KEY,
    defaultValue: DEFAULT_RELEASE_ENABLED,
    isValidValue: isReleaseEnabled,
    validValues: RELEASE_ENABLED_VALUES,
  });
}
```

`ReleaseEnabled` is string-typed (`"true" | "false"`) for resolver consistency with the existing
release-mode key pattern; consumers (4.2's status envelope) convert to boolean
(`value === "true"`) at the application boundary.

`ResolvedReleaseModeSettings` extends:

```typescript
export interface ResolvedReleaseModeSettings {
  commitInterlock: ResolvedConfigOverride<CommitInterlock>;
  pushInterlock: ResolvedConfigOverride<PushInterlock>;
  syncInterlock: ResolvedConfigOverride<SyncInterlock>;
  notesPush: ResolvedConfigOverride<NotesPushPolicy>;
  releaseEnabled: ResolvedConfigOverride<ReleaseEnabled>;     // NEW
}
```

`resolveAllSettings` adds the new resolver to its concurrent `Promise.all` fan-out.

### § 1.5 — Interlock value extension: trigger-set permissiveness ladder

Each of the three interlocks (`commit_interlock`, `push_interlock`, `sync_interlock`) gets a uniform third
value, `on-workflow`, establishing a symmetric ascending permissiveness ladder:

| Interlock | `manual` | `on-{primary}` | `on-workflow` |
| --- | --- | --- | --- |
| `commit_interlock` | ∅ (no agent autofire) | task-work commits | task-work + ceremony commits |
| `push_interlock` | ∅ | sync-internal push | sync + ceremony pushes |
| `sync_interlock` | ∅ | handoff workflow | handoff + future workflow-driven sync |

The values capture trigger-sets, not single triggers. `commit_interlock: on-task-approval` already worked
this way (`manual` = ∅ trigger set; `on-task-approval` = {task-approval} trigger set); `on-workflow`
extends each axis to a superset including any agent-mediated workflow event.

Today `sync_interlock: on-workflow` is behaviorally equivalent to `on-handoff` (no other workflow fires
sync), but the value is reserved for forward-compatibility — workflows like the upcoming worktree work
units may need to fire sync, and `on-workflow` captures that authorization without further config-axis
evolution.

Defaults are unchanged by this extension: `commit_interlock` and `push_interlock` default to `manual`
(conservative); `sync_interlock` defaults to `on-handoff` (auto-sync at handoff is the out-of-box
expectation). `on-workflow` is opt-in across all three.

### § 1.5 — Wrapper-scope-vs-permission authorization rule

Each release-wrapper command has a fixed scope describing what the agent uses it for:

| Wrapper command | Scope |
| --- | --- |
| `arc release commit` | any commit the agent fires (task-work ∪ ceremony) |
| `arc release push` | ceremony push only (sync uses its own internal push helper) |

The wrapper authorizes when the configured permission overlaps the wrapper's scope:

> **permission ∩ scope ≠ ∅ → authorize, else refuse(11)**

Plays out as:

- Commit × `on-task-approval`: {task-work} ∩ {any commit} = {task-work} → **authorize**
- Commit × `on-workflow`: {task-work, ceremony} ∩ {any commit} → **authorize**
- Push × `on-sync`: {sync push} ∩ {ceremony push} = ∅ → **refuse(11)**
- Push × `on-workflow`: {sync, ceremony} ∩ {ceremony push} → **authorize**

The wrapper performs **scope-coverage** checks, not **runtime-context** detection. It cannot distinguish
"this commit is for task-work" from "this commit is for a ceremony" at invocation time, and does not need
to — the rule operates on values alone.

### § 1.5 — Prompt-vs-bypass framing + defensive code 11

The user-facing model for the release-wrapper system is **"agent uses wrapper to bypass the harness
prompt, or uses raw git which the harness prompts on"** — not "wrapper grants permission to commit."
Configuration choices express which paths the user permits the agent to bypass-prompt on.

Code 11 (`interlock-not-authorized`) is **defensive backstop**, not a primary UX path. It fires when the
agent invokes the wrapper outside the configured scope (a layer-1 violation per the layered model below).
In normal use, the agent's contract handles tool selection and code 11 should not fire. When it does,
the audit log captures it for forensic review.

The model is two-layered:

1. **Wrapper layer (mechanical):** Does configured permission overlap wrapper scope? If no → refuse(11).
   Defensive validation; covers the trustless case (`manual`) and scope-mismatch (push under `on-sync`).
2. **Agent layer (judgment):** Within authorized scope, is using the wrapper appropriate for *this
   specific invocation*? Codified in DEV-RULES.ARC and workflow docs; not wrapper-enforced.

Example: Under `commit_interlock: on-task-approval`, the wrapper authorizes any agent commit invocation,
but the agent's contract is to use the wrapper only for task-work commits and use raw `git commit` for
ceremony commits — letting the harness prompt the user. Layer-2 violations (agent uses wrapper for
ceremony under `on-task-approval`) surface via behavior drift, audit-log forensics, or user feedback,
not via code 11.

The remediation hint in code 11 messages reflects this framing: primary remediation is "use raw `git`
instead" (the harness-prompt path); secondary is "set `<key>: on-workflow` to authorize" (escalate
permission only if intentional).

### § 1.6 — Schema-violation vs. I/O-failure error handling

The audit-log writer splits failure modes by error class:

- **Schema violations throw.** Calling `appendAuditEntry` with an entry whose shape doesn't match the v1
  schema is a precondition violation — the caller built a malformed entry, which discriminated-union
  typing should make structurally hard to hit in correctly-typed code. Throwing surfaces it loudly at
  test time; in production it should never fire.
- **I/O failures return `{ ok: false, error: ... }`.** Disk-full, permission-denied, and similar
  operational failures need a path that the caller can swallow without aborting the wrapped operation.
  Audit logging is sidecar to release wrappers and `arc sync`; an audit-log write failure should not
  propagate up and mask a successful commit/push.

The asymmetry is deliberate: programmer errors get loud (throw → test surface); operational errors get
quiet (return → caller decides whether to surface or swallow).

### § 1.6 — Sanitization edge cases

[F1-H] Behavior list extensions for `sanitizeArgs`:

- Attached-value forms: `-m"foo"`, `--message=foo` — redact payload, preserve flag shape
- Multiple `-m` flags chained (`-m subject -m body`) — each redacted independently
- `--file` and `--file=path` — kept verbatim (path is not sensitive; content lives on disk)
- Path normalization not performed (paths kept verbatim, no resolution to absolute)

---

## Phase 2 — `arc release commit` handler

### § 2.1 — Refusal short-circuit order

[F2-D] Order of refusal checks (cheapest → most-expensive I/O):

1. **Code 12 (destructive-flag)** — argv-time, no I/O
2. **Code 10 (no-active-wu)** — fs probe of `.arc/active/`
3. **Code 13 (branch-protection-violation)** — git read of current branch + config read of
   `branch.protection` and `branch.base`
4. **Code 11 (interlock-not-authorized)** — config read via `resolveAllSettings`

Code 15 (arg-grammar-fallthrough) is reserved-for-empirical (not runtime-checked by the
wrapper) per F2-B.

First-match wins; cheapest checks fire first to minimize I/O on common refusal paths. Mirror in
3.2 push with code 14 (pushability) inserted between 13 and 11.

### § 2.2 — Wrapped invocation strategy

[F2-C] `child_process.spawn('git', ['commit', ...args], { stdio: ['inherit', 'pipe', 'pipe'] })`:

- **stdin: 'inherit'** — interactive `git commit` (e.g., editor for message) works as expected
- **stdout: 'pipe'** — captured for hash extraction post-success; can be teed to user's stdout
  for verbatim bubbling
- **stderr: 'pipe'** — captured for hook-failure attribution; teed to user's stderr

Hash extraction: parse from spawned stdout (commit output includes the hash) or fall back to
`git rev-parse HEAD` immediately post-success. Practice during impl will pin which is more
robust.

Validation reads (config, status file, etc.) continue to use the existing `GitExec` interface —
captured output is fine for those, no user-facing concern.

---

## Phase 3 — `arc release push` handler

### § 3.1 — Result callback dropped from signature widen

[F3-B] PRD R2 mentions an optional result callback "for audit logging." Existing helper has a
single observable transition (success/failed); caller can `await result; auditLog(result)`
inline at the wrapper. The callback abstraction adds no value with current shape.

Recommendation applied: drop callback from 3.1's signature widen — keep `args?: string[]` and
`inheritStdio?: boolean` only. Revisit if a concrete need surfaces (progress events,
dependency-inversion concern).

### § 3.2 — `runPushabilityStatus` invocation parameters

[F3-D] Invocation shape for release-push:

```typescript
const pushability = await runPushabilityStatus({
  exec: io.exec,
  access,
  target: "worktree",                  // single-leg push; never "both"
  worktreeBranch: <current branch>,    // alignment probe fires
  worktreeSyncState: <pre-resolved>,   // optional, for force-push detection
});
```

`worktreeBranch` arg threads the current branch into the alignment probe
(`HEAD...origin/<branch>` left/right count). Without it, alignment-gating doesn't fire — wrapper
would miss `worktree-not-aligned-with-origin` block.

`target: "worktree"` exclusively: notes-leg conditions (`missing-notes-refspec`) won't surface
for release-push; the test for that path is defensive (confirms the wrapper doesn't accidentally
pass `target: "both"`).

### § 3.2 — Pushability disposition handling (block / advisory / auto-fixed)

[F3-C] `runPushabilityStatus` returns `{ allowed, conditions: PushabilityCondition[] }` where
each condition has `disposition ∈ {block, auto-fixed, advisory}`. Wrapper handling:

- **Any `block` disposition** → refuse with code 14 (`pushability-precheck-failed`)
- **`force-push-required` advisory disposition** → refuse with code 14 (force-push always
  blocked, inheriting the contract from `pushability.ts`'s preamble)
- **`auto-fixed` disposition** (e.g., `missing-notes-refspec`) → pass through; the matrix
  self-resolved the issue

Test coverage for 3.2 explicitly exercises each disposition class to ensure the wrapper handles
all three branches correctly.

### § 3.3 — Hook-fail vs server-reject distinction

[F3-F] Both produce non-zero exit from `git push`. Distinguishing in audit entry:

- Pre-push hook output typically contains "pre-push hook" / "pre-push" text in stderr
- Server-reject typically contains "remote rejected" / "non-fast-forward" / "rejected"
- Pattern-match what's available in captured stderr; default `hook: "unknown"` if neither
  matches

Don't over-engineer — `--porcelain` machine output is more reliable but adds parsing burden;
pattern-matching stderr is sufficient for forensic record. Pin attribution best-effort.

### § 3.3 — `refStatus` capture with stdio inheritance

[F3-G] With `inheritStdio: true`, the widened helper switches to `child_process.spawn` with
`stdio: ['inherit', 'inherit', 'pipe']` — capture stderr while inheriting stdout. Git push
writes ref status to stderr (per `git-push(1)`); parse `refStatus` from captured stderr.

Alternative: `--porcelain` flag for machine-readable output, then re-emit to stderr for verbatim
bubbling. More fragile across git versions; pattern-match stderr first, fall back to
`refStatus: "ok"` on parse-failure for success and `refStatus: "unknown"` otherwise.

---

## Phase 4 — Opt-in state surface

### § 4.2 — `--json` envelope schemaVersion forward-compat

[F4-E] `arc release status --json` envelope carries `schemaVersion: 1` for forward-compat,
mirroring audit-log discipline. Future schema bumps require coordinated reader updates per the
schemaVersion lock.

```json
{
  "schemaVersion": 1,
  "releaseEnabled": { "value": true, "source": "git-config" },
  "commitInterlock": { "value": "on-task-approval", "source": "yaml" },
  "pushInterlock": { "value": "on-sync", "source": "yaml" },
  "syncInterlock": { "value": "on-handoff", "source": "default" }
}
```

`releaseEnabled.value` is surfaced as a JSON boolean (`true` / `false`) in the envelope, even
though the resolver returns `"true"` / `"false"` strings — conversion happens at the envelope
boundary so downstream consumers (JSON-parsing CI, status integration) get native types.

---

## Phase 5 — Sync audit-log retrofit + probe surface

### § 5.1 — Sync cell → refusal code mapping table

[F5-C] All `cellNameFor` outcomes from `handlers/sync.ts:218-230` mapped:

| Cell | Decision | refusalCode | outcome.kind |
| --- | --- | --- | --- |
| `paired-push` | proceeded | null | sync |
| `worktree-only` | proceeded | null | sync |
| `notes-only` | proceeded | null | sync |
| `save-only` | proceeded | null | sync |
| `notes-prompt` | proceeded | null | sync |
| `worktree+notes-prompt` | proceeded | null | sync |
| `worktree-push+notes-blocked` | proceeded | null | sync |
| `notes-blocked` | mixed | null (leg-level result) | sync |
| `blocked-diverged` | refused | `pushability-precheck-failed` (14) | sync |
| `blocked-remote-ahead` | refused | `pushability-precheck-failed` (14) | sync |
| `blocked-no-upstream` | refused | `pushability-precheck-failed` (14) | sync |
| `blocked-detached-head` | refused | `pushability-precheck-failed` (14) | sync |
| `blocked-no-remote` | refused | `pushability-precheck-failed` (14) | sync |
| `blocked-remote-unavailable` | refused | `pushability-precheck-failed` (14) | sync |

`pushability-precheck-failed` (code 14) covers all blocked-cell varieties — pushability
semantics include "can the push fire" which captures `no-remote` and `remote-unavailable`
correctly.

`notes-blocked` is mixed: worktree leg fires, notes leg blocks. No top-level refusal code;
per-leg result captures the partial state in `outcome.kind: "sync"`.

### § 5.1 — Audit-entry timing per `handleSync` exit path

[F5-D] `handleSync` exit paths:

| Path | Audit entry? | Rationale |
| --- | --- | --- |
| identity-absent (handlers/sync.ts:274–282) | no | Path is identity-keyed — can't write without identity |
| no-arc-project (handlers/sync.ts:286–289) | no | Pre-init or out-of-repo invocation; no audit surface |
| dry-run (handlers/sync.ts:344–358) | no | Dry-run semantics; explicit skip |
| execute (handlers/sync.ts:360–387) | yes | Written post-execution from resolved `SyncOutcome` |

Documented gap on identity-absent / no-arc-project — same gap exists for release-commit /
release-push (both are also identity-keyed). 6.1 ADR cites this as a known blind spot.

### § 5.2 — `defaultsApplied` semantics under three-tier resolution

[F5-B] Migration from yaml-only to three-tier resolution preserves existing `defaultsApplied`
semantics:

- `defaultsApplied`: keys yaml-absent that received documented yaml-defaults
- A key may appear in `defaultsApplied` while having `source: "git-config"` in resolved
  provenance (yaml-absent + git-config-set is a valid state)
- Consumers needing true "value came from default" should check `resolved.<key>.source ===
  "default"`, not `defaultsApplied.includes(key)`

Existing `resolved-settings.ts` documents this in the `ResolvedSettingsResult` doc comment
(lines 185–191): *"a release-mode key may appear here while `resolved.<key>.source ===
'git-config'`."* The session-init envelope inherits this behavior unchanged after the migration.

---

## Phase 6 — Documentation + ADR

### § 6.1 — PRD R12 six-section → standard ADR template integration

[F6-E] R12 requires six content blocks; standard ADR template uses Status / Context / Decision
/ Consequences / Alternatives. Mapping:

| Standard ADR section | PRD R12 content |
| --- | --- |
| Status | Accepted |
| Context | Trust-model trade-off table; gap rows; pre-existing precedent (sync's same shell-pattern-gate boundary) |
| Decision | Trust-model framing (opt-in controls harness behavior, not wrapper behavior); bypass universality |
| Consequences | Mitigations per gap row; expected outcomes for adopter / contributor / maintainer |
| Alternatives | (Optional — alternatives to layered defense-in-depth, e.g., kernel-side seccomp, harness-side custom matchers) |

The trade-off table belongs in Context as the analytical foundation; mitigations belong in
Consequences as the result of the decision. Trust-model framing and bypass universality are
decision-rationale content (not raw context). Pre-existing precedent (sync) belongs in Context
as supporting evidence that the bypass is structural, not novel.

---
