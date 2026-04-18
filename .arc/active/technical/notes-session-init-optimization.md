# Notes: Session-Init Optimization

## Contents

- [Alternatives Considered](#alternatives-considered)
- [Compliance-Reliability Grounding](#compliance-reliability-grounding)
- [Phase Sequencing Rationale](#phase-sequencing-rationale)
- [Risks and Mitigations](#risks-and-mitigations)
- [Research References](#research-references)

---

## Alternatives Considered

Five alternatives evaluated during exploration; the selected approach (E) is the
four-strategy coordinated plan now captured in the PRD requirements.

**A. Status quo (belt-and-suspenders front-load).** Keep current loadset. Rejected —
current cost (~75–80k at orientation completion) is high enough that adopters may abandon
the framework rather than internalize the orientation ceremony. Reliability argument is
weaker than it appears; most loaded content is rationale, not operational.

**B. Sibling defaults files for arc-config / methods / extensions.** Split each into
user-values + framework-defaults sibling files. Rejected — research found no AI-dev tool
uses sibling `.defaults` files; production patterns are either hard-coded defaults
(Biome/Vite/Prettier) or rich inline comments in a single file (TypeScript). Splitting
methods/extensions damages authoring UX (two-file lookup for overrides).

**C. Grep-filter reads on single arc-config.yml.** Keep the file intact, extract
key-value pairs via grep at init. Rejected — research found this pattern is novel in
AI-dev tools (Cursor, Aider, Claude Code, Continue all read config files in full) and
carries documented drift risks (silent filter misalignment as format evolves).

**D. Pure JIT via imperative prose triggers.** Remove front-load entirely; rely on
in-workflow prose to trigger loads. Rejected as sole mechanism — research documented
reliability problems in mid-task / full-window / edge-case contexts. The core insight
(ARC already ships explicit workflow references) is preserved via the thin-index +
explicit-reference hybrid: the index provides compliance awareness, the explicit
references drive loads.

**E. Four-strategy coordinated approach (selected).** Per-file methods/extensions +
operational-context audit + anchored partial-reads + session-type conditional loading.
Each strategy targets a distinct content shape; none depends on novel patterns; all have
production precedent. Captures architectural, content, and conditional savings that
compound.

---

## Compliance-Reliability Grounding

Research identified production tools' trigger-reliability problems as specific to
*conversational-intent-matching* (agent decides whether skill X applies based on user
utterance). ARC's triggers are *explicit named references* inside workflow prose ("follow
the commit-format method") — structurally closer to link resolution than intent
classification, and empirically reliable in current ARC use.

The thin front-loaded index serves **awareness and compliance reassurance, NOT dispatch.**
ARC's value remains the explicit workflow model; methods and extensions remain
framework-fixed (adopter-dropped files would be orphaned without corresponding workflow
references).

**Constitutional rule framing — absolute, no hedges.** Compliance-reliability research
(AGENTIF instruction-following benchmarks, constitutional-rule audits, motivated-reasoning
studies) found conditional hedges on compliance rules create rationalization surfaces —
the agent self-grants the condition and skips the load. Positive absolutes measurably
outperform conditionals. Meta-constraint confusion between a hedged constitutional rule
and an unhedged in-workflow reminder compounds the effect. In-workflow references must
use semantically aligned framing (absolute, not hedged). Misalignment between
constitutional and inline venues degrades compliance more than either framing alone.

**Baseline scope of the reliability claim.** Near-zero failure rate holds for
Claude/Codex-class agents with focused, well-specified workflows; degrades in long
sessions, nested conditionals, and on weaker procedural-adherence models. ARC's
focused-session discipline already mitigates the primary degradation vector.

---

## Phase Sequencing Rationale

Why the phases land in this order:

- **Trigger completeness before front-load removal.** If a method or extension lacks a
  reliable workflow trigger, removing its front-load guarantees a load failure at first
  reference. Phase 1 (trigger audit) is the safety precondition for everything downstream.
- **Constitutional rule with or before removal.** The rule anchors compliance durably
  across sessions. Landing it early (Phase 2) ensures the behavior is governed before the
  removal lands, rather than assuming agents will discover the rule later.
- **Methods/extensions restructure before content audit.** The restructure moves method
  and extension bodies out of the always-loaded set; the audit then applies to remaining
  always-loaded content. Ordering the opposite way audits content that's about to be
  removed entirely — wasted effort.
- **Content audit before session-init restructure.** The session-init workflow's own
  restructure depends on knowing which files ended up slim and which retained full load.
  Restructuring first would commit to a batch structure that then doesn't match the audit
  outcomes.

---

## Risks and Mitigations

1. **Audit quality risk.** Over-aggressive extraction could lose operational content.
   *Mitigation:* retention heuristic (flow / counterintuitive / confusing-if-absent),
   spot-check verification during Phase 8, case-by-case judgment throughout Phase 4.

2. **Compliance risk from front-load removal.** Even with thin index + explicit references,
   behavior shift may expose edge cases. *Mitigation:* constitutional rule (Phase 2) lands
   before removals (Phase 3–4); trigger completeness audit (Phase 1) catches gaps; Phase 8
   verification measures correctness.

3. **Per-file restructure cross-reference drift.** Many workflows reference methods and
   extensions by anchor. Moving to file-paths requires updates across the codebase.
   *Mitigation:* automated grep-and-replace pass; pre-commit D7a link-resolution check;
   Phase 3 explicitly scoped to include all cross-reference updates.

4. **Docs-content-sweep coordination lag.** Staging file produces docs-content-sweep
   inputs, but docs-content-sweep activates only after docs-site migration merges.
   Extracted content may sit for weeks before integration. *Mitigation:* staging file is
   self-contained and durable; link placeholders in slimmed files are greppable so
   integration completeness is verifiable at docs-content-sweep time.

5. **Measurement target may not hit.** Success criteria project ~25% observation
   reduction; actual may differ. Low-end modeling is tight against the threshold.
   *Mitigation:* measurement is a reporting metric, not a gate beyond the ≥25% threshold;
   P1.14 (DEV-RULES section-level partial-reading) adds margin; if delta is materially
   short (>30% below), Phase 8 surfaces the gap for analysis rather than blocking
   archival.

6. **DEV-RULES partial-read reliability.** Shifting rule sections to conditional-load
   creates a class of failure where an agent executes a session without a governing rule
   it should have loaded. *Mitigation:* per-rule reliability gate — conditional-load only
   when trigger is clearly detectable at session-init; otherwise default to up-front load.
   Safety-floor is always "up-front load remains correct."

---

## Research References

Thirteen external research investigations conducted in two passes during plan refinement.

### Plan development pass (nine investigations)

- **Config file design idioms** — ESLint, Prettier, TypeScript, Biome, Vite. Outcome:
  ruled out sibling defaults file and grep-filter reads; both are novel/risky.
- **Agent context-loading patterns** — Cursor, Claude Code, Aider, MCP. Outcome: thin
  index + explicit references is the production pattern; pure JIT via intent matching is
  unreliable.
- **Prompt caching impact on context organization** — stability of front-loaded content
  vs. frequent reshuffles.
- **Grep-filter read pattern prior art** — ruled out as novel across evaluated AI-dev
  tools.
- **Hybrid index+body pattern mechanics** — Cursor rules, Claude Code skills, MCP
  progressive disclosure. Outcome: per-file frontmatter with aggregated index.
- **Token reduction angles beyond architecture** — content compression, link-not-inline,
  session-type loading.
- **Hidden/internal directory conventions** — ruled against `.internal/` for
  human-readable content.
- **Reference-by-link audit heuristics** — Mintlify, `/llms.txt`, agent-doc anti-patterns.
  Outcome: concrete retention heuristics (flow / counterintuitive / confusing-if-absent).
- **Session-type conditional loading patterns** — Cursor modes, Aider architect.
  Outcome: explicit signal via `Working On:` field prefix with auto-inference.

### Compliance-reliability validation pass (four investigations)

- **Procedural instruction-following reliability in long-horizon agent tasks** — IFEval,
  AGENTIF, agent drift, model-specific adherence. Outcome: near-zero failure rate holds
  for focused workflows on capable models.
- **Structural phrasing patterns for embedded procedural instructions** — declarative vs.
  imperative, positive vs. negative framing, hedge effects, XML-tag attention boundaries.
  Outcome: declarative framing preferred where natural; hedges eliminated; XML tags
  reserved for shape boundaries (D7b).
- **Thin front-loaded index vs. pure JIT compliance** — Claude Skills, Cursor Rules,
  MCP, RAG-MCP ablation findings. Outcome: thin index + explicit references beats pure
  JIT in reliability and beats heavy front-load in token cost.
- **Constitutional rules vs. in-workflow inline reminders** — system-prompt decay,
  meta-constraint confusion, venue alignment requirements. Outcome: both venues matter;
  semantic alignment (absolute framing in both) is a compliance multiplier.

### Related strategies and ADRs

- `strategy-session-operations.md` — context loading tiers
- `strategy-configurability-architecture.md` — override mechanisms
- `strategy-package-project-sync.md` — two-copy discipline
- `strategy-task-list-formatting.md` — in scope for P1.4 restructure
- ADR-013 (method loading model) — Tier 2 amendment in scope; reflects constitutional
  rule addition and per-file restructure

### Consumer WU

- `plan-docs-content-sweep.md` absorbs Phase 4 extractions via
  `notes-docs-content-sweep.md` staging file
