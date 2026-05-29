# PRD: Errand Enablement

- **Origin:** [internal]

- **Purpose:** Make the Errand work class ([ADR-021][adr-021]) usable as a low-friction discipline — ship the
  `arc-errand` entry primitive, a personal **errand queue**, the Errand decision matrix + a commitment-based
  capture boundary, an advisory foreign-artifact gate, Errand-aware cold entry, and a planning-path auto-merge
  lane (doctrine + guided setup + dogfooding instance).

---

## Introduction

[ADR-021][adr-021] introduced the **Errand** work class — a single-review-increment side-task that routes
*around* work-unit (WU) machinery: no meta file, no lifecycle, tracked by git history via the `standalone (...)`
context footer. Worktree Foundation shipped the *mechanism* an Errand needs (the cheap ephemeral-branch path,
cross-WU sync, the R11 advisory spawn-time stub) and *documents* the Errand path, but ships no *ergonomics* for
it. Today, doing an Errand mid-session is manual and un-guard-railed: know to reach the primary worktree, cut a
`chore`-prefix branch off the base branch, do the work, ship, tear down — without disrupting the WU worktree you
occupy.

The gap is structural, not cosmetic. An Errand is **forced** into a separate primary-worktree session: it must
not ride the current WU's branch (diff pollution + latent cross-branch conflict — the exact thing Worktree
Foundation's isolation exists to prevent), it takes no worktree of its own, and switching the WU worktree's
branch is the stash-switch disruption Foundation forbids. The only clean path is the **primary worktree** (the
git-primary checkout — the base-branch launchpad that, per Concurrent Work Conventions, specializes for
admin/errand work under full protection) — a different directory, hence a different session. So an entry
primitive falls out of the same forcing logic that earned `spawn` one.

**Why now.** The cohort sliced the *niche* in-session verb (`arc-shift`) into Foundation while deferring the
*common* one (the Errand launch) to cohort-end — an inversion. This WU is the floor/ceiling re-slice that
corrects it: ship the thin floor that makes the Errand class usable at WF+1, leaving the heavy conventions to
Concurrent Work Conventions (CWC) and the awareness layer to In-Flight Awareness (IFA). The immediate forcing
load is concrete: the deferred USER-INBOX sweep (≈14 captures) is queued to run as post-ship Errands, and it is
almost entirely planning-path edits — which is also why the planning-path auto-merge lane is pulled forward
here rather than left to CWC.

## Goals

- Make launching an Errand a **low-friction, single-invocation** action from any WU session, without disrupting
  the originating worktree or polluting its branch.
- Give incidental work a **codified routing spine** (the Errand decision matrix) and a **crisp, commitment-based
  boundary** between *doing it as an Errand* and *capturing it to an inbox* — so every piece of work has one
  obvious home and the mental model stays clean.
- Provide a personal **errand queue** ("my errands") that converges across worktrees and machines and cannot
  silently rot (a staleness sweep keeps it honest).
- Provide an **advisory** safety check when an Errand targets an artifact owned by an in-flight WU.
- Close the **cold-errand entry** gap so an Errand that arises with no originating session has one door
  (`arc-session`), not a second entrypoint.
- Remove the **merge-wait** that otherwise makes each planning-path Errand a manual branch+PR+merge under full
  protection — shipping the planning-path auto-merge lane as doctrine + a guided setup workflow, and
  instantiating it in this repo as dogfooding.

## User Stories or Use Cases

- **In-session side-task (the common case).** Mid-WU in a linked worktree, you notice a self-contained
  maintenance task. You invoke `arc-errand`; it classifies the work, writes a forward-pointing entry to your
  errand queue (recording goal, pointers, and the proposed `chore`-branch), and returns the session to its own
  WU. The Errand is serviced at the next review-increment boundary in the primary worktree — **seed-now,
  execute-at-boundary** — preserving single-thread attention.
- **Cross-machine deferral.** You queue an errand on your desktop during the day; the queue converges via the
  notes-sync layer, so you service it that evening on your laptop. Cross-worktree and cross-machine handoff are
  the same mechanism.
