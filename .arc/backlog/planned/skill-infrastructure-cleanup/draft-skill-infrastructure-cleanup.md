# Draft: Skill Infrastructure Cleanup

- **Origin:** [internal] — two skill-inventory / infrastructure concerns routed from `USER-INBOX` at the
  work-routing-discipline housekeep drain (2026-06-01).
- **Purpose:** Two related skill-infrastructure cleanups — standardize SKILL.md frontmatter to the
  agentskills.io spec, and re-evaluate whether once-per-install operations (`arc-setup`, possibly `arc-verify`)
  should hold skill inventory at all (skill-vs-workflow placement).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Codify the skill-door model**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: skill-infrastructure-cleanup`), housekeep drain
  (2026-07-03); captured during `adversarial-review` planning.
- _Concern:_ ARC skills are doors. Their bodies legitimately carry exactly the door-work: trigger/awareness, the
  interface contract, and any entry triage/dispatch judgment. Thin dispatchers are correct where triage is
  trivial; `arc-commit` is the non-trivial triage instance, not a universal shape to grow every skill toward.
- _Fold-in:_ define a body-content test ("is this door-work?") in the skill authoring cleanup, then sweep
  existing skills for duplicated procedure or missing triage.

### `[ ]` **Type `--plan` grooming branches so bare-landing resume routes them as grooming, not errands**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD` → routed here at drain), housekeep drain
  (2026-06-25); captured during `out-of-wu-entry` planning (2026-06-24). Provisional.
- _Concern:_ a paused `--plan` grooming session keeps its `chore/<slug>` branch open across sessions (the chosen
  "3c" continuity model); intentional resume is via re-invoking `--plan <stub>`. Recovery edge: bare-landing on
  that paused branch via plain `arc-session` (forgot to re-enter via `--plan`) trips `session-init`'s
  errand-resume detection, which misroutes it as an _errand_ — a meta-less `chore/` branch is indistinguishable
  from an errand branch today.
- _Proposed:_ type the grooming branch's record (errand-lattice's record model is shipped — an available
  extension point) so `session-init` resume detection **and** the in-flight surface route/label it as grooming,
  not an errand. Recovery-precision only; `out-of-wu-entry` does **not** depend on it.
- _Home note:_ routed here for the interrupted-session-detection theme (the symptom is session-init
  resume-detection misrouting). `operational-state-docs` (owns the record substrate the fix types) is the
  alternative home.
- _Reframe (2026-07-03 housekeep):_ the branch-containment reap capture adds fresh evidence from hand-rolled
  `--plan` branches: a future mint primitive (for example `arc plan open <slug>`) should mint a typed record and
  accept a target set, so a bare landing routes as grooming and not as an errand. Coordinate the target-set shape
  with `planning-iteration-mechanics`.

### `[ ]` **Rewrite SKILL.md descriptions in directive firing-condition form**

