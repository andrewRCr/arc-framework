# Spec (`outline`): coupling-blast-radius-audit

- **Origin:** [internal] — merged at the 2026-07-18 housekeep drain from two recorded needs that are the same
  enumeration pass: the `arc-backend` blast-radius audit call and the coupling-inventory need from the
  2026-07-16 architecture-direction discussion.

- **Purpose:** Enumerate every concrete-name / concrete-layout assumption the codebase and workflow corpus
  carry, mechanically count fan-out per assumption class, cross with recorded volatility, and deliver a ranked
  decoupling list that feeds `cli-substrate-adoption` and `wu-lifecycle-state-model`. Findings route to
  existing owners; no remediation program is minted.

---

## Problem / Context

The architecture direction (materialized git backing store, substrate-layer path abstraction, lifecycle
state-as-record) will move names and layouts the corpus currently hardcodes — `.arc/completed/`,
`backlog/planned/`, the `chore/` and `meta-` prefixes, branch patterns, `ROADMAP.md`, tracked-path and
directory-as-state reads. Two in-flight consumers hold hard `Depends On` edges on this audit:
`cli-substrate-adoption` needs to know which concrete-path assumptions the substrate layer must abstract, and
`wu-lifecycle-state-model` needs the placement-reader enumeration for its placement-as-record position. Neither
can proceed on guesses, and no inventory exists.

The corpus is too large for judgment-first enumeration: ~480 TS source files plus ~140 shipped markdown files
in package source, with sample probes confirming real spread (`meta-` in 123 files, `active/` in 108,
`ROADMAP` in 51). The binding design constraint is efficiency — token/attention spend concentrates where
judgment is irreplaceable (pattern authoring, volatility rating, ambiguous-hit triage) while mechanical
tooling performs every corpus-wide read.

## Decision(s)

1. **Package source is the authoritative corpus.** We audit `packages/arc-framework/src/**` and
   `packages/arc-framework/arc/**` only, because the `.arc/` instance mirrors package source under two-copy
   sync; a small delta pass covers configurable-file divergences plus the repo-root self-hosting tooling
   that lives in neither copy (`.husky/`, `scripts/`, harness config) — few files, but real blast radius at
   the storage flip. This roughly halves the surface at no coverage cost.

2. **The pattern manifest is derived twice over, from complementary directions.** A **name layer** derives
   forward from the recorded target shapes — the three evolution strategies (`strategy-storage-evolution.md`,
   `strategy-knowledge-evolution.md`, `strategy-procedure-evolution.md`), their paired drafts
   (`draft-arc-backend.md`, `draft-knowledge-architecture.md`, `draft-composable-workflows.md`), and the
   in-flight roster (pending renames such as `ROADMAP → STATUS.PROJECT`, `team.mode → team.enabled`) — any
   name or layout the target shape would move is a volatile assumption, pre-weighted by volatility. An
   **idiom layer** derives backward from the closed list of coupling mechanisms: path string literals,
   readdir/existence checks against directories-as-state, git invocations on tracked paths, filename-prefix
   parsing, branch-pattern matching, config-key literals, doc-name references in prose. Names say what to
   look for; idioms say where couplings hide. An **assumption class is name-keyed** — one volatile name /
   layout family (the `meta-` prefix, `completed/` placement) — with surface kind and idiom recorded as
   per-hit tags; couplings no single name owns (git invocations on tracked paths) form standalone
   idiom-keyed classes. Volatility and the quadrant verdict attach to the class either way.

3. **Comprehensiveness is evidenced by the residue test, not asserted.** One deliberately over-broad
   catch-all sweep captures candidate couplings beyond the name layer; every hit must classify into a
   manifest class or land in the residue. The catch-all's adequacy is itself a requirement, not an example
   list: it must carry at least one capture vector per idiom-layer mechanism — call-site sweeps over
   readdir/existence/path-join arguments and prefix-fragment families in code (a fragment like `meta-`
   never contains `.arc/`), path-like and backticked tokens in prose — so an unknown name expressed through
   any known mechanism still surfaces. Concrete patterns are execution-time calibration bound by that
   requirement. Each residue item either mints a new class or is dismissed with a recorded reason; a
   fully-triaged residue is the comprehensiveness evidence.

