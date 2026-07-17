# Analysis: Agentic-PM Storage Landscape (2026-07)

**Purpose:** Research grounding for the storage-substrate grooming pass (arc-backend / local-mode /
storage check-doc). Surveys how the industry stores and coordinates AI-agent-facing planning artifacts as
of mid-July 2026, to validate or pressure ARC's git-backing-store target against the state of practice.

- **Method:** One `heavy-research` adversarial workflow run (2 verified findings; 36 extracted claims
  salvaged from its journal as unvetted leads) plus four targeted single-pass analyst sweeps (beads/grite
  primary sources; Archil and shared-FS products; spec-tool storage shapes; team-scale crossover
  evidence). Plus a directed read of Swamp's architecture manual.
- **Epistemics:** Items marked **[verified]** survived a 3-vote adversarial skeptic pass. Everything else
  is primary-source-grounded but single-pass. Where evidence is absent, that absence is stated — this
  space has low convergence and thin public team-scale evidence; treat absence as "undocumented," never
  "not happening."
- **Created:** 2026-07-17 (grooming branch `groom/storage-substrate`)

---

## Executive summary

The industry has arrived at ARC's decision space from multiple directions and split into identifiable
camps, with **no convergence winner** — which itself is decision-relevant: designing one substrate that
scales across tiers (rather than betting one camp is "the" answer) is defensible against the evidence.
Specific validations: a separate-git-repo planning store now exists as a shipped industry feature
(OpenSpec Stores); an append-only-event-log-in-git-refs with materialized view exists as a designed
system (grite); unguarded shared-mutable state demonstrably loses writes silently **[verified]**; and the
most authoritative team-scale guidance (Anthropic's) defends in-repo co-location, solved by hierarchy —
with *no documented case* of a team crossing over to external storage under scale pressure. The sharpest
cautionary tale is beads' canonical-store churn (JSONL-in-git → Dolt DB → partial walk-back within ~5
months), which is precisely the seam ARC must resolve explicitly (git-canonical, always) rather than
drift across.

---

## 1. Storage topologies observed in the wild

| Camp | Exemplars | Canonical store | Notes |
| --- | --- | --- | --- |
| In-repo tracked markdown | spec-kit (~121k★), OpenSpec core (~61k★), Kiro specs, backlog.md, TASKS.md | code repo working tree | Dominant by adoption volume; team story = branches + PR + decomposition |
| Separate planning git repo | **OpenSpec Stores (beta)**, Kiro central-spec-repo pattern, "private knowledge repo" pattern | standalone git repo | "A store is just a git repo. You commit, push, pull... yourself" — closest analog to ARC's substrate |
| Git refs outside worktree | **grite** (`refs/grite/wal`), beads sync (`refs/dolt/data`), Agent Note / git-ai (`refs/notes` provenance) | same repo's ref layer | Solves history noise, not privacy — same limit ARC identified for notes |
| DB-canonical | beads current (Dolt), Task Master team mode (Hamster cloud), Augment Cosmos | database / hosted service | Team tiers of file-based tools tend to jump here |
| CRDT operation stream | Zed **DeltaDB** (announced 2026-06-11, waitlist) | op log, git as complement | "Before and between commits" collaboration layer |
| Shared filesystem | Archil (S3-as-POSIX, delegation locks), Turso AgentFS (SQLite-FS) | cloud FS / DB-file | Emerging "file systems for agents" category (Amplify, 2026-07) |

Key per-tool findings:

- **OpenSpec Stores** (beta): a standalone git repo holding the identical `openspec/` planning shape;
  code repos point at it via config; explicitly motivated by cross-repo features and platform-team
  ownership with read-only consumers. Git-only — no service, no auto-sync, one checkout per store per
  machine. This is the strongest industry precedent for ARC's tier-3 "shared plain git remote"
  configuration.
- **beads** (Yegge): launched 2025-10 as JSONL-in-git-canonical + SQLite cache; migrated 2026-02 to
  Dolt-canonical with JSONL demoted to "export, not source of truth"; the server-mode migration broke
  solo users ("tasks disappear... unusable"), and 2026-04 "Beads Classic" restored an embedded-Dolt solo
  mode. Explicitly *not* for org-wide tracking (~500-issue guidance, moderate confidence). Documented
  failure modes: resurrection after deletion, sync edge cases across db/JSONL/git. **Lesson: the
  canonical-home seam, left ambiguous, generates churn and data-loss bugs; resolve it by fiat.**