- **Cross-cutting edit on a foreign in-flight artifact.** The target belongs to another in-flight WU. The
  advisory gate records a "coordinate / sequence after it integrates" caveat on the queue entry rather than
  proceeding blind.
- **Cold errand (no originating session).** You sit down fresh wanting to do a quick maintenance errand. In the
  primary worktree you run `arc-session`; its no-WU leaf orients in an Errand-aware mode and, on an explicit
  errand signal, sets up the errand locally and you execute.
- **Commitment boundary in practice.** You notice incidental work. If you're committing to do it yourself soon
  → it's an errand (queue it / do it). If you're not committing now → it's an inbox capture (triaged at a
  ceremony). You never anticipatorily inbox something you've already decided to do.
- **Planning-path drain under full protection.** A drain Errand touches only planning/backlog paths; its PR
  auto-merges once checks pass via the `merge-ok` job, while a constitutional-doc edit still requires review via
  CODEOWNERS.

## Requirements

Priority gradient: **P0** is the Errand floor (the usable discipline). **P1** is the merge-gate slice — fully in
scope for this WU, but the host-coupled layer and therefore the rational deferral seam if execution surfaces
blockers. P1 here means "in scope, deferral seam," not "optional."

### P0 — the Errand floor

1. **`arc-errand` primitive** — a thin skill over a small CLI helper (mirrors the `spawn` / `cold-start`
   shared-primitive shape). Invoked from any WU session on discovering Errand-class work. It classifies against
   the decision matrix, runs the advisory gate, resolves the primary worktree (`git worktree list`), and writes
   a forward-pointing **entry** to the errand queue recording goal, pointers, the proposed `chore`-prefix
   branch, and any coordination caveat — then returns the originating session to its own context. It is a
   **zero-git-mutation prep action**: it creates no branch and no commit (only the queue entry); the
   `chore`-branch is cut lazily by the errand session at execution, so an abandoned errand leaves only a
   sweepable queue entry, never an orphan branch. `arc-errand` is the ratified **skill** name (the working label
   "errand-launch" is retired to lowercase prose for the action). The CLI command is `arc errand` — a sibling
   entry verb to `arc start` (per AWL coordination: the two are sibling verbs, not a shared command).

