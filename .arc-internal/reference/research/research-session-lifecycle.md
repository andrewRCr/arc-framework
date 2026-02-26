# Research: Session State Patterns and Handoff Mechanisms

**Purpose:** Evidence base for Task 1.2 — designing ARC's session state architecture and team
transfer process (Gaps 1, 5).

**Research scope:** Development frameworks, IDE platforms, DevOps state management, collaboration
tools, AI-assisted development tools, version control adjacency, high-reliability handoff
ceremonies, team awareness mechanisms.

**Date:** 2026-02-25

---

## Working Hypothesis Under Investigation

ARC's CURRENT-SESSION.md may conflate two concerns:

- **Project state** — what's next, blockers, task pointers (shareable, relevant to anyone)
- **Session state** — debugging context, personal insights (ephemeral, relevant to the individual)

This decomposition is the hypothesis to validate, challenge, or refine. Git tracking is
problematic because: (1) handoff happens after commits, creating perpetual dirty state;
(2) ephemeral content diverges across machines; (3) personal notes have privacy/comfort tension.

Three scenarios the design must address: multi-machine solo developer, team handoff (ownership
transfer), and team awareness (shared project visibility).

---

## Pattern 1: Template + Instance (Schema Separation)

**Core idea:** Shareable schema/structure is tracked in VCS; machine-specific values are local
and gitignored. Everyone knows the *shape*; no one shares their *instance*.

### Environment Variables (.env Pattern)

- **Shared:** `.env.example` declares required variables, validates structure
- **Local:** `.env.local` (gitignored) contains actual values
- **Mechanism:** File naming convention + explicit gitignore
- **Handoff:** Schema in repo answers "what's required"; values communicated out-of-band
- **Variations:** Vite uses `.env` (tracked) + `.env.local` (gitignored); Docker Compose
  `env_file` for shared config + `environment` block for overrides; 12 Factor App elevates
  this to architectural requirement

Sources: [motdotla/dotenv][dotenv-gh], [Vite env docs][vite-env], [12factor.net/config][12factor]

### EditorConfig (Inheritance-Based Override)

- **Shared:** `.editorconfig` (tracked) — project-level formatting rules
- **Local:** Global `~/.editorconfig` — personal preferences that override only when project
  file doesn't specify
- **Mechanism:** Two-file hierarchy; nested files override parent files
- **Handoff:** Inherent — cloning the repo gives team rules; personal overrides isolated by
  filesystem location
- **Key finding:** Inheritance-based override is cleaner than naming convention. IDE plugins
  handle merging automatically

Sources: [EditorConfig.org][editorconfig], [JetBrains EditorConfig docs][jb-editorconfig]

### IDE Workspace Configuration

**VS Code:**