- _Routed from:_ `knowledge-architecture` grooming (2026-07-03), external-research finding folded there.
- _Concern:_ ARC skill descriptions are passive/summary-style ("Commit pending changes following ARC
  atomicity discipline…") — the weakest-firing description style measured: ~77–87% activation for passive
  phrasing vs ~100% for directive phrasing ("ALWAYS invoke when {triggers}; do not {default action}
  directly") in a 650-trial practitioner study (blog-grade, directional; cross-validated by
  Cursor-ecosystem experience with description-requested rules silently not firing). Descriptions are the
  sole pre-load trigger signal on description-firing harnesses, so this is a low-cost, evidence-backed
  reliability lever.
- _Fold-in:_ rewrite each `SKILL.md` description to name its triggers and the default behavior to
  suppress; same every-SKILL.md + package-mirror + harness-regen surface as the frontmatter item below.
- _Coordination:_ `knowledge-architecture` owns the cross-family firing-condition _authoring standard_
  (shared with its knowledge-index entries); this WU owns the skill-side rewrite pass. Confirm the seam at
  planning iteration.

### `[ ]` **Refresh or retire the stale `arc-verify` / `verify-integrity` surface**

- _Routed from:_ `finalize-parallelism` preflight errand drain (2026-07-03); surfaced when a broad "verify the
  queue is empty" instruction was interpreted as an `arc-verify` health check.
- _Concern:_ `arc-verify` still sends agents to early-development `verify-integrity.sh`. The script has drifted
  against current ARC surfaces: it expects retired workflow filenames, treats bash-invoked `0644` helper scripts
  as broken, warns on Husky-managed hooks despite documented support, and is unclear against the newer
  `arc health` diagnostic path. As a result, `arc-verify` is noisy enough to mislead handoff / setup work.
- _Fold-in:_ when re-evaluating `arc-verify` placement, decide whether to retire the shell verifier in favor of
  `arc health`, keep it as a narrower install-health diagnostic, or replace the skill entry with workflow / CLI
  guidance that reflects the current health surface.

---

### `[ ]` **Make `/arc-plan` self-establish the grooming locus on ad-hoc (cold) entry**

- _Routed from:_ live friction during `recovery-hardening` grooming, ad-hoc `/arc-plan` invoked outside
  session-init (2026-07-04).
- _Concern:_ a sharper, concrete instance of § _Guard ARC skills against cold (no-session-init) invocation_
  below — not just missing orientation, but a missing **locus**. `draft-design`'s "Grooming-entry skip" assumes
  you already sit on a committable grooming branch, because `session-init`'s `--plan` signal-leaf relocates to
  `chore/groom-<slug>` cut from base. Invoked cold (`/arc-plan` direct, no session-init) that relocate never ran:
  entry landed on protected `main`; the planning-entry gate correctly redirected (`protected-base`), but the
  redirect→stub route mints the stub **without** relocating onto a grooming branch to draft on. Had to
  hand-stitch the sanctioned path: `arc plan check` → manual `git checkout -b chore/groom-<slug>` →
  `arc stub … --commitment planned --priority` → author the draft. Two further snags: (1) the stub-then-groom
  sequence for a **non-existent** stub is not a gapless single entry — `--plan <stub>` grooms an _existing_ stub,
  so ad-hoc "create and groom a new stub" has no one door; (2) a stale dev build surfaced mid-flow (`dist`
  stale post-merge) and the CLI-driven ceremony silently depends on a fresh build.
- _Design fork (needs thought):_ the general cold-invocation entry below leans **advisory / warn** ("run
  `arc-session` first"). This instance argues a stronger shape for grooming — the `arc-plan` skill **door** should
  carry entry-triage/dispatch judgment and **self-establish** the locus (relocate to grooming branch +
  stub-if-missing), mirroring session-init's `--plan` relocate, rather than only warning. That is skill-door-model
  work (kin to § _Codify the skill-door model_). The underlying **mechanic** (protected-base → auto-cut/offer the
  grooming branch) is kin to `cold-start-init-polish` facet 2 (`arc start --here` protected-base auto-cut) and may
  live there, while the "which door owns ad-hoc grooming entry" decision lives here. `planning-iteration-mechanics`
  is adjacent (planning pipeline) but owns iteration _content_, not entry _establishment_.
- _Captured during:_ `recovery-hardening` grooming via ad-hoc `/arc-plan`, 2026-07-04.

## Scope (routed captures — iterate into a plan)

### Standardize ARC skill frontmatter to the agentskills.io spec

ARC's SKILL.md frontmatter (`name` / `description` / `disable-model-invocation`) largely matches the
agentskills.io spec (<https://agentskills.io>) already; confirm two points and trim accordingly:

- Is `disable-model-invocation` actually part of the universal spec, or a Claude-only extension?
- Does it earn its place — it is `false` on every skill except `arc-setup` (`true`), and if `false` is the
  harness default, those redundant `false` declarations are just noise to drop (keep `arc-setup: true`, which is
  load-bearing).

Touches every skill's SKILL.md under `.arc/system/.internal/skills/` + the package mirror + the harness-regen
path.

### Re-evaluate skill-vs-workflow placement of `arc-setup` (and possibly `arc-verify`)

Surfaced by the `arc-resume` → `arc-session` rename: `arc-session` (used every session) now collides on
tab-completion in the skill picker with `arc-setup` (used once when first installing ARC), and the rarely-used
name keeps stealing autocomplete from the every-session one. The collision is the prompt; the deeper question is
whether a once-per-install operation should hold skill inventory at all. Evaluate per skill — `arc-setup` is the
clear case for "should be a workflow, invoked when needed, not a skill"; `arc-verify` is a weaker case
(occasionally invoked for diagnostics) but probably the same call.

**Scope of move (per skill that migrates):** retire the SKILL.md source under `.arc/system/.internal/skills/<name>/`
plus the package mirror; update the harness-regen path so the gitignored harness copies (`.claude/skills/`,
`.codex/skills/`, …) stop being produced for it; route invocations through workflow loading or a CLI command as
appropriate; sweep adopter-facing references ("run the `arc-setup` skill" → "follow the setup workflow").
Side-benefit: frees the skill-picker autocomplete namespace for the every-session skill.

### Guard ARC skills against cold (no-session-init) invocation

- _Routed from:_ in-flight-awareness session (2026-06-02), surfaced during the `arc-errand` revival.
- _Concern:_ every `arc-*` skill assumes a **warm** session — that `arc-session` has run and established
  context — yet none guard against being invoked **cold** (the first action in a fresh agent context). The
  agent would comply but operate without the orientation the entrypoint provides. This was implicitly the
  original argument against a standalone `arc-errand` (cold launch would duplicate session-init), but the
  concern is **general to all skills**, not errand-specific — so it belongs here, not as an errand caveat.
- _Possible shapes (evaluate, don't assume):_ (a) a one-line advisory in each SKILL.md ("an ARC skill — run
  `arc-session` first if you haven't") — cheap but ignorable; (b) a mechanical guard: `session-init` **plants**
  a session marker, `session-handoff` **removes** it, and skills (or a CLI preflight) short-circuit with an
  advisory when it is absent. Agent-session warmth is not git-visible, but a lifecycle-bookend marker makes it
  durable.
- _Caveats for the marker shape:_ a crashed / abandoned session never runs handoff → stale marker (needs
  re-plant-on-init reconciliation or a TTL); non-`arc-session` entrypoints (errand-resume, materialize) must
  plant it too; possible reuse beyond this — interrupted-session detection.
- _Relation to this stub:_ same cross-cutting "every SKILL.md + harness-regen path" surface as the frontmatter
  item above; the marker half also reaches the session lifecycle (`session-init` / `session-handoff`).

---

## Scope Estimate

Small–medium; touches every SKILL.md under `.arc/system/.internal/skills/` + the package mirror + the
harness-regen path, plus adopter-facing skill references. Carries a design question (which once-per-install
skills migrate, and to workflow vs. CLI).