2. **The errand queue (`ERRANDS.md`)** — a single, user-scoped surface at `user/{identity}/ERRANDS.md`
   (h1 "Errand Queue"; "the errand queue" in prose), holding entries for committed-but-not-yet-executed errands.
   Built **interim markdown-canonical**, exactly as `USER-INBOX` works today — an "agent-maintained with merge"
   surface that **converges via the shipped cross-WU notes entry-merge** (per-entry list-union + deletion
   tombstones), giving cross-worktree and cross-machine convergence for free. It is registered as a future
   **managed operational-state document** member ([ADR-022][adr-022]); the structured-record/CLI-render version
   is `operational-state-docs`' later migration, not built here.
    - **Entry schema (minimal, every field load-bearing):** the **managed-entry grammar** — the task-list
      parent-task shape minus numbered IDs. An `###` heading carrying a `[ ]` checkbox and a bold `<slug>` whose
      text is the merge/tombstone key and the `chore/<slug>` branch name — bold, not backticked, since the heading
      is a structural key slot like the task-list `**X.Y Title**`; backticks are reserved for the slug in prose,
      e.g. the `_Branch:_` field and cross-refs), followed by Goal-first italic-descriptor bullets:
      `_Goal:_` (the one-line "what", first at root per the family grammar) then `_Pointers:_` · *(optional)*
      `_Caveat:_` (the in-flight gate advisory, or a rare non-default execution hint) · `_Branch:_` (`chore/<slug>`)
      · `_Created:_` (date; the staleness sweep's age source). Prose fields (Pointers, Caveat) first; the short
      derived key/value fields (Branch, Created) close the group. **No `State` field** — State means lifecycle
      means the WU threshold tripping. The `[ ]` checkbox is **holding-ground** — never checked in place; entries
      drain by removal on ship. Dropped: "suggested skills / quality-gate context" as standing fields
      (identically-filled noise; the executing session is a full ARC session that already knows). The file carries
      an italic `>`-callout preamble and a `---` EOF marker, mirroring the sibling user-scoped surfaces.
    - **Drains by execution:** the entry is removed on ship. The durable record stays the conventional commit +
      `standalone (...)` footer ([ADR-021][adr-021]); the PR/commit body is composed from the entry at ship.
    - **Staleness sweep** (advisory; sibling of the stale-worktree sweep, surfaced at session-init / ceremonies):
      entries pending beyond a short threshold are flagged — *execute, or demote to the inbox* (a stale entry is
      a miscategorization signal: it wasn't actually committed-near-term). This — not storage layout — is the
      anti-dumping-ground discipline.

3. **The Errand decision matrix** — authored by this WU and given a **durable home** in
   `strategy-work-organization.md` § Errand Work Class. The create/maintain split is ADR-021's; the in-flight
   column is this WU's advisory gate. The `cohort-agile-parallelism.md` path-taxonomy table stays the
   in-session-fork *summary* and archives with the cohort; the full matrix outlives the ephemeral spec in the
   strategy doc, where CWC later extends it.

4. **Commitment-based capture boundary** — codify the rule that resolves errand-vs-inbox routing: the
   discriminator is **commitment/actionability**, not size. *Am I committing to do this myself, soon?* Yes →
   errand (queue/do it). No / unsure / maybe-someone-else / needs-a-think → `USER-INBOX` (triaged at a ceremony,
   where it may *become* an errand, graduate to a WU, or be dismissed). The matrix selects the *path* once you've
   committed to act; this boundary is the precondition (act-now vs capture-for-later). Deliverable: re-cut the
   DEV-RULES.ARC § "Leave it cleaner" routing table on the commitment axis (today it splits on
   during-WU-vs-later). **Does not** re-architect `USER-INBOX`'s internal sections — that is doc-naming-convention
   / the inbox-model's concern (Non-Goals).

5. **Advisory foreign-artifact concurrency gate** — extends Foundation's R11 spawn-time advisory stub to the
   `arc-errand` path. When an Errand targets an artifact, detect which *other* in-flight WUs touch it — a
   deterministic check over the local roster + per-worktree git state (committed branch divergence vs. the base
   branch, or uncommitted worktree edits), excluding the originating WU; if any overlap, record a "coordinate /
   sequence after it integrates" caveat on the queue entry rather than proceed. **Advisory, judgment-based, never
   a hard gate** — same posture as R11. Detection is deterministic (per the task list); the caveat wording is the
   judgment residual, resolved during work aligned with R11 and CWC's eventual doctrine.

6. **Cold-errand entry** — make session-init's no-WU **Orient** arm (primary worktree, no active WU)
   **Errand-aware**. Keep **one** door: `arc-session` is the universal entrypoint; its orient/no-WU path learns
   a second intent and disambiguates between-WU **discovery** vs. **Errand** via an **explicit signal**, not
   "any arg = Errand" (which collides with cold-start's spec-input arg). On errand intent it orients (universal
   content, no WU-artifact reads) and sets up the errand locally — no cross-worktree hop, since you are already
   in the primary worktree. The Worktree Foundation seam exists (the no-WU dispatch arm + optional-arg
   threading); this WU fills it with Errand behavior, coordinating with the session-init orientation surface.

### P1 — the planning-path auto-merge lane (merge-gate minimal slice)

The **minimal slice only**: the conditional `merge-ok` status job + a *static* planning-paths CODEOWNERS. The
full path-graded doctrine, phase-2 CODEOWNERS-from-`**Owner:**`, the all-owner concurrency gate, and
dependent-WU / stacked-PR ordering stay in CWC (Non-Goals). Delivered in three forms:

7. **Adopter-facing doctrine + reference recipe.** Host-agnostic classification (planning/backlog grooming
   auto-merges; constitutional docs — rules, ADRs, strategies — stay reviewed) plus a concrete **GitHub
   reference recipe**: a conditional `merge-ok` status job (NOT CI `paths-ignore`, which leaves required jobs
   Pending and blocks branch protection) and a static planning-paths `CODEOWNERS` skeleton. Recipe/template
   artifacts land in adopter-facing surfaces (`reference/templates/`; doctrine in the strategy doc). ARC owns the
   **classification and a recommended recipe, not enforcement** (per ADR-021).

8. **Guided `setup-merge-gate` workflow + setup-time offer.** A standalone, **runnable-anytime** workflow that
   walks the human/agent through the recipe: drop in the `merge-ok` job + planning-paths CODEOWNERS, configure
   branch protection to require the `merge-ok` check, enable native auto-merge. Idempotent (detect-if-present,
   safe to re-run); honest that it is GitHub-flavored (other hosts get doctrine + manual adaptation).
   `01_verify-and-configure.md` gains an **optional, protection-mode-aware offer** ("set this up now?") pointing
   to the standalone workflow — surfaced only under `branch.protection: full` (under partial protection an Errand
   is a direct commit with no merge-wait). The workflow lives standalone so it works post-init *or* later.

9. **Repo-local dogfooding instance.** This repo's actual `.github/workflows/merge-ok.yml` + `.github/CODEOWNERS`,
   branch-protection required-check wiring, and auto-merge enablement — our own instance, **not shipped** (every
   repo owns its `.github/`). **Update TECHNICAL-OVERVIEW § 3 Infrastructure** to document the new host config
   (additive to the existing GitHub Actions CI) when the instance lands, per its event-driven update discipline.

## Non-Goals

- **The CWC ceiling.** Full path-graded merge doctrine, phase-2 CODEOWNERS-from-`**Owner:**`, the all-owner
  concurrency gate, integration-time rebase/merge & async-merge discipline, and dependent-WU / stacked-PR
  ordering — all stay in Concurrent Work Conventions.
- **Re-architecting `USER-INBOX`'s sections.** Whether the inbox's internal `## Atomic` / `## Work Unit` split is
  retired or re-scoped is the doc-naming-convention / inbox-model's call. This WU defines the errand↔inbox
  *boundary* and ships the queue; it does not restructure the inbox.
- **The managed-doc record/render substrate.** `ERRANDS.md` ships interim markdown-canonical; the structured
  record + CLI render + migration is `operational-state-docs` (depends on `cli-substrate-adoption`; unbuilt).
  This WU does not build ahead of it.
- **Executing the doc-naming-convention cascade.** This WU adopts `ERRANDS.md` per the refined rule and records
  the convention refinement as coordination input; the rename cascade itself is doc-naming-convention's.
- **Oracle-backed gate** → IFA upgrades this WU's advisory gate and R11 together.
- **Tier model / `arc start` create-modes / tier ↔ Errand reconciliation** → Agile WU Lifecycle.
- **Knowledge-return channel** — none; code/doc Errands return via git, the rare exploration case rides
  `WORKING-MEMORY`. Revisit on real need.
- **`/arc-shift` revival** — deferred; the matrix redirects discovered tangents to `arc-errand`.
- **Enforcing host config in adopter repos** — ARC ships doctrine + recipe + guided workflow; it does not write
  into an adopter's `.github/` or `CODEOWNERS`.

## Technical Considerations

- **Errand executes in the primary worktree, on a `chore/<slug>` branch off the configurable base branch**
  (`branch.base`, *not* hardcoded `main`; default `main`). Terminology throughout uses "base branch" and
  "primary worktree" (the git-primary checkout) — never bare "main," which conflates the configurable trunk with
  the git-primary worktree.
- **Queue convergence + same-machine handoff timing.** `ERRANDS.md` converges via the shipped cross-WU notes
  entry-merge (cross-machine + cross-worktree). Under `user.notes_push: on-sync`, an entry written in a linked
  worktree isn't visible in the primary worktree until a sync+load cycle — so `arc errand` direct-writes the entry
  into the *primary worktree's* `ERRANDS.md` copy for immediate same-machine handoff, with notes-sync carrying
  cross-machine convergence; the slug-keyed entry-merge makes a later note-merge idempotent (no double-add).
- **Notes-sync feasibility.** The cross-WU entry-merge generalizes to `ERRANDS.md` with no file-set change — a
  flat user-root file auto-classifies as cross-WU; only a new `errands` parser shape is added. Rides shipped
  machinery, not the unbuilt substrate.
- **Cold path executes immediately by default.** Already oriented in the primary worktree, the cold leaf cuts the
  `chore` branch and does the errand; the queue entry is optional, earning its keep only for deferral and
  cross-machine. (In-session `arc errand` always queues + returns.)
- **Audience split.** Matrix + doctrine + recipe/templates + the `setup-merge-gate` workflow are adopter-facing
  (neutral framing); the dogfooding instance and cohort/ADR cross-references stay internal-dev-facing.

- **CLI shape — `arc errand` is a noun with two subcommands**, not a flat verb. `arc errand check` (read —
  reports foreign in-flight overlap as advisory facts, `--json` for the skill) and `arc errand queue` (write —
  composes + writes the entry; no branch, no commit). The skill is the only piece that needs the detection
  *facts*, so detection is exposed as a distinct read subcommand it calls before wording the caveat — mirroring
  `arc active status` / `roster` and preserving the detect (check) / judge (skill) / record (queue) split. The
  read/write split also keeps the CLI surface unmistakable next to the `arc-errand` skill; bare `arc errand`
  prints usage. The command is still errand-owned (not a flag on `arc start`), honoring the sibling-entry intent.

## Coordination

This WU's planning surfaced cross-cutting obligations on sibling artifacts. They sort by the Errand matrix +
commitment axis: a **committed propagation of a decision into a foreign artifact** is an *errand* (run post-ship
— the errand mechanism is what this WU builds, so these are its first dogfooding errands; hand-rolling them
pre-ship is the manual friction the WU exists to remove); a **not-yet-decided or oversized concern** is a
*capture* for the owning WU. The decision *records* below are inline (this WU's own artifact); the *propagations*
route as noted — the post-ship errands materialize into `ERRANDS.md` via `arc-errand` at ship (the queue, not this
spec, is their execution home; the records here are the pre-instantiation manifest).

**Post-ship errands (committed propagations of this WU's decisions):**

- **[ADR-022][adr-022]** — add `ERRANDS.md` to the managed operational-state document member list
  (agent-maintained-with-merge subtype). Constitutional doc → *reviewed* lane; depends on `ERRANDS.md` shipping.
- **`doc-naming-convention`** (provisional draft) — ratify the **refined suffix rule**: `{TYPE}.{QUALIFIER}` only
  for genuinely multi-instance TYPEs (where ≥2 scope-ladder rungs actually exist / are intended), since the
  suffix carries a "sibling exists on this axis" implicature that is false for singletons. Consequences: keep
  `WORKING-MEMORY` and `SESSION-NOTES` (drop the planned `MEMORY.USER` / `NOTES.SESSION` renames); `INBOX.*` and
  `STATUS.*` (real pairs) stay suffixed; add `ERRANDS.md` as a bare user-scoped singleton. Also reconcile the
  draft's "Errand is routing language inside `## Atomic`, not a surface" line with the new errand-queue surface.
  `backlog/` planning path → *auto-merge* lane. One review increment → errand, not a WU.
- **`errand-launch` → `arc-errand` label retirement** — sweep the working label across the cohort planning docs
  (`cohort-agile-parallelism.md` plus the `agile-wu-lifecycle` / `in-flight-awareness` / `concurrent-work-conventions`
  drafts) on the *auto-merge* lane; the single [ADR-021][adr-021] occurrence rides the *reviewed* lane
  (constitutional doc, can batch with the ADR-022 errand) — so two errands by lane, not one. Archived content
  (`completed/worktree-foundation`) is immutable history — excluded.
- **`config-storage-architecture`** (planned draft) — add the errand-queue **staleness threshold** to that WU's
  per-user-config migration scope: it ships interim in `arc-config.yml` (default 3 days) and migrates to the
  per-user `config.user.yml` substrate when that lands, since the threshold is a per-user preference (errands are
  per-user). Planning-path draft → *auto-merge* lane. One review increment → errand, not a WU.

`operational-state-docs` also adds `ERRANDS.md` to its migration scope — but as a downstream consumer of the
ADR-022 member-list change, that lands in its own planning, not as this WU's errand.

**Captures / coordination for the owning WU (not this WU's errands):**

- **`doc-naming-convention` / `operational-state-docs` — managed-entry grammar convergence + common primitive.**
  This WU establishes the **managed-entry grammar** for `ERRANDS.md` (an `###` heading with a `[ ]` checkbox and a
  bold `<slug>` whose text is the merge/tombstone key, then Goal-first italic-descriptor bullets — the task-list
  parent-task shape
  minus numbered IDs). The inboxes and `WORKING-MEMORY` should converge on it — an actionable `[ ]` variant for
  the inboxes, a no-checkbox `_Remove when:_`-first variant for memory — but that realignment is multi-touch
  (templates + the `parseUserInboxSection` / `parseWorkingMemory` parsers + live instances) and owned by
  `doc-naming-convention` (structure / section anchors) coordinating with `operational-state-docs` (the record
  model), so it is a capture for them, not this WU's errand. Two design seeds: (a) **codify the grammar once** as
  a single-source convention section (`strategy-file-classification`) that templates *reference* rather than each
  restating it in an HTML comment; (b) at the record layer, a **shared base keyed-entry schema** the member
  schemas extend, with the renderer projecting markdown (templates become render skeletons) and an **opaque
  record-key** for stable cross-edit identity — humans still reference by the **slug** (coordination-free and
  merge-stable; sequential / coded IDs would collide across machines and renumber on churn or drain).

- **In-Flight Awareness** — the spec requirement-priority scale (P0/P1/P2) vs. IFA's planned per-WU `Priority`
  field (P1/P2/P3, P3 default): same `P{n}` token, different axes, offset scales. *Not-yet-decided*
  (orthogonal-namespaces vs. rename one axis) → a **capture** for IFA (the field's owner), not a committed errand.
- **Concurrent Work Conventions** — standardize the cohort-wide "base branch" / "primary worktree" terminology.
  Spans many cohort docs (> one review increment) → **CWC-owned scope** by the ADR-021 size threshold, not a
  single errand. CWC already owns the "your main worktree is not always on main" convention — natural home.

## Success Criteria

- `arc-errand` launches an Errand from a WU session in a single invocation: writes a queue entry, runs the
  advisory gate, and returns to the originating context **without** creating a branch/commit or touching the
  originating WU's branch/worktree.
- The errand queue (`ERRANDS.md`) holds entries that converge across worktrees and machines, drain by execution
  (entry removed on ship), and surface a staleness advisory when they linger.
- The Errand decision matrix is present and complete in `strategy-work-organization.md` § Errand Work Class, and
  the DEV-RULES.ARC § "Leave it cleaner" routing table is re-cut on the commitment axis.
- The advisory gate, given an Errand targeting a foreign in-flight artifact (local detection), records a
  coordinate/sequence caveat and does **not** hard-block.
- `arc-session` on a no-WU primary-worktree tree orients in an Errand-aware mode and disambiguates discovery vs.
  Errand via an explicit signal.
- Under `branch.protection: full`, a PR touching only planning/backlog paths auto-merges via the `merge-ok` job;
  a constitutional-doc PR requires review via CODEOWNERS. The guided `setup-merge-gate` workflow runs end-to-end
  on a fresh GitHub repo, is idempotent, and is offered (protection-mode-aware) from `01_verify-and-configure.md`.
- This repo's own `merge-ok` lane is live (dogfooding), and TECHNICAL-OVERVIEW § 3 documents it.
- Terminology is base-branch / primary-worktree throughout (no bare "main"); the `errand-launch` label is retired
  to `arc-errand`.

## Open Questions

**Resolve before starting:** none — scope, seed model, capture boundary, naming, and the merge-gate slice are
ratified above.

**Resolve during work:**

- Advisory-gate caveat phrasing (detection is deterministic per the task list; wording aligns with R11 and CWC).
- Reference-recipe host coverage — GitHub-only with a host-agnostic doctrine note vs. adaptation notes for other
  hosts.

---

[adr-021]: ../reference/adr/adr-021-introduce-errand-work-class.md
[adr-022]: ../reference/adr/adr-022-managed-operational-state-documents.md