- **grite** (arXiv 2606.19616): "the git WAL is the source of truth, the CRDT projection a materialised
  view over it" — append-only content-addressed (BLAKE2b, optional Ed25519-signed) event log in
  `refs/grite/wal`, advisory TTL leases in `refs/grite/locks`, materialized KV view rebuilt from the log.
  Nearly a blueprint of ARC's tier-3 concurrency answer (event-log-in-git + version-checked coordination
    - views). **Caveats:** single-author research prototype (~8★), all results synthetic (no real-LLM-agent
  data), co-location assumed (no separate-repo mechanism, no privacy stance). Its experiments found
  advisory leases *alone* increase redundant work; leases + shared state eliminate it — exclusion and
  shared visibility are jointly necessary.
- **Task Master / Hamster**: cleanest example of the file-solo/DB-team split ARC is *avoiding* — solo
  mode is `.taskmaster/` files in-repo; team mode relocates canonical state to the vendor's cloud. Built
  on an explicit storage-backend abstraction (file vs cloud) — the seam pattern itself is validated even
  where the team-tier choice differs.
- **Archil**: S3-bucket-as-POSIX-filesystem, repositioned "the cloud filesystem for AI"; strong
  read-after-write between clients, but multi-writer = mandatory single-writer-per-path delegations
  (`checkout`/`checkin`, `--force` seizure loses unsynced writes). A shared-workspace layer, not a merge
  system — orthogonal to ARC's substrate, not a competitor to it. Seed 2025 ($6.7M), Series A ~2026-04
  (~$11M, aggregator-sourced).
- **Git notes**: real 2025-2026 production uses exist — Agent Note (`refs/notes/agentnote`) and git-ai
  (Agent Trace spec, also implemented by Cline/OpenCode) — but exclusively for *commit-anchored
  provenance metadata*, which is notes' natural shape. Nobody surveyed uses notes for freestanding PM
  records; both beads and grite chose custom ref namespaces, citing/implying the same warts ARC's
  git-notes verdict names (fetch/push defaults, one-note-per-commit model).

## 2. Multi-writer concurrency evidence

- **[verified]** Unguarded shared-mutable state silently loses concurrent writes: 4 Letta agents
  appending to one shared memory block lost 18/24 appends to last-writer-wins across six rounds. The
  loss is *silent* — no writer learns it happened. Direct empirical support for storage Principle 3
  (version-checked writes; a stale read only causes harm via a later unchecked write).
- Production, not theory: LangGraph-style shared-state channels produce lost-update bugs in deployed
  apps (ByteDance deer-flow reproduced case; ≥34 third-party repos with concurrent-update error issues).
  Actor/message-passing architectures avoid the class by construction — architecture determines
  susceptibility.
- CRDTs converge structurally but leave 5–10% *semantic* conflicts (600-trial CodeCRDT study) —
  structural merge ≠ meaning merge. Supports ARC's stance: CRDTs are the wrong tool for prose artifacts;
  ownership discipline + review carries semantic correctness, git merge is the backstop.
- Concurrency-control overhead is bounded (~1.6–2.3× worst case, ~8% typical claimed) — version-checking
  is not expensive.

## 3. Privacy on public repos

Thin evidence; no named "keep agent planning private beside public code" pattern found. What exists:
private knowledge-repo patterns (business-sensitive docs in a separate private git repo — the general
pre-AI logic ARC's (c) driver extends), and a single-blogger private-workspace-repo-plus-submodules
pattern. OSS discourse is consumed by *inbound* AI-slop contributions, not artifact privacy. The CISA
public-repo exposure (844 MB sensitive material, 2025-11→2026-05) illustrates the general risk class.
**Implication:** ARC's privacy tier is ahead of documented practice, not behind it; no prior art
invalidates the separate-private-repo answer, and the general pattern points the same way.

## 4. History / PR noise

The best-evidenced pain point, though mostly about AI *code* volume: agent PRs ~4M (2025-09) → 17M+
(2026-03); blame breakage from agent authorship is an active GitHub-community pain point. Practiced
mitigations: `.git-blame-ignore-revs` for bot commits, author-amending, a proposed `Generated-By:`
trailer, branch-naming conventions — trailer-based filtering is exactly ARC's planned
`Arc-Maintenance:` mitigation, and `Co-authored-by:` is reported *unreliable* (stripped in squash
flows), so a dedicated trailer is the right call. Planning-artifact churn specifically: TASKS.md's
delete-completed-tasks philosophy ("git log is your history") is the one named mitigation — consonant
with ARC's records/projection direction (don't accrete state in tracked files).

## 5. Team-scale crossover — the honest null result

No documented case of a team migrating planning artifacts out of the repo under scale pressure. The most
authoritative guidance (Anthropic large-codebase docs) defends in-repo co-location to 200+ developers via
*hierarchy* (lean root + nested context files) and PR-governed context changes. PM-SaaS-via-MCP as a
primary agent planning store is a 2026-Q1/Q2 *vendor capability* (Notion agents API 2026-05, Atlassian
Rovo MCP GA 2026-02), too new for any practitioner track record; Linear-adjacent commentary suggests
causality runs from "already Linear-centric" to MCP use, not from markdown-planning teams migrating.
**Implication:** the tier-4 coordination service has no demonstrated demand at 5–50 scale; deferring it
to provisional is evidence-aligned, and ARC's tier-1 default remains squarely in the mainstream. The
crossover *pressures* (concurrency, privacy, noise) are individually evidenced even though no public
crossover story exists yet.

