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

---

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
