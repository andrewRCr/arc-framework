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

The corpus is too large for judgment-first enumeration: ~480 TS source files, ~500 test files, and ~140 shipped
markdown files in the package tree, with sample probes confirming real spread (`meta-` in 123 files, `active/` in
108, `ROADMAP` in 51). The binding design constraint is efficiency — token/attention spend concentrates where
judgment is irreplaceable (pattern authoring, volatility rating, ambiguous-hit triage) while mechanical tooling
performs every corpus-wide read.

## Decision(s)

1. **The package tree is the authoritative corpus.** We audit every tracked file under
   `packages/arc-framework/**`: source, tests, shipped ARC content, user templates, the init recipe, changelog data,
   and package-local configuration all carry rename/layout blast radius while the `.arc/` instance mirrors package
   source under two-copy sync. Ignored/generated output such as `dist/` is excluded. A small delta pass covers every
   byte-different tracked `.arc/**` counterpart of package ARC content, mapped through the live install output-path
   rules, plus repo-root self-hosting tooling that lives outside the package (`.husky/`, `scripts/`, harness config)
   — few files, but real blast radius at the storage flip. The current recipe, classifier, and installed manifest
   are reconciliation evidence, never an authority that can hide a live difference. Corpus discovery is
   tracked-file-based: hidden tracked content such as `.internal/**` is included, and no extension filter silently
   narrows the package or delta. Any tracked file that is not valid UTF-8 requires an explicit manifest exclusion
   with a recorded reason.

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
   any known mechanism still surfaces. Catch-all vectors emit candidate token/spans; a candidate is classified
   only when a manifest-class match covers that token/span, never merely because the same file or line contains a
   known class. Concrete patterns are execution-time calibration bound by that requirement. Recorded exact and
   bulk dispositions are manifest inputs: exact entries bind one canonical candidate digest, while bulk entries
   bind a closed declarative predicate to the exact digest of its current member set. The result retains classified,
   dismissed, and unresolved candidates as separate evidence; missing, changed, or newly added bulk members make a
   disposition stale instead of silently suppressing new evidence. Each unresolved item either mints a new class or
   receives a recorded disposition; a fully-triaged residue is the comprehensiveness evidence.

4. **Enumeration is mechanical and re-runnable, implemented in the existing stack.** A Node script (regex
   scan over the tree — no new tool dependency; the stack is Node ≥24/TypeScript per the technical overview)
   executes the manifest corpus-wide and emits per-class fan-out counts and file lists. Manifest and script
   are checked in so the audit re-runs after each decoupling lands.

5. **Hits classify by surface kind mechanically; judgment samples are capped.** File path determines a closed
   surface kind (`test | workflow | template | code | prose | config`) and an orthogonal corpus-locus tag at zero
   judgment cost — a hardcoded path in a source module and a prose mention in a strategy are different couplings.
   Classification is an exhaustive ordered path/file-family decision: test roots first; shipped workflow roots;
   package and ARC template roots; executable source/script/hook families (including extensionless hooks); prose
   document families; then recognized declarative configuration families. An unrecognized family is a scan error,
   never a silent config default. Inspection of already-classified hits is reserved for code and capped per class.
   Residue triage is the separate bounded judgment path across every surface kind.

6. **Volatility rates per class, from the record.** Each assumption class (never each hit) resolves from the
   authoring state `unresolved` to the final binary rating `high | stable`, citing the pending WU or accepted target
   direction that would move each name. Missing or completed mover evidence must be re-resolved rather than silently
   creating a third rating; any unresolved class blocks the report. This remains a cheap judgment layer over
   mechanical counts and a dated snapshot by design.

7. **The deliverable is a ranked 2×2 report plus routed findings.** Fan-out × volatility:
   high-fan-out × high-volatility → `abstract`; low-fan-out × high-volatility → `change-with-mover`;
   high-fan-out × stable → `leave-alone`; low-fan-out × stable → `retain-local`. The existing project-internal
   audit tool applies the settled thresholds and emits the ranked Markdown as a direct projection of the canonical
   scan result plus a canonical tracked routing ledger — no general policy engine, renderer abstraction, or product
   CLI surface. The report lands as a tracked companion that survives archival (two hard-edge consumers read it
   later), alongside the manifest. Every finding that changes another WU's design receives a deterministic,
   provenance-stamped packet in the ledger and a matching `USER-INBOX` capture. Final report projection and
   byte-certification occur only after those captures reconcile with the ledger. The capture is this WU's terminal
   responsibility; a later explicit housekeep pass owns delivery to authoritative homes and is not part of this
   WU's acceptance boundary.

## Scope boundary (No-gos)

- **No remediation.** The deliverable is the inventory, ranking, and routed findings — never the decoupling
  work itself, which belongs to the routed owners.
- **No mid-audit edits to foreign draft bodies.** Whether a finding changes a WU's design is that WU's call
  at its own grooming, with its own context loaded; findings leave this WU as captured packets and reach inbound
  buffers only through the later housekeep workflow.
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
  manifest class. Mitigated: capture is uncapped (the catch-all is deliberately over-broad), and one global
  item-level budget is allocated deterministically across every nonempty capture-vector × surface-kind stratum.
  Past it, dispositions land by recorded bulk rule, so zero residue stays reachable without unbounded per-hit
  inspection.
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
4. The ranked report exists as a tracked companion projected from the canonical scan result and routing ledger:
   every assumption class carries a fan-out count, a surface-kind breakdown, a volatility rating citing its mover
   WU, and a 2×2 quadrant verdict.
5. The tracked routing ledger accounts for every affected WU with a deterministic packet recorded as captured and
   awaiting housekeep, while the two hard-edge consumers' inputs — the substrate abstraction list and the
   placement-reader enumeration — are explicitly present in the report.

## Open items

- **Ranking thresholds** — what fan-out count reads "high" per surface kind; calibrated against the real
  distribution once counts exist.
- **Code-sample cap value (resolved: 5)** — cover each distinct idiom first, then fill in canonical path/location
  order. Five covers the largest four-idiom class plus one independent path check against the observed distribution.
- **Residue cap value (resolved: 64)** — review two candidates from each observed capture-vector × surface-kind
  stratum in deterministic round-robin order; only closed vector-ID groups may receive a recorded bulk reason.
- **Manifest/script home (resolved)** — code lives under `src/lib/coupling-audit/` with a repository-audit script;
  canonical JSON lives under package-local `audits/coupling-blast-radius/`, and the movable Markdown report requires
  an explicit output path so WU archival cannot stale a default.
- **Delta-pass size** — assumed small (byte-different live package/project counterparts plus a handful of repo-root
  tooling files); verified cheaply during the corpus-boundary pass.
