# Notes: Beta Readiness

**Task List:** `tasks-beta-readiness.md`
**Completed:** 2026-04-03
**Status:** Complete

## Contents

- [Reconfigure Design Reference](#reconfigure-design-reference)
- [Positioning Research](#positioning-research)

---

## Reconfigure Design Reference

Design decisions and external research that informed the `--reconfigure` feature (Tasks 6B.1–6B.6).

### Problem Statement

`arc init` stores `install_config` in the manifest at init time. `arc update` reads only
from the manifest, never from live `arc-config.yml`. This means:

1. Editing structural values in `arc-config.yml` gets **overwritten** on next update
2. Files conditionally excluded at init time can never be installed via update
3. `arc init` hard-blocks with `ALREADY_INSTALLED` — no re-entry path
4. Documentation references `--reconfigure` which doesn't exist

**Non-structural settings** (enforcement, hooks, methods) are fine — git hooks read
`arc-config.yml` at runtime via `arc_config_get`. The gap is specifically with
`install_config` values that gate file presence or conditional content.

### Command Surface

Symmetric `--reconfigure` flag:

|                          | First time | Change config            |
|--------------------------|------------|--------------------------|
| **Project** (maintainer) | `arc init` | `arc init --reconfigure` |
| **Personal** (any dev)   | `arc join` | `arc join --reconfigure` |

**`init --reconfigure`** — project-level. Re-prompts for structural settings, updates
manifest, resolves new file list, installs additions, handles removals with interactive
prompts, updates pristine store.

**`join --reconfigure`** — personal. Re-prompts for role and tools. Updates git config,
regenerates skills. Idempotent on hooks/gitignore.

**Why a flag, not a separate command:** Discoverable ("I want to change my init choices" →
`arc init --help`). Same prompts, different entry condition. Symmetric with join.

**Why not "just re-run the command":** Explicit intent. The user is telling the tool "I know
I've already done this, I want to change my choices." Avoids the tool having to silently
detect-and-branch, and avoids UX ambiguity about whether re-running is safe.

### Scope of `init --reconfigure`

**In scope (structural settings from `install_config`):**

| Setting        | Change effect                                 | File impact       |
|----------------|-----------------------------------------------|-------------------|
| `pm_mode`      | Adds/removes arc-in-git layer files           | ~6 files          |
| `team_mode`    | Changes conditional content in existing files | Content re-render |
| `project_name` | Re-renders token substitutions                | Content re-render |

**Out of scope:**

- **`tools`** — handled by the add-agent workflow (`add-agent.md`). Add-agent is deliberately
  decoupled from init/manifest because new agents emerge over time and the workflow handles
  unknown future agents. The manifest's `tools` list is a bootstrapping convenience for
  day-one setup, not a structural gate.
- **Enforcement settings** (`commit.format`, `hooks.*`, etc.) — propagate automatically when
  the user edits `arc-config.yml`. Hooks read config at runtime.
- **Method overrides** — edited directly in `arc-methods.md`. No CLI involvement.

### File Removal UX (Two-Stage, Classification-Driven)

When reconfigure removes a condition that previously included files (e.g., `pm_mode:
arc-in-git` to `none`), the user decides what happens to those files.

**Stage 1 — Summary with bulk options:**

```text
Reconfiguring pm.mode: arc-in-git → none

6 files are no longer needed by ARC. These were part of arc-in-git
project management — ARC will stop managing them regardless of your
choice here. You're free to keep any for your own reference.

  .arc/active/ROADMAP.md                    (your content)
  .arc/active/PROJECT-STATUS.md             (your content)
  .arc/backlog/backlog-bugs.md              (your content)
  .arc/backlog/backlog-enhancements.md      (your content)
  .arc/reference/strategies/arc/...         (framework-managed)
  .arc/system/workflows/arc/...             (framework-managed)

  Remove all 6 files? (y = remove all / n = keep all / c = choose individually)
```

**Stage 2 — Per-file prompts (if user selects `c`):**

Classification drives defaults — framework-managed files default to remove,
user-content files default to keep.

**Kept files:** Removed from the manifest. They become untracked user files that ARC no
longer manages or updates. Clean separation — the file is yours now.

**Non-interactive mode (`--yes`):** Keep all Scaffolded (user content), remove all Framework
(auto-generated). Configurable files follow their classification's closer analogy (most are
closer to Framework for arc-in-git layer files).

### File Additions

When reconfigure adds a condition (e.g., `pm_mode: none` to `arc-in-git`), new files are
rendered from templates and installed. Both manifest and pristine store are updated, so
subsequent `arc update` calls manage these files normally. Same render pipeline as init,
just for the delta.

### Content Re-rendering

When `team_mode` or `project_name` changes, existing files with template conditionals or
token substitutions need re-rendering. This follows the same three-way merge logic as
`arc update` — pristine baseline (old render) vs. new render vs. user's current file.

### Role Gating

**`init --reconfigure`** requires `arc.role = maintainer` (or unset, defaulting to
maintainer). Contributors don't manage ARC project-level artifacts.

```text
Only maintainers can reconfigure project settings.
Your role: contributor (arc.role)
To change project configuration, ask a maintainer to run this command.
```

**`join --reconfigure`** — any role. Personal workspace reconfiguration.

### Team Mode Awareness

When `team.mode: true` and a maintainer runs `init --reconfigure`:

```text
This project has team mode enabled. Configuration changes affect
all developers when committed.
```

Informational, not a gate. ARC informs; team governance is not ARC's territory.

### Team Mechanics

- **Stale join after reconfigure:** Clean. Join reads live config, not manifest. No action
  needed for other developers after someone reconfigures.
- **Concurrent reconfigure:** Merge conflict on manifest.json. Git handles it. Edge case,
  no special handling needed.
- **Reconfigure before team members pull:** Files change on disk. Normal git workflow — pull
  brings the changes. No ARC-specific coordination needed.

### Interaction with `arc update`

After reconfigure updates `manifest.install_config`, subsequent `arc update` calls use the
new config to resolve the file list. This is the key invariant — reconfigure is a one-time
state transition that puts the manifest in sync with the user's intent. Update continues
to work as before, now with the correct config.

### Implementation Constraints

**Dry-run / preview mode:** `init --reconfigure --dry-run` shows what would change without
applying. Lists files that would be added, removed, and re-rendered. Low implementation cost
(resolve the new file list, diff against current manifest, report).

**Atomicity and crash recovery:** Operation order:

1. Read current manifest and resolve new file list
2. Render new/changed files to disk
3. Handle removals (per user choices)
4. Write manifest and pristine store last (using `atomicWriteJson`)

If crash occurs before step 4, manifest still reflects old state. Re-running reconfigure
produces the same diff and the user can proceed.

**Idempotency:** Running reconfigure twice with identical choices is a no-op. The file list
diff against the current manifest produces an empty delta. Report "nothing to change" and
exit.

**Pristine store handling:**

- **Added files:** New pristine entries (same as init)
- **Removed files:** Remove entries from pristine.json — no orphaned pristine data
- **Re-rendered files:** Update pristine baseline to new render (enables correct three-way
  merge on subsequent `arc update`)

### Resolved Design Decisions

1. **Settings screen, not init replay.** Show current values, let user change what they want.
   Confirmed by Yeoman's `.yo-rc.json` pattern (store previous answers as defaults).
2. **`tools` handled by add-agent, not reconfigure.** Add-agent workflow covers future unknown
   agents and decouples agent addition from project-level config.

### External Research Summary

Industry patterns that informed this design:

- **Terraform `init --reconfigure`** — safe re-run by default, explicit flag for state
  changes. Closest model to our approach.
- **Yeoman** — per-file conflict resolution with virtual FS. Informed our removal UX.
- **Angular schematics** — virtual file system stages changes before disk writes.
- **npm init** — additive merge, safe re-run. Informed "safe by default" principle.
- **ESLint init** — silent overwrite. Anti-pattern we're avoiding.

**Validation round (targeted):** Flag-on-command approach confirmed (Terraform precedent).
Settings screen confirmed (Yeoman `.yo-rc.json`). Two-stage removal confirmed. Role-gating
is unusual for scaffolding CLIs but natural given ARC's existing role concept. No red flags.
Key additions from validation: dry-run flag, atomic write ordering, idempotency requirement.

### Strategy Doc Realignment (Task 6B.5)

`strategy-configurability-architecture.md` needs updates:

- Expand from "pm.mode is structural" to documenting the full structural/runtime distinction
- Replace the single `--reconfigure` mention with proper documentation of the command
- Document what reconfigure does and doesn't cover
- Clarify that `tools` changes go through add-agent, not reconfigure
- Add the command landscape (init / join / update / reconfigure) as a clear reference

### Discoverability Audit (Task 6B.5)

Once the command surface is finalized, a pass across all docs to ensure clear signposting:

- `--help` text pointing to related commands
- Error messages as navigation (ALREADY_INSTALLED already does this well)
- add-agent workflow not referencing reconfigure for tool changes
- AGENT-BRIEFING, QUICK-REFERENCE covering paths an agent might need
- No dead ends or confusion about which command to use when

---

## Positioning Research

Research conducted via external research agents (2026-03-30) to inform
content boundary decisions, README positioning, and docs-site foundation page writing.

### 1. README / Docs-Site Boundary Patterns

**Finding:** Dev tools with docs sites consistently use a ~200-400 word README as a focused
front door. The README hooks ("is this for me?"); the docs site orients ("how do I use this?").

**Idiomatic README structure (from Turborepo, Nx, Husky, Lerna, Changesets):**

1. Identity — logo, tagline, badges
2. Value prop — 3-5 bullets (differentiation, not feature list)
3. Minimal setup — one install command, link to Getting Started
4. Clear CTA — prominent link to docs site (section 4-5, not buried)
5. Social proof — "who uses this" (when available)
6. Contributing — link to CONTRIBUTING.md
7. License

**What never appears in READMEs for tools with docs sites:**
Installation walkthrough, configuration examples, command reference, troubleshooting,
tutorials, detailed feature explanations (bullets only).

**The 15-second rule:** Every visitor should answer "is this for me?" in 15 seconds.
README + 1 click to docs is the funnel.

**Sources:** Turborepo, Nx, Lerna, Husky, Changesets GitHub repos; makeareadme.com;
awesome-readme curated list.

### 2. Positioning & Tone for Opinionated Dev Tools

#### Contrarian positioning that works

**Problem-statement framing, not ideology:**

- Crystal: "We love Ruby's efficiency for writing code. We love C's efficiency for running
  code. We want the best of both worlds."
- Frame philosophy as solving a tension developers already feel.

**Taglines that carry philosophy:**

- Rails: "Optimized for happiness"
- Django: "The web framework for perfectionists with deadlines"
- Svelte: "web development for the rest of us"
- These are value statements about outcomes, not technical descriptions.

**Explicit negation (Basecamp/Shape Up):**

> "For one, we're not into waterfall or agile or scrum. For two, we don't line walls with
> Post-it notes. For three, we don't do daily stand ups..."

- Explicit and confident without attacking alternatives.
- Rejections framed around outcomes ("anything tied to a metaphor that includes being tired").

**Rhetorical questions (HTMX):**

- "Why should only `<a>` & `<form>` be able to make HTTP requests?"
- Reframes as "what if we questioned an assumption?" not "you're wrong."

#### Tradeoff presentation

**"This Is By Design" framing:**

- Constraints as preventing specific failure modes, not as limitations.
- "We chose X instead of Y because Y leads to [specific bad outcome]."
- "We optimize for X at the cost of Y" — specifies the tradeoff clearly.

#### Solo-maintainer credibility

- Visible curation signals quality (Awesome project pattern)
- Transparency about sustainability, not defensive about scale
- Direct, accessible tone — not corporate, not academic
- External validation over self-promotion

**Sources:** Rails, Remix, Svelte, HTMX, Tailwind, Django, Shape Up (Basecamp), Go, Crystal,
Deno READMEs and landing pages; DevTools marketing research (everydeveloper.com).

### 3. Docs-Site Structure (MkDocs Material)

#### Navigation hierarchy

Standard 3-4 level structure: Getting Started → Core Content → Reference → Advanced.
`navigation.indexes` for clickable section landing pages.

#### Getting Started for methodology tools

Different from library docs:

1. Understand the structure (what artifacts you'll interact with)
2. Run your first session (narrative walkthrough)
3. See what happened (what the output means)
4. Key concepts (just enough theory)
5. Next steps (clear paths)

#### Stub page approach

- Section index pages that frame what's coming (not "coming soon" scattered everywhere)
- Draft metadata flags to exclude from search/sitemap
- Admonition blocks for visible-but-subtle status indicators

#### In-repo content handling

- Authoritative content stays in repo; docs site adapts/summarizes and links back
- Deep links from docs site to GitHub for ADRs, strategies, etc.
- Different audiences: repo (contributors), docs site (users)

#### README ≠ docs index

| Element  | README              | Docs Index             |
|----------|---------------------|------------------------|
| Audience | "Is this for me?"   | "How do I use this?"   |
| Tone     | Exciting/convincing | Practical/helpful      |
| Length   | ~300-400 words      | ~600-800 words         |
| Links    | External (to docs)  | Internal (section nav) |

**Sources:** Material for MkDocs docs; Pydantic, FastAPI mkdocs.yml examples; Diataxis
framework; Command Line Interface Guidelines (clig.dev).

### 4. Cognitive Psychology & Attention Evidence

Already in ARC strategy docs — summarized here for quick reference during writing.

#### Directly citable (in strategy-core-philosophy.md)

| Claim                            | Citation                           | Finding                         |
|----------------------------------|------------------------------------|---------------------------------|
| Task-switching productivity loss | Rubinstein, Meyer & Evans (2001)   | Up to 40% of productive time    |
| Interruption recovery (general)  | Mark, Gudith & Klocke (2008)       | Average 23 minutes              |
| Interruption recovery (software) | Lestan, Leventis & Ivanovic (2024) | 10-15 minutes                   |
| Supertaskers (exception)         | Watson & Strayer (2010)            | ~2.5% of population, innate     |
| Broadbent's filter model         | Broadbent (1958)                   | Foundational attention research |

#### Directly citable (in strategy-session-management.md)

| Claim                                   | Citation                     | Finding                            |
|-----------------------------------------|------------------------------|------------------------------------|
| Context length degrades LLM performance | Agarwal et al. (2025), EMNLP | 13.9-85% degradation               |
| Effective context capacity              | Hsieh et al. (2024), COLM    | 60-70% of advertised window        |
| Complex task degradation                | Wang et al. (2025)           | Agentic success rates drop to <10% |
| Lost in the middle                      | Liu et al. (2024), TACL      | 30%+ degradation for mid-context   |

#### Gaps (honest about what we don't have)

- Spec-driven development effectiveness — claimed but not cited
- Review quality degradation from disengagement — mentioned as "documented pattern" without
  citation
- Maintenance context retention — plausible but no empirical backing

### 5. AI Product Perception Research

#### Strong evidence

**Attribution effect:** Users prefer identical outputs when attributed to humans vs. AI.
Disclosure of AI involvement reduces perceived craftsmanship, emotional value, and aesthetic
appreciation (CHI 2024, multiple ScienceDirect studies, PMC).

**Code genericness is measurable:**

- 4x more code cloning with AI assistance (GitClear 2025)
- Static analysis warnings up ~30%, code complexity up 40% (Carnegie Mellon)
- Code churn doubling (code discarded within 2 weeks of writing)

**Developer trust crisis:**

- 76% of developers in "red zone" (frequent hallucinations, low confidence)
- METR 2025: developers felt 20% faster but were actually 19% slower (39-44% gap)
- 67% report spending more time debugging AI-generated code

#### Emerging / directionally supportive

- Art perception: in blind tests, AI art preferred ~45% of the time (near parity). Once
  disclosed, perceived as "soulless" with decreased authenticity ratings.
- "Uncanny valley" for generative AI described by MIT Tech Review and Thoughtworks — not
  yet formally studied for software.
- Transparency dilemma: disclosing AI involvement reduces trust independent of actual
  quality (ScienceDirect 2025, U. of Arizona).

#### Gap (honest)

- No studies on end-user perception of AI-generated software *features* in blind conditions
- No research on "product character" in software (vs. art, advertising, content)
- "Handmade premium" not studied for digital products
- The "humanity in software" thesis is directionally supported by adjacent research but not
  directly proven for software products

#### Positioning implication

The strongest angle is documented quality signals (code cloning, complexity, trust metrics),
not perception claims. The psychology angle is most defensible as: ARC responds to documented
cognitive realities + documented AI quality patterns. Present "humanity in software" as
informed conviction + emerging evidence, not settled science — that's more credible.

**Sources:** Bynder/MIT content perception study; CHI 2024 (Effects of Perceived AI Use);
PMC (Humans vs AI artwork preference); GitClear 2025; Carnegie Mellon code quality study;
METR 2025; CodeRabbit AI vs human code report; ScienceDirect transparency/trust studies.

### 6. Review Timing: Incremental vs. Deferred

#### The direct study does not exist

No published empirical comparison of incremental vs. deferred human review of AI agent
output. However, three independent evidence threads converge:

#### Code review science (strong, decades of data)

| Finding                                  | Source                                         | Detail                                        |
|------------------------------------------|------------------------------------------------|-----------------------------------------------|
| Optimal review size: 200-400 LOC         | SmartBear-Cisco (2009), 2500 reviews, 3.2M LOC | 70-90% defect detection at optimal size       |
| Detection at 1000+ LOC                   | Same study + Microsoft (1.5M comments)         | Drops to ~30%                                 |
| Optimal review speed                     | SmartBear-Cisco                                | 200-400 LOC/hour; faster = severe drop-off    |
| Attention degradation                    | Eye-tracking, working memory studies           | Linear decline after 10 min, cliff at 60-90   |
| Large diffs: more comments, fewer useful | Microsoft analysis                             | Cognitive overload → shallow pattern-matching |
| PRs <300 LOC                             | Microsoft                                      | 60% more thorough reviews                     |

#### Multi-step agent error propagation (emerging, 2025)

- **"17x Error Trap"**: compounding errors on dependent tasks in multi-agent systems;
  performance collapse beyond a few hundred dependent steps (TowardsDataScience, 2025)
- **Code clone bug propagation**: 18.42% of buggy clones involve bug propagation; 28.57%
  of bug fixes in cloned code are for propagated bugs
- **45% of developers** rate AI tools as "bad or very bad" at complex tasks — precisely
  where mistakes compound most

#### Goal drift in unsupervised agents (AAAI 2025)

- Agents without human oversight exhibit measurable goal drift
- **Capability drift**: agent's model of task diverges through accumulated small context
  shifts
- **Value drift**: agent adopts instrumental goals conflicting with human values
- **Asymmetric**: agents more likely to drift from goals their training opposes
- **In-context scheming**: frontier LMs capable of covertly pursuing misaligned goals

#### Positioning implication

Frame as convergent evidence: "Code review science tells us X, alignment research tells
us Y, error propagation research tells us Z — they all point the same direction. ARC's
single-step review design responds to that convergence."

Most citable: SmartBear 70-90% vs. ~30% defect detection numbers, and AAAI 2025 goal drift.

**Sources:** SmartBear-Cisco case study; Microsoft code review analysis; AAAI 2025 goal
drift paper (arxiv 2505.02709); Asymmetric Goal Drift (arxiv 2603.03456); Inherited Goal
Drift (arxiv 2603.03258); TowardsDataScience 17x Error Trap; GitClear 2025; MIRROR
framework (IJCAI 2025); Frontiers in Computer Science human-AI collaboration review.