## 6. Swamp (swamp-club) — adjacent-system precedents

Different domain (agent-operated infrastructure automation, engine-executed DAGs), but three transferable
precedents from its manual:

- **Authority-domain homing:** its run tracker deliberately lives in *local* SQLite, not the shared
  datastore ("a PID is meaningful only on the machine"), with remote visibility via query — the
  query-don't-replicate scope principle.
- **Provenance, not isolation — except the private class:** Giga-Swamp namespaces share everything with
  attribution ("no access controls between namespaces"), *except* secrets/vaults, which "remain
  repo-local regardless of namespace configuration." Independent arrival at the asymmetric scope model:
  shared operational data visible-with-provenance; the genuinely-private class structurally never enters
  the shared store. Direct precedent for per-user private stores for `SESSION-NOTES`/`WORKING-MEMORY`.
- **Retention as explicit policy:** versioned immutable data layer with configurable GC/data-lifetimes —
  precedent for making backing-store history compaction a named policy axis rather than an accident.

## Implications for the grooming pass (decision-mapped)

1. **Git-canonical, resolved by fiat** — the event log and all records live in the store repo; any
   future service fronts the same ledger (service-optional invariant). Beads' churn is the cost of
   leaving this ambiguous; grite and OpenSpec Stores are the working precedents for resolving it git-side.
2. **Tier-3 as shared plain git remote is industry-validated** (OpenSpec Stores), and tier-4's deferral
   to provisional is evidence-aligned (no demonstrated service demand at target scales; the calibration
   note's out-of-band-coordination finding still stands).
3. **Version-checked writes and entry-granular records are empirically load-bearing** [verified Letta
   loss; production LangGraph bugs]; CRDTs remain rejected for prose (semantic-conflict residue).
4. **Scope model:** per-user private stores as the user-scope default gets an external precedent
   (Swamp's vault asymmetry); no industry pattern contradicts it.
5. **`Arc-Maintenance:` trailer confirmed** as the idiomatic noise mitigation; do not rely on
   `Co-authored-by:`-style trailers (stripped in practice).
6. **Notes retirement rationale strengthened:** notes' living niche is commit-anchored provenance
   (Agent Note, git-ai) — exactly what ARC's user-state usage is *not*; peer systems chose custom refs
   for freestanding records. Cite in the pre-B rationale doc.
7. **In-repo tier-1 stays the honest default** for solo/small — the loudest-adopted camp and the
   authoritative guidance agree; the substrate's job is making the *transitions* cheap when the
   evidenced pressures (privacy, multi-machine, noise, concurrency) actually bite.

## Source index (primary unless noted)

- Letta shared-block experiment: arxiv.org/pdf/2606.17182 [verified]
- grite paper: arxiv.org/abs/2606.19616; repo: github.com/neul-labs/grite [storage claim verified]
- beads: github.com/steveyegge/beads (README); steve-yegge.medium.com ("Beads Blows Up"); DoltHub blog
  2026-01-27 / 2026-04-02; issue #2573; discussion #2164
- OpenSpec Stores: github.com/Fission-AI/OpenSpec `docs/stores-beta/user-guide.md`
- spec-kit: github.com/github/spec-kit; Kiro: kiro.dev/docs/specs (+ best-practices);
  backlog.md: github.com/MrLesk/Backlog.md; TASKS.md: tasksmd.github.io
- Task Master / Hamster: github.com/eyaltoledano/claude-task-master; tryhamster.com/docs/taskmaster/team
- Archil: docs.archil.com (architecture, shared-disks); AgentFS: docs.turso.tech/agentfs;
  category survey: amplifypartners.com "File systems for agents" (2026-07)
- DeltaDB: zed.dev/blog/introducing-deltadb (2026-06-11); status beyond waitlist unconfirmed as of
  2026-07-17
- git-notes provenance: dev.to Agent Note writeup; github.com/git-ai-project/git-ai
- Team-scale: claude.com/blog large-codebases guide; code.claude.com/docs monorepos; GitHub community
  discussions #184395 / #179983; The Register 2026-05-15; LinearB 2026 benchmarks (secondary)
- Swamp: swamp-club.com/manual/explanation/how-swamp-works, /giga-swamp
- CRDT semantic conflicts: CodeCRDT study (600 trials); MCP incidents: Asana MCP cross-tenant leak,
  Salesforce ForcedLeak (secondary coverage) — all unvetted leads from the heavy-research journal
