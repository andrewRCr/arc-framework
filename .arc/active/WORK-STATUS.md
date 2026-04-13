# Work Status

> **About this file:** Tracked project pointer — committed alongside task list updates in the
> same atomic operation. Lightweight factual state so anyone on this branch can see where work
> stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal session
> context — what was tried, decisions made, debugging insights. Together they implement P5
> (Context Preservation). See `session-handoff.md` for the full update protocol.
>
> **Customization:** The session state mechanism is overridable — see `arc-methods.md` §
> session-state.

## Active Work

**Branch**: `technical/plan-operating-modes`
**Task List**: [none]
**Next Task**: —
**Last Completed**: **Audit A H3 resolved — completed 2026-04-13.** Eleven-scenario Local
infrastructure battery walked and integrated across four commits this session. Walk produced
five new sub-findings (H3-N1 re-clone recovery command assignment, H3-N2 backing store health
/ rebuild surface, H3-N4 fallback-chain / stickiness contradiction — HIGH, H3-N6 CI/dev tooling
asymmetry, H3-N7 non-git directory handling), two tightenings to previously resolved content
(H3-N3 cross-machine divergence power-user framing, H3-N5 sync failure three-class enumeration),
and side-effect resolutions for L1, L3, L4, M2, and M3. Two external research passes informed
the walk — editor `@`-mention precedent survey (confirmed intrinsic tradeoff; Zed's
`file_scan_inclusions` is the sole clean path-scoped mitigation) and CLI state-directory
idiomatic-practice survey (validated `chmod 700` on creation, warn-not-refuse semantics,
docs-only remote privacy, and disk-level encryption delegation against OpenSSH, GnuPG, AWS CLI,
restic, borg, chezmoi, pass, Obsidian). Durable walk capture lives at § Mode 2 § Local
Infrastructure Scenario Battery.

**Four-commit structural integration this session:**

+ **Commit 1** (`1485800`) — scenario walk and new finding blocks captured as § Audit A
  workspace.
+ **Commit 2a** (`39195b1`) — small structural edits: § Init Flow Implications non-git
  preconditions (H3-N7); § Agent and Editor Discoverability full rewrite with minor-disruption
  framing, per-editor mitigation table, session-init scaffolding context, and tooling-asymmetry
  note (L1, H3-N6); § Backing Store three-class failure enumeration (H3-N5); `arc update` added
  as sync firing point (L4); § Cross-machine conflict story power-user manual framing (H3-N3).
+ **Commit 2b** (`9dfdba9`) — § Re-Clone UX § Project identity rewritten. File-first precedence,
  pinned-ID-file generalization, resolver-time auto-detect, three-way migration prompt
  (`[M]igrate / [S]tay / [L]ater`), and `arc project-id migrate` command shape all landed.
  H3-N4 resolved; closes M2 and M3. No mirror needed in § Configuration Identity — Local Axis.
+ **Commit 2c** (`8a61fd1`) — § Durability-Layer Commands `arcd backing status` health check
  expansion, new `arcd backing sync --rebuild` bullet, and new § Session-init Local-axis
  pre-check subsection (H3-N1, H3-N2); § Backing Store § Privacy model grounded in external
  research (L3).
+ **Commit 3a** (this commit) — migrated scenario walk from § Audit A workspace to § Mode 2
  durable content; marked H3 and sub-findings Resolved; closed L1 / L3 / L4 / M2 / M3 with
  Resolved status pointing at their structural sections; updated Sequencing Plan. Workspace
  cleanup netted −64 lines despite durable content being the same material — the compact
  Resolved H3 block replaced ~300 lines of working-process framing.

**Key design-level outputs (not just findings closed):**

+ **Pinned project ID file** generalizes the UUID file concept: format-agnostic (any ID
  string), file-first precedence in the fallback chain is the stickiness mechanism, auto-write
  on UUID case, user-written on [S]tay migration, present-means-sticky universally.
+ **Session-init Local-axis pre-check** — new subsection under § Durability-Layer Commands that
  queries `arcd backing status` at orientation time, halts on missing `.arc/`, warns on
  degraded state. Converges H3-N1, H3-N2, and H3-N5 into one feature.
+ **`arcd backing status` as canonical degraded-state source** — health, staleness, and
  permission checks all in one command. Replaces the pre-H3 "failure recorded in SESSION-NOTES"
  dual-source framing.

**Still open from Audit A:** M4 (single-active enforcement mechanism — which layer enforces,
error text, recovery path), M5 (Research Findings section has no Local entries — partially
fillable from this session's two research passes), L2 (pause + stash interaction in Local mode —
untracked `.arc/` edits vs. `git stash` semantics). None were touched by H3 scenarios; they
need a dedicated consolidation session. After consolidation: Audit B (content drift sweep) as
the final pre-PRD pass.

**Blockers**: [none]

**Next Action**: **M4 + M5 + L2 consolidation pass** — one short session closing the remaining
three Audit A items. M4 needs a one-paragraph addition to § Single-Active-Unit Invariant naming
the enforcement layer (likely CLI at activation time), the error text, and the recovery path
(shift the existing WU to paused first). M5 can be partially filled by transcribing this
session's editor-`@`-mention survey and CLI-state-dir idiomatic-practice survey into new
§ Research Findings subsections. L2 needs a one-sentence carve-out in § What Changes vs. Tracked
Full distinguishing `git stash` (tracked-only) from untracked `.arc/` edits (preserved via next
backing store sync). Estimated: one short session. **Do not skip to Audit B early** — the
consolidation pass may surface small additions that change what Audit B looks for.

Plan doc size: 5314 → 5921 lines (+607 net across the session; −64 net on commit 3a from the
workspace cleanup). Markdown lint clean across all four commits.

---

**Last Updated**: 2026-04-13 (Audit A H3 resolved across four commits this session; M4 + M5 + L2
consolidation pass remains before Audit B)