- **Shared:** `.vscode/settings.json` (tracked) — team formatting, linter rules
- **Personal:** Same file, gitignored — creates a tension since one file can't be both
- **Workaround:** Naming convention (`.shared.json` + `.local.json`) or extensions
- **Open request:** `.code-workspace.local` auto-merge with main workspace file (not
  implemented; [GitHub Issue #282806][vscode-282806] remains open)

**JetBrains:**

- **Shared:** `.idea/` folder with copyable configurations (code style, inspection profiles)
- **Personal:** `workspace.xml` (automatically gitignored) — layout, run configurations
- **Mechanism:** Manual copy of shareable settings; version control the copies
- **Direction:** Workspace becoming responsible only for folder structure + VCS roots;
  everything else moving to project level for local control

Sources: [VS Code #282806][vscode-282806], [JetBrains project settings][jb-settings],
[Martin Hujer: Don't gitignore .vscode][hujer-vscode]

### Pattern Assessment

**Tradeoffs:**

- VS Code hasn't solved the shared-vs-personal split cleanly (single file constraint)
- JetBrains solved via manual copy (works, requires developer discipline)
- The dotenv pattern is the most widely adopted and cleanest implementation

**Relevance to ARC:** The template+instance pattern maps directly to the hypothesis —
CURRENT-SESSION could have a tracked "template" (project state schema) and a gitignored
"instance" (session-specific values). The dotenv ecosystem's maturity validates this approach.

---

## Pattern 2: State Backend (Remote + Local Sync)

**Core idea:** Durable shared state lives in a purpose-built remote backend, not VCS. Local
working copies are ephemeral and reconstructable.

### Terraform Local → Remote State

- **Local state:** `terraform.tfstate` on developer's machine — fast, complete, but causes
  merge conflicts and leaks secrets in teams
- **Remote backends:** HCP Terraform Cloud, S3, Azure Blob, GCS — single source of truth
  with RBAC, state locking, encryption
- **Mechanism:** Purpose-built state service. Backend config in `.tf` files specifies remote
  location; git tracks config, not state
- **Handoff:** `terraform init` fetches current remote state; local machine becomes workspace,
  not source of truth. State lock prevents concurrent modifications
- **Multi-machine:** Same developer switching machines runs `terraform init` — automatic
- **Key insight:** State is not code. VCS is the wrong layer for it. Remote backend solves
  team collaboration, state locking, audit trails, secret protection

Sources: [Spacelift: Remote State Setup][spacelift-tf], [HashiCorp backend docs][hc-backend],
[AWS Prescriptive Guidance][aws-tf]

### Pulumi (Similar Pattern)

- **Local filesystem backend:** Fast, single-user safe, but manual backup/sync
- **Pulumi Cloud backend:** Hosted service with automatic backup, RBAC, state locking, audit
- **Backend selection:** Per-stack; same code can use different backends for dev/staging/prod
- **DIY backends:** S3, GCS, Azure — require manual locking and backup implementation

Sources: [Pulumi state concepts][pulumi-state], [Spacelift: Pulumi state][spacelift-pulumi]

### Pattern Assessment

**Tradeoffs:**

- Requires infrastructure beyond the repository (remote service or cloud storage)
- Solves the problem definitively but adds operational complexity
- State locking prevents concurrent modification — important for teams

**Relevance to ARC:** This is the strongest analog for session state that needs sharing. The
key lesson: a purpose-built mechanism outside VCS. For ARC (documentation-only framework), the
equivalent would be lighter than S3 — but the principle holds.

---

## Pattern 3: Workspace Layering (Dependency Isolation)

**Core idea:** Shared dependency declarations tracked in VCS; local cache/resolution is
per-machine and regenerable.

### Monorepo Package Managers

- **Shared:** `package.json` (tracked), lock files (tracked, immutable)
- **Local:** `node_modules/` (gitignored) — generated per machine
- **Mechanism:** Lock file ensures identical dependency tree across machines. Cache regenerated
  on install
- **Hoisting variations:** npm hoists to root; pnpm creates central cache + links (isolated);
  Yarn Berry uses zip-based approach

Sources: [Monorepo.tools][monorepo-tools], [pnpm workspaces][pnpm-ws],
[Turborepo dependency management][turbo-deps]

### Build System Output Caching (Bazel)

- **Shared cache:** Remote cache (S3, GCS, HTTP) — stores build outputs keyed by input hash
- **Local cache:** `~/.cache/bazel/` — user-specific, per-workspace
- **Mechanism:** Deterministic builds; same input → same output. Remote cache is sharing
  mechanism, not state storage
- **Key insight:** Build outputs are ephemeral; input specification is durable

Sources: [Bazel build concepts][bazel-concepts], [Tweag: Bazel remote cache][tweag-bazel]

### Pattern Assessment

**Relevance to ARC:** The lock-file pattern (declarative specification tracked, generated
artifacts local) parallels "session template tracked, session instance local." The regenerability
aspect is interesting — can session state be partially reconstructed from tracked artifacts
(task list, commit log)?

---

## Pattern 4: Version Control Adjacency (Git Native)

**Core idea:** Commits and refs are shared; working tree and auxiliary metadata are local. Git
already separates shared from personal state — the question is what mechanisms it provides for
the gray area between.

### Git Worktrees

- **Shared:** `.git/` directory, commit history, object database
- **Local:** Each worktree has independent working directory, index, and checked-out branch
- **Handoff:** Not designed for handoff. Worktrees are ephemeral — work, merge, delete
- **Known problem:** Claude Code stores session state in `.claude/` inside the worktree.
  When worktree is deleted after merge, session context is lost. This violates the design
  pattern — tying durable state to disposable infrastructure

Sources: [Git worktrees guide][git-worktrees], [Claude Code worktree issue #15776][cc-15776]

### Git Stash

- **Mechanism:** Local-only paused work. Not transferred on push
- **Ephemeral nature:** Lost on `git gc` or repo deletion. Short-term pausing only
- **Handoff:** Must convert to commit or extract patch to transfer

Sources: [Atlassian: git stash][atlassian-stash]

### Git Notes

- **Shared portion:** Notes stored as refs under `refs/notes/`. Pushable but not pushed
  by default — requires explicit sync
- **Namespaces:** Allow different note types (`refs/notes/review`, `refs/notes/ci/test-results`)
- **Use cases:** Non-destructive metadata annotations on commits (test results, deployment
  status, progress tracking)
- **Implementation:** Palaver tool stores state as JSON blobs in notes
- **Key finding:** Avoids rewriting history, namespace-safe, but requires explicit push to
  share. Interesting mechanism for session metadata that *can* be shared but isn't by default

Sources: [git-notes docs][git-notes], [Tyler Cipriani: Git Notes][cipriani-notes],
[DEV: Git Notes Unraveled][dev-notes]

### Mercurial Bookmarks

- **Mechanism:** Mutable references (like git branches) that auto-advance with commits
- **Sharing:** Local by default; must be explicitly pushed/pulled
- **Key difference:** Explicit control over what synchronizes — local-first with opt-in sharing

Sources: [Mercurial bookmarks wiki][hg-bookmarks]

### Pattern Assessment

**Relevance to ARC:** Git notes are the most interesting find here. They offer a mechanism for
metadata that is: (a) attached to commits, (b) namespace-organized, (c) local by default but
shareable on demand. This maps well to session context that a developer *might* want to share
during handoff but doesn't need to share routinely.

---

## Pattern 5: Separation by Environmental Concern

**Core idea:** Cluster/deployment-wide config vs. node/instance-specific state, managed by a
control plane rather than VCS.

### Kubernetes ConfigMaps + Secrets

- **Shared (control plane):** ConfigMaps (non-sensitive) and Secrets (sensitive) in etcd,
  queryable by all Pods
- **Local (node/pod):** Working data in ephemeral container filesystem
- **Mechanism:** Pods reference ConfigMaps by name; control plane injects at runtime. Not in VCS
- **Handoff:** New Pod references same ConfigMap — automatic access. No ceremony needed
- **Key insight:** Shared config not in VCS; lives in runtime control plane. Decouples
  artifact from configuration

Sources: [Kubernetes ConfigMaps][k8s-configmaps]

### Docker Compose Environment Layering

- **Shared:** `docker-compose.yml` with `env_file: .env.shared` (tracked)
- **Local:** `.env.local` (gitignored) for overrides
- **Precedence:** `environment` > `env_file` > `.env` defaults

Sources: [Docker Compose env vars][docker-env]

### Pattern Assessment

**Relevance to ARC:** The control plane pattern (shared configuration injected at runtime)
is interesting conceptually but likely too heavyweight for ARC's documentation-only context.
The layered precedence model (shared defaults + local overrides) is applicable.

---

## Pattern 6: Collaboration Tool Granularity

**Core idea:** Tools vary in what they share for team awareness vs. what enables actual work
transfer. Most tools do awareness well; few do handoff.

### Project Management Tools (Linear, GitHub Projects, Notion)

- **Team awareness:** Dashboards, cycles, boards show project status, who's working on what
- **Individual context:** Debugging notes end up in comments or external docs; not structurally
  captured
- **Handoff:** Manual — create a summary, @mention new owner, communicate via Slack/email
- **Key finding:** These tools show *what* is being worked on but don't systematize *how* to
  transfer session context. Awareness is strong; handoff ceremony is absent

Sources: [findpmsoftware: Linear vs Notion][linear-notion]

### Async Standup Tools (Geekbot, Standuply, Range)

- **Schema:** Customizable questions — typically "What did you do?", "What will you do?",
  "Anything blocking?"
- **Push/pull:** Push (tool sends questions via DM); responses posted to team channel
- **Blocked state:** Free-text description only. No structured way to tag, escalate, or track
  blockers across team members
- **Key limitation:** Captures status but not context. A blocker reported in standup has no
  mechanism to transfer the work context to someone taking over

Sources: [Geekbot status update docs][geekbot]

### Engineering Intelligence Platforms (Swarmia, Jellyfish, LinearB)

- **What's surfaced:** Real-time work logs, PR activity, DORA metrics, collaboration signals
- **Granularity:** Swarmia — real-time, individual + team level. Jellyfish — 24-hour refresh,
  executive level. LinearB — workflow-level with PR automation
- **Push/pull:** Swarmia pushes via Slack notifications; others primarily pull (dashboard)
- **Key limitation:** Show *movement* (someone is working on a PR) but not *why* someone is
  blocked, what they've tried, or what context the next person needs to take over

Sources: [Swarmia platform][swarmia], [Jellyfish vs Swarmia comparison][jellyfish-swarmia]

### Basecamp Shape Up Hill Charts

- **What's communicated:** Qualitative progress on a spectrum from uncertain (uphill —
  figuring out what to do) to complete (downhill — executing with confidence)
- **Key feature:** Comparing past states reveals what's progressing vs. what's stuck. A scope
  stuck uphill signals unsolved unknowns without requiring explicit "blocked" declaration
- **What's NOT captured:** Which specific unknowns remain, what approaches were tried,
  what the next person should focus on
- **Push/pull:** Pull — teams update positions; managers review periodically

Sources: [Shape Up: Show Progress][shapeup-hill], [Basecamp hill charts][basecamp-hill]

### Pattern Assessment

**Relevance to ARC:** The distinction between awareness (team sees status) and handoff (context
transfers to next person) is a critical design axis. No collaboration tool provides structured
handoff. Hill charts are notable for capturing *qualitative* progress (uncertainty vs. execution)
rather than just task counts — this maps to ARC's "additional context" section in
CURRENT-SESSION.md.

---

## Pattern 7: AI-Assisted Development Tools

**Core finding:** No major AI coding tool has built-in cross-machine session persistence. This
is a genuinely unsolved problem.

### Tool-Specific Findings

**Claude Code:**

- Session stored at `~/.claude/projects/[hash]/[session-id].jsonl` — local per project
- Can resume previous session on same machine
- No cross-machine sync. Developers report multi-hour sessions lost
- Worktree integration compounds the problem (session tied to disposable directory)

**Windsurf:**

- "Cascade Memories" (session-level) and "Flow" (cross-session persistence)
- Both machine-local, not cross-machine

**Aider:**

- Uses compressed git graph representation for context reconstruction (more sophisticated
  than transcript storage)
- State is machine-local

### Community Workarounds

- **AI Context Bridge (ctx):** Auto-saves context on every commit; generates resume prompts
  for 11+ supported tools
- **Nucleus MCP:** Creates local-first memory layer ("Engrams") persisting across sessions
  and tools via Model Context Protocol

Sources: [Claude Code session recovery][cc-session], [AI Context Bridge][ctx-bridge],
[Nucleus MCP][nucleus-mcp], [Cursor vs Windsurf vs Claude Code 2026][ai-comparison]

### Pattern Assessment

**Relevance to ARC:** The community workarounds validate the problem space. AI Context Bridge's
"save on commit" model is interesting — it ties context snapshots to the existing commit
workflow. Nucleus MCP's approach of a shared memory layer across tools parallels the "state
backend" pattern from infrastructure tooling.

---

## Pattern 8: High-Reliability Handoff Ceremonies

**Core finding:** High-reliability fields (medicine, aviation, military, SRE) all formalize
handoff with structured ceremonies, checklists, and verification. Software development has no
equivalent.

### Medical Protocols (SBAR, I-PASS)

**SBAR structure:**

- **Situation:** Patient identifiers, reason for concern, symptom onset/severity
- **Background:** Admission date, diagnosis, history, allergies, medications, lab results
- **Assessment:** Current clinical status and severity
- **Recommendation:** Specific actions needed for continuity of care

**I-PASS structure:**

- **Illness severity, Patient summary, Action list, Situation awareness, Synthesis**
- Developed for pediatrics, now widely used; moderate-to-high certainty evidence

**Failure mode evidence:**

- Communication failures contributed to at least 30% of malpractice claims
- Over 1,700 deaths across five years in US hospitals attributed to handoff breakdowns
- One study: error reduction from 102 to 25 errors after SBAR implementation
- Handoff breakdowns "typically contribute to a cascade of failures rather than being
  sole causes"

Sources: [PMC: Structured handoff protocols][pmc-handoff], [SBAR handoff report][sbar-osmosis],
[PMC: SBAR impact study][pmc-sbar]

### Air Traffic Control Position Relief

**Ceremony structure:**

- **Pre-handover:** Supervisors consider timing (avoid during sector splits). Pre-briefing
  essential
- **During:** Outgoing controller communicates all relevant information. Incoming clarifies
  until confident
- **After:** Departing controller monitors briefly to confirm incoming has command

**Checklists/mnemonics:**

- **WEST:** Weather, Equipment, Situation, Traffic (area control centers)
- **REST:** Restrictions/Runway, Equipment, Situation, Traffic
- **PRAWNS:** Pressure, Roles, Airports, Weather, Non-Standard info, Strips (terminal)
- **SUSIS:** Sector, Unusual activity, Situation, Information, Split

**Key principle:** "Controllers should not shortcut existing good practice during low vigilance
periods." Off-going controller monitors post-handover.

Sources: [SKYbrary: Handover/Takeover][skybrary-handover]

### Military Relief in Place

- **Process:** Exchange plans and liaison personnel → briefings and detailed reconnaissance →
  publication of orders → transition of command and control
- **Information transferred:** Current intelligence, logistics, friendly unit dispositions,
  enemy/civilian situation, terrain analysis, fire support plans, obstacle plans
- **Key characteristic:** Reconnaissance and briefing are prerequisites, not optional additions

Sources: [FM 3-90 Chapter 15][fm3-90]

### SRE On-Call Rotation Handoffs

- **Ceremony:** Formal "On-Call Review Meeting" at shift conclusion — not just a status email
- **Essential information:** Current system state, ongoing issues, recent incident resolutions,
  known fragile systems
- **Continuous improvement info:** Historical patterns, trend analysis, systemic improvements
- **Explicit distinction:** Shift handoff (operational continuity) vs. on-call review
  (continuous improvement) are separate concerns
- **Runbook structure (5 A's):** Actionable, Accessible, Accurate, Authoritative, Adaptable

Sources: [PagerDuty: On-Call][pagerduty-oncall], [Rootly: SRE On-Call][rootly-oncall],
[Rootly: Runbooks Guide][rootly-runbooks]

### Open Source Maintainer Handoffs

- **Process:** Identify successor (someone already familiar) → document context → manage
  transition → support phase
- **Key dependency:** Relies almost entirely on asynchronous public documentation rather than
  structured tooling. No formalized ceremony template exists
- **Failure mode:** Projects that don't document decisions lose institutional knowledge.
  Successors must reverse-engineer from commit history

Sources: [How to hand over an OSS project][oss-handoff], [Open Source Guides: Best
Practices][oss-guides]

### Pattern Assessment

**Relevance to ARC:** The strongest analog for ARC's handoff design. Key takeaways:

1. **Ceremony matters.** Every high-reliability field has a structured handoff process, not
   ad-hoc communication. ARC's session-handoff workflow is already a ceremony — this validates
   the approach
2. **Checklists prevent information loss.** SBAR, WEST, PRAWNS all use mnemonics. ARC's
   handoff could benefit from a similar structured template
3. **Status update ≠ context transfer.** SRE explicitly separates shift handoff from on-call
   review. ARC should distinguish team awareness from full handoff
4. **Post-handoff verification.** ATC controllers monitor after handover. ARC's session-init
   (which verifies documented state matches reality) serves a similar function
5. **Failure modes are documented.** 30% of medical malpractice claims linked to communication
   failures. The cost of bad handoffs is measurable

---

## Pattern 9: Team Awareness (Distinct from Handoff)

**Core finding:** Awareness and handoff are different concerns with different mechanisms.
Most software tools only address awareness.

### InnerSource Patterns (Knowledge Transfer by Design)

**Notable exception** to the awareness-only pattern. InnerSource deliberately designs for
knowledge transfer across team boundaries:

- **InnerSource Portal:** Centralized discovery — teams find available projects
- **Standard base documentation:** README, CONTRIBUTING — enables self-service onboarding
- **Dedicated community leader:** Person with communications + technical skills bridges
  knowledge gaps
- **Architecture Decision Records:** Design rationale is transferable, not just design outcomes
- **Key distinction from other patterns:** Assumes contributors are unfamiliar with codebase.
  Documentation is first-class, not afterthought

Sources: [InnerSource Patterns repo][innersource-patterns], [PayPal InnerSource case study
(O'Reilly)][paypal-innersource]

### Pattern Assessment

**Relevance to ARC:** InnerSource's explicit investment in knowledge transfer mirrors ARC's
own approach (strategy documents, ADRs, session handoff). The "dedicated community leader" role
maps loosely to ARC's session-handoff writer — the person who prepares context for the next
contributor.

---

## Cross-Cutting Insights

### 1. The Sharing Mechanism Is Never VCS

Every mature pattern avoids putting ephemeral/local state in git:

- Terraform → remote backend (S3, HCP Cloud)
- Env files → `.env.local` gitignored; only `.env.example` tracked
- IDE configs → `workspace.xml` gitignored; shared settings selectively tracked
- Monorepo caches → `node_modules/` gitignored; lock file tracked
- Kubernetes → ConfigMaps in API server
- AI tool sessions → local filesystem, no VCS integration

**Implication:** VCS is for code and durable schemas. Ephemeral state requires a purpose-built
sharing mechanism outside VCS.

### 2. Handoff Is Solved in High-Reliability Fields, Absent in Dev Tooling

| Domain             | Handoff formalization                           | Evidence base                        |
| ------------------ | ----------------------------------------------- | ------------------------------------ |
| Medicine           | SBAR, I-PASS protocols                          | 30% malpractice claims from failures |
| Aviation           | WEST/PRAWNS checklists, post-handoff monitoring | Regulatory requirement               |
| Military           | Relief in Place doctrine                        | Field manual procedures              |
| SRE                | On-Call Review Meeting, runbook 5 A's           | Industry best practice               |
| Software dev tools | None                                            | Manual Slack/email                   |
| AI coding tools    | None                                            | Community workarounds                |

**Implication:** The handoff problem is well-understood and solved in other domains. Software
development has a genuine gap. ARC's session-handoff workflow puts it ahead of the industry
baseline.

### 3. Status Update ≠ Context Transfer

SRE explicitly separates shift handoff (operational continuity) from on-call review (continuous
improvement). Medical protocols distinguish patient status from care transfer. No software
collaboration tool makes this distinction.

**Implication:** ARC's design should explicitly distinguish team awareness (what's everyone
working on) from work transfer (full context for someone taking over). These may require
different mechanisms.

### 4. Privacy and Visibility Follow a Consistent Split

Across every pattern, shared schemas are visible while instance data is private:

- `.env.example` visible; `.env` values private
- `.editorconfig` team rules visible; personal IDE settings private
- ConfigMap schema visible; Secret values encrypted
- Standup "what I did" visible; debugging scratch notes private

**Implication:** The hypothesis holds — project state (shareable) and session state (personal)
represent a real and widely-observed boundary. Personal context stays personal; the team sees
enough to understand project state.

### 5. Qualitative Progress Signals vs. Task Counts

Hill charts capture uncertainty-vs-execution (qualitative) rather than percentage-complete
(quantitative). Engineering intelligence platforms show activity signals rather than status
declarations. Both provide richer awareness than checkbox completion.

**Implication:** ARC's "Additional Context" section in CURRENT-SESSION.md already captures
qualitative state (blockers, insights, approach notes). The shareable portion of session state
may be more about *what kind of uncertainty remains* than *which tasks are done*.

---

## Areas for Potential Follow-Up Research

These gaps are narrow and non-blocking for the design task but could provide additional evidence
if needed:

1. **Regulated industry handoff templates** — Medical SBAR and ATC WEST/PRAWNS are documented;
   finance and legal compliance handoffs may have additional patterns
2. **Pair programming session state** — Beyond VS Code Live Share, how do mob/pair programming
   tools handle context when participants change?
3. **Context reconstruction patterns** — Some evidence that session state can be partially
   reconstructed from tracked artifacts (Aider's git graph approach, git log + task list).
   How effective is reconstruction vs. explicit capture?

---

[dotenv-gh]: https://github.com/motdotla/dotenv
[vite-env]: https://vite.dev/guide/env-and-mode
[12factor]: https://12factor.net/config
[editorconfig]: https://editorconfig.org/
[jb-editorconfig]: https://www.jetbrains.com/help/idea/editorconfig.html
[vscode-282806]: https://github.com/microsoft/vscode/issues/282806
[jb-settings]: https://www.jetbrains.com/help/idea/configure-project-settings.html
[hujer-vscode]: https://blog.martinhujer.cz/dont-put-idea-vscode-directories-to-projects-gitignore/
[spacelift-tf]: https://spacelift.io/blog/terraform-remote-state
[hc-backend]: https://developer.hashicorp.com/terraform/language/backend
[aws-tf]: https://docs.aws.amazon.com/prescriptive-guidance/latest/getting-started-terraform/states-and-backends.html
[pulumi-state]: https://www.pulumi.com/docs/iac/concepts/state-and-backends/
[spacelift-pulumi]: https://spacelift.io/blog/pulumi-state-management
[monorepo-tools]: https://monorepo.tools/
[pnpm-ws]: https://pnpm.io/workspaces
[turbo-deps]: https://turborepo.dev/docs/crafting-your-repository/managing-dependencies/
[bazel-concepts]: https://bazel.build/concepts/build-ref
[tweag-bazel]: https://www.tweag.io/blog/2020-04-09-bazel-remote-cache/
[git-worktrees]: https://devtoolbox.dedyn.io/blog/git-worktrees-complete-guide
[cc-15776]: https://github.com/anthropics/claude-code/issues/15776
[atlassian-stash]: https://www.atlassian.com/git/tutorials/saving-changes/git-stash
[git-notes]: https://git-scm.com/docs/git-notes
[cipriani-notes]: https://tylercipriani.com/blog/2022/11/19/git-notes-gits-coolest-most-unloved-feature
[dev-notes]: https://dev.to/shrsv/git-notes-unraveled-history-mechanics-and-practical-uses-25i9
[hg-bookmarks]: https://www.mercurial-scm.org/wiki/Bookmarks
[k8s-configmaps]: https://kubernetes.io/docs/concepts/configuration/configmap/
[docker-env]: https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/
[linear-notion]: https://findpmsoftware.com/resources/linear-vs-notion
[geekbot]: https://geekbot.com/blog/status-update-tool/
[swarmia]: https://www.swarmia.com/
[jellyfish-swarmia]: https://www.swarmia.com/alternative/jellyfish/
[shapeup-hill]: https://basecamp.com/shapeup/3.4-chapter-13
[basecamp-hill]: https://basecamp.com/hill-charts
[cc-session]: https://dev.to/gonewx/claude-code-lost-my-4-hour-session-heres-the-0-fix-that-actually-works-24h6
[ctx-bridge]: https://github.com/himanshuskukla/ai-context-bridge
[nucleus-mcp]: https://dev.to/nucleusos/how-i-synced-cursor-claude-and-windsurf-with-one-shared-brain-mcp-1mh4
[ai-comparison]: https://dev.to/pockit_tools/cursor-vs-windsurf-vs-claude-code-in-2026-the-honest-comparison-after-using-all-three-3gof
[pmc-handoff]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12232517/
[sbar-osmosis]: https://www.osmosis.org/answers/sbar-handoff-report-acronym
[pmc-sbar]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12668328/
[skybrary-handover]: https://skybrary.aero/articles/handovertakeover-operational-atc-working-positionsresponses
[fm3-90]: https://www.globalsecurity.org/military/library/policy/army/fm/3-90/ch15.htm
[pagerduty-oncall]: https://ownership.pagerduty.com/on-call/
[rootly-oncall]: https://rootly.com/blog/practical-guide-to-sre-automating-on-call
[rootly-runbooks]: https://rootly.com/incident-response/runbooks
[oss-handoff]: https://medium.com/@shazow/how-to-hand-over-an-open-source-project-to-a-new-maintainer-db433aaf57e8
[oss-guides]: https://opensource.guide/best-practices/
[innersource-patterns]: https://github.com/InnerSourceCommons/InnerSourcePatterns
[paypal-innersource]: https://www.oreilly.com/library/view/adopting-innersource/9781492041863/ch05.html