4. **Enumeration is mechanical and re-runnable, implemented in the existing stack.** A Node script (regex
   scan over the tree — no new tool dependency; the stack is Node ≥24/TypeScript per the technical overview)
   executes the manifest corpus-wide and emits per-class fan-out counts and file lists. Manifest and script
   are checked in so the audit re-runs after each decoupling lands.

5. **Hits classify by surface kind mechanically; judgment samples are capped.** File path determines surface
   kind (code / workflow prose / template / test) at zero judgment cost — a hardcoded path in a source module
   and a prose mention in a strategy are different couplings. Agent inspection is reserved for code hits,
   capped per class.

6. **Volatility rates per class, from the record.** Each assumption class (never each hit) is rated against
   the in-flight roster and the evolution strategies, citing the pending WU that would move each name — a
   cheap judgment layer over mechanical counts, and a dated snapshot by design.

7. **The deliverable is a ranked 2×2 report plus routed findings.** Fan-out × volatility:
   high-fan-out × high-volatility → abstract; high-fan-out × stable → leave alone. The report lands as a
   tracked companion that survives archival (two hard-edge consumers read it later), alongside the manifest.
   Every finding that changes another WU's design lands as a provenance-stamped inbound-buffer note on that
   WU (or a `USER-INBOX` capture when the owner is in flight) in a terminal routing phase.

## Scope boundary (No-gos)

- **No remediation.** The deliverable is the inventory, ranking, and routed findings — never the decoupling
  work itself, which belongs to the routed owners.
- **No mid-audit edits to foreign draft bodies.** Whether a finding changes a WU's design is that WU's call
  at its own grooming, with its own context loaded; findings arrive as inbound-buffer notes only.
- **No pre-committed edges to soft consumers.** `knowledge-lint`, `session-locus-model`,
  `composable-workflows`, and others receive routed notes if the enumeration surfaces them; the affected set
  is an output of the audit, not a guess made now.
- **No agent corpus sweep.** Corpus-wide reads are the script's job; agent reads stay within the capped
  sampling and residue-triage budgets.

## Consequences & Risks

- **The manifest can drift.** A checked-in manifest is a new maintained artifact; names it tracks will keep
  moving. Accepted: re-runnability is the point, and the hard-edge consumers re-measure rather than trust
  stale counts.
- **Volatility ratings age.** Ratings cite the pending WU that moves each name, so a re-cut roadmap
  invalidates specific rows visibly rather than silently. Accepted as a dated snapshot.
- **The residue cap trades completeness for boundedness.** Capped judgment can miss couplings outside every
  manifest class. Mitigated: capture is uncapped (the catch-all is deliberately over-broad) and the cap bounds
  only item-level judgment — past it, dispositions land by recorded bulk rule, so zero residue stays reachable
  without unbounded per-hit inspection.
- **Prose mentions are a judgment call.** Shipped `arc/**` markdown mentions count as coupling (they ship and
  drift) but weigh below code reads; misweighting shifts rank, not membership.

## Success Criteria

1. A checked-in pattern manifest exists with both layers populated, each name-layer entry citing its
   target-shape source (strategy, draft, or roster item), and the catch-all definition carrying at least
   one capture vector per idiom-layer mechanism.
2. The enumeration script runs corpus-wide from the repo and emits per-class fan-out counts and file lists;
   a second run reproduces the same output on an unchanged tree.
3. The catch-all residue is triaged to zero: every hit is classified into a manifest class or dismissed with
   a recorded reason — item-level up to the cap, by recorded bulk rule (one reason covering a group) past it.
4. The ranked report exists as a tracked companion: every assumption class carries a fan-out count, a surface-
   kind breakdown, a volatility rating citing its mover WU, and a 2×2 quadrant verdict.
5. Findings are routed per the closing discipline: provenance-stamped notes have landed on every affected
   WU's inbound buffer (or `USER-INBOX` for in-flight owners), and the two hard-edge consumers'
   inputs — the substrate abstraction list and the placement-reader enumeration — are explicitly present in
   the report.

## Open items

- **Ranking thresholds** — what fan-out count reads "high" per surface kind; calibrated against the real
  distribution once counts exist.
- **Residue cap value** — the bounded triage size; set when the catch-all's actual volume is known.
- **Manifest/script home** — exact checked-in location; resolved when the artifacts take shape.
- **Delta-pass size** — assumed small (configurable-file divergences plus a handful of repo-root tooling
  files); verified cheaply during the corpus-boundary pass.
