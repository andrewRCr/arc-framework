# Task List: review-architecture

- **Design:** `spec-review-architecture.md`

---

## **Phase 1:** Canonical review facts and schema authority

_Purpose:_ Establish the normalized change and work facts plus their runtime-schema authority before any policy,
gate, or workflow consumes them.

### `[x]` **1.1 Lift canonical change facts into the CLI**

- _Goal:_ CI weight, review risk, ownership, and review routing consume one validated six-status record, with every
  ambiguous Git shape represented as an unknown change set instead of a weaker parallel interpretation.

    - `[x]` **1.1.a Extract the canonical raw-diff parser and record types**
        - Added a dependency-free byte parser and raw Git port in `change-facts.ts`; all six statuses retain exact
          modes and rename/copy endpoints, while malformed framing, object IDs, and UTF-8 fail closed to `unknown`.

    - `[x]` **1.1.b Expose a machine-readable classifier entrypoint**
        - Added an injectable base/head resolver and native-TypeScript executable that emits stable canonical JSON;
          real-repository coverage proves unresolved refs fail closed and hostile filenames remain inert raw data.

    - `[x]` **1.1.c Convert the shell classifier into a compatibility adapter**
        - Moved raw/status reduction, path policy, portability membership, and code-tree identity behind the shared
          module; the shell retains its public commands and conservative path fallback, with Node 24 pinned before
          the dependency-free CI classification path.

    - `[x]` **1.1.d Replace review-gate change-path approximations**
        - Routed GitHub coverage, host projection, self-hosting lane policy, provider locators, and runtime
          composition through canonical changes; copy/type-change identities and both moved endpoints now survive
          downstream, while malformed raw input fails closed and code-surface policy uses the shared classifier.

- _Outcome:_ CI classification and review-gate coverage, routing, and risk composition now share one dependency-free
  raw-diff authority, eliminating the parallel status parser and extension-only code-surface approximation.

### `[x]` **1.2 Resolve ownership and surface authority at exact refs**

- _Goal:_ The router receives one explicit ownership relation and one artifact-authority classification derived
  from exact target refs, including safe answers for mixed, ownerless, moved, and unverifiable surfaces.

    - `[x]` **1.2.a Normalize ownership across the full change set**
        - Added a six-relation exact-ref ownership resolver beside the derived legacy lane projection; canonical
          endpoints now read authoritative metas only where they exist, reduce neutral and known-owner groups with
          closed precedence, and return `unknown` for unavailable evidence, transitions, or ambiguous moves.

    - `[x]` **1.2.b Classify surface authority independently of ownership**
        - Added project predicates and a closed strongest-member reducer for formative, design, constitutional,
          ordinary, derived, and unknown surfaces; both move/copy endpoints participate, declared projections
          require injected source proof, and malformed inputs or failed policy evaluation resolve to `unknown`.

    - `[x]` **1.2.c Unify review-risk path membership**
        - Added a shared stable affected-path union and routed review risk through it plus the canonical code-surface
          predicate; package manifests, shell, fixtures, workflows, project extensions, deletions, and both
          rename/copy endpoints now share membership, while empty or unresolved sets remain sensitive.

    - `[x]` **1.2.d Preserve CI/review decision independence**
        - Added a mode-insensitive canonical change-set view and dedicated risk mapper alongside the full CI and
          authority policies; contract coverage proves light CI documentation may remain design-sensitive and
          review fact mapping cannot observe verified-tree history.

- _Outcome:_ The canonical change record now feeds three independent project decisions: mode-aware CI weight,
  status/endpoint-aware review risk, and exact-ref ownership/authority. The legacy lane is only a downstream
  presentation, so routing can consume closed facts without inheriting CI history or owner-policy shortcuts.

### `[x]` **1.3 Register the review-domain record family**

- _Goal:_ Review-domain runtime records are Zod-authoritative, infer their TypeScript types, register under stable
  identities, and generate deterministic JSON Schema without centralizing domain semantics in the kernel.

    - `[x]` **1.3.a Define co-located semantic schemas**
        - Added strict Zod owners for canonical changes, routing facts/decisions, activity and assurance, project
          promotions, finding primitives, and the independent-analysis contract; exported types infer from those
          schemas, project reasons remain namespaced, and a closed inventory assigns every later durable record to
          its semantic owner and stable versioned identity.

    - `[x]` **1.3.b Register stable review schema identities**
        - Added owner-local registrars with explicit strict-current versions and a review-domain composition
          entrypoint over caller-owned kernel registries; contract tests preserve the four kernel built-ins, prove
          repeat-composition rejection, and guard the kernel schema modules from review imports and vocabulary.

    - `[x]` **1.3.c Extend deterministic schema generation and packaging**
        - Composed the review registrar only in `tsup.config.ts` while retaining the kernel-only projection default;
          schema-generation and production-artifact tests pin the complete deterministic identity and `$ref` set,
          and a package dry run proves the generated `dist/schemas/kernel.json` ships through the existing manifest.

    - `[x]` **1.3.d Fence legacy validators during migration**
        - Added an AST-backed owner-boundary test that requires schema-inferred exported types, schema-only exported
          values, and registrar-only functions; the exact schema-v1 handwritten-validator importer set is pinned so
          new validation imports, structural interfaces, parsers, or projections fail the focused contract suite.

- _Outcome:_ Review semantics now compose above the unchanged kernel as strict, owner-local Zod contracts: runtime
  types derive from schemas, build output is deterministic and publishable, and the forward record-family inventory
  plus legacy-validator fence prevents later gate, finding, authorization, and operation-state work from introducing
  adapter-private JSON authorities.

## **Phase 2:** Topology-neutral routing policy

_Purpose:_ Derive review obligations and frontline action from the closed ARC record without coupling policy to
pull-request count, provider choice, or host mechanics.

### `[x]` **2.1 Implement the ordered review-routing reducer**

- _Goal:_ Every valid or malformed routing input deterministically produces one obligation set, stable reasons, and
  no invalid independent-analysis/retrigger pairing.

    - `[x]` **2.1.a Implement fail-closed, risk, and routine bases**
        - Added a field-wise unknown-input normalizer with stable rejected-path diagnostics and conservative defaults,
          plus a typed pure reducer for maximal unknown/sensitive floors and both routine documentation/code bases;
          valid assurance and activity fields survive malformed peers, and any rejection forces the unknown route.

    - `[x]` **2.1.b Apply promote-only ownership and authority effects**
        - Added explicit ascending obligation, frontline, and retrigger lattices; ownership raises independent
          analysis, while design/constitutional/unverifiable authority raises it to required full-final review, with
          stable reason coverage and ceiling routes left unchanged.

    - `[x]` **2.1.c Resolve assurance mode and activation adjustments**
        - Added `Heavy | Novel` terminal assurance after every routing base, then applied independent self-review and
          frontline activity adjustments; inactive methods cannot produce invocations, independent-analysis stays
          unchanged, and formative planning remains per-change exempt in heavier work units.

    - `[x]` **2.1.d Validate outputs and project promotions**
        - Added a typed project-policy callback over normalized facts and strict namespaced promotion records; all
          effects apply through the shared lattices, close over the retrigger invariant, and reject exceptions,
          unknown keys, or malformed output without altering the framework decision.

- _Outcome:_ One topology-neutral public boundary now normalizes every field, reduces all risk/content bases,
  composes framework and project promotions monotonically, applies assurance/activity last, and validates the
  resulting reasoned decision against the closed runtime schema.

### `[x]` **2.2 Establish activity and WU assurance inputs**

- _Goal:_ The pure router receives explicit activity and WU facts, while a declared stronger rubric survives every
  lifecycle transition and fails visibly when it cannot be resolved.

    - `[x]` **2.2.a Keep method activity as an injected routing fact**
        - Added a narrow read port that accepts only effective self-review/frontline booleans, preserves valid peers,
          defaults rejected fields conservatively with diagnostics, and feeds the router without method-file or
          override interpretation; each activity adjustment remains isolated from independent analysis.

    - `[x]` **2.2.b Add the WU review-rubric overlay field**
        - Added `Review Rubric` to the canonical meta projection with `[none]` as semantic absence and one slug-safe
          rubric/method identity as its only value; paths, instructions, lists, and other sentinels reject, managed
          lifecycle rewrites preserve it, and the routing-facts schema explicitly excludes the overlay.

    - `[x]` **2.2.c Resolve WU assurance facts without production method binding**
        - Added a schema-backed WU assurance composer over injected activity and rubric availability; canonical meta
          parsing preserves the branded identity, malformed values reject, and missing or failed lookup resolves to
          an explicit unavailable state without binding discovery, providers, or host policy.

- _Outcome:_ Routing inputs now compose from narrow activity and availability ports plus lifecycle-stable WU metadata;
  the stronger-rubric overlay remains explicit from semantic absence through validated resolution or fail-closed
  unavailability, while method discovery and activation ownership remain outside the record.

### `[x]` **2.3 Project one independent-analysis requirement per deliverable**

- _Goal:_ Each deliverable exposes one lossless, version-neutral independent-analysis projection that Phase 3 can
  bind to an exact gate target without rerunning policy or encoding deferred assurance-group algebra.

    - `[x]` **2.3.a Project one logical obligation record per deliverable**
        - Added a registered immutable obligation projection with stable reasons, rubric identity, retrigger, and
          fixed `count: 1`; one routing decision yields one record, while exemption stays explicit without target-
          bound requirement fields.

    - `[x]` **2.3.b Project obligation and retrigger without a second policy decision**
        - Added a validation-only projector that copies the independent-analysis obligation, reasons, and retrigger
          directly from the routed decision, composes the validated rubric pair, and excludes self-review/frontline
          outputs from the frozen downstream policy input.

    - `[x]` **2.3.c Preserve the multi-deliverable seam**
        - Kept projection cardinality caller-owned: repeated deliverable calls return distinct records, while strict
          routing validation rejects pull-request count and every projection omits grouping, repository, carrier,
          provider, request, and target topology.

- _Outcome:_ The routing boundary now terminates in one version-neutral, schema-owned independent-analysis record
  per deliverable; Phase 3 can bind non-exempt projections to exact targets and add source/admission policy without
  re-running routing or inheriting author/frontline and future assurance-group concerns.

### `[x]` **2.4 Prove routing totality and fail-closed behavior**

- _Goal:_ Exhaustive and property-style tests make the closed reducer and fact boundary auditable rather than
  relying only on six representative examples.

    - `[x]` **2.4.a Exhaust the closed routing matrix**
        - Added exhaustive coverage across all 27,648 schema-accepted fact combinations, proving every input returns
          a valid decision with a congruent obligation/retrigger pair; pinned the complete framework-reason
          vocabulary alongside the existing six readable base-route regressions.

    - `[x]` **2.4.b Prove monotonic promotion and activation properties**
        - Added generated monotonicity assertions for sensitivity, ownership, authority, and project policy plus
          isolation properties for activation and `Class`; centralized the terminal assurance/activity adjustment
          so project promotions cannot reactivate a disabled method.

    - `[x]` **2.4.c Exercise the public classifier-to-router boundary**
        - Added one runtime-validated self-hosting composition boundary and real-Git integration coverage from all
          six canonical statuses through endpoint-aware risk/authority, exact-ref ownership, and routing; malformed,
          path-only, four-status, and missing rename/copy origins all fail closed to the unknown route.

- _Outcome:_ Phase 2 routing is now mechanically closed from canonical Git input through one total, monotonic policy
  result: every schema combination is valid, project promotions cannot bypass activation, and no legacy or malformed
  change representation can reach normalized routing facts without the maximal unknown floor.

## **Phase 3:** Gate contract and evidence migration

_Purpose:_ Move the review gate onto the forward-only exact-target contract, preserving strict evidence identity
while adding local satisfaction and typed retrigger applicability without claiming that review settlement is merge
readiness.

### `[x]` **3.1 Version the gate target, request, requirement, and receipt contracts**

- _Goal:_ The controller admits the new semantic identities only through an explicit forward contract version,
  while retaining a bounded parser for legacy evidence and projecting only exact-target review obligations.
- _Context:_ Implements Design §1.4 over `core/contracts.ts`, `core/execution.ts`, `core/receipt-payload.ts`, and
  the existing exact-key validation suite.

    - `[x]` **3.1.a Characterize the schema-v1 compatibility boundary**
        - Added one focused fixture family across change request, requirement, source request, receipt envelope,
          projection, and ledger parsing; exact keys and bare digests remain readable without canonical-prefix
          coercion, while satisfaction is explicitly characterized only inside the legacy requirement family.

    - `[x]` **3.1.b Define the forward review-target and request schemas**
        - Added strict registered v2 target/request and ID-preimage schemas plus validating constructors; canonical
          semantic IDs remain distinct from bare Git OIDs, one request binds one repository/target/requirement/
          carrier, actor and hosted-carrier invariants reject, and retargeting cannot retain a stale derived ID.

    - `[x]` **3.1.c Define forward requirement and receipt schemas**
        - Added strict registered v2 requirement/preimage and receipt schemas with inferred types and validated
          constructors. Requirements derive exact target-bound IDs from normalized policy inputs; receipts bind the
          exact request, target, requirement, rubric, evaluator, attestor, and explicit nullable applicability/
          provider identities, with golden vectors covering domains, ordering, sensitivity, and self-ID exclusion.

    - `[x]` **3.1.d Migrate controller projections and ports**
        - Added a dormant strict-v2 chain reducer and neutral projection, v2-specific receipt/provider/host ports,
          bounded GitHub check rendering, and a private runtime entrypoint. Exact identities now cross each boundary
          without admitting legacy evidence or moving provider finding normalization into the neutral core.

### `[x]` **3.2 Bind rubric, guidance, and policy identities**

- _Goal:_ Gate satisfaction proves both the required independent-analysis contract and the exact instructions a
  carrier received, while policy identity changes whenever obligation or admission semantics change.
- _Context:_ Implements Design §§1.4 and 2.1.

    - `[x]` **3.2.a Generate the independent-analysis rubric identity**
        - Added one immutable typed baseline covering exact complete scope, evaluator isolation, the five-dimension
          implementation audit, finding floor, and clean rule. Its registered domain-separated preimage generates
          `independent-analysis/v1` plus a pinned digest; semantic drift requires a version change while prose stays
          outside the identity.

    - `[x]` **3.2.b Bind carrier guidance projections**
        - Added a registered canonical guidance preimage over the generated baseline and exact effective project
          documents. Codex resolution and locator/adapter qualification now expose and verify the rubric pair plus
          forward guidance digest; missing, stale, unreadable, nested-conflicting, or mismatched guidance cannot
          qualify, while the schema-v1 command digest remains explicitly bounded to compatibility use.

    - `[x]` **3.2.c Expand policy identity inputs**
        - Added a registered domain-separated policy preimage over normalized obligation, source qualifiers,
          admission, rubric identity, and retrigger semantics. Requirement construction now derives the digest and
          validation recomputes it; stale receipts fail membership after any covered policy input changes.

### `[x]` **3.3 Implement exact retrigger and carry-forward proofs**

- _Goal:_ Evidence remains attached to the surface actually reviewed: exact incremental chains may advance it,
  disjoint tails may carry it, and interacting or final-full conditions retrigger only what policy requires.
- _Context:_ Implements Design §1.4 and Success Criterion 9.

    - `[x]` **3.3.a Validate incremental and full-final coverage chains**
        - Added a forward-only reducer over exact v2 target, requirement, request, and receipt links. It accepts
          contiguous same-source generations, rejects broken or ambiguous bindings and incomplete results, and
          requires a terminal full record at the settled target for `full-final`.

    - `[x]` **3.3.b Generalize lifecycle-tail carry-forward**
        - Added a registered v2 lifecycle-tail proof beside the operational v1 bridge. Git classification now binds
          exact prior/current targets and preserves coverage only when reviewed-surface tree, path-manifest, semantic,
          policy, rubric, and source identities agree; its strict applicability is limited to review coverage.

    - `[x]` **3.3.c Classify base-reconcile interaction**
        - Added registered v2 applicability proof/preimage schemas and a canonical-change classifier that normalizes
          exact reviewed, delta, and intersection manifests. Disjoint deltas carry, interactions and conflicts
          retrigger incrementally, and receipt coverage must match the intersection or complete stronger delta.

    - `[x]` **3.3.d Wire applicability into controller reduction**
        - Added a dormant controller reducer that validates typed applicability and lifecycle proofs, carries only
          policy-compatible prior coverage, requires proof-bound incremental receipts, invalidates stale flights,
          and projects coverage treatment through the host check. Runtime cases cover bookkeeping, disjoint,
          interacting, conflict, unbound proof, and final-full paths.

### `[x]` **3.4 Admit local exact-head independent-analysis evidence**

- _Goal:_ A qualified fresh local evaluator can satisfy `independent-analysis/v1` at an exact head without a pull
  request or hosted provider, through a repository-shared local receipt authority that hosted gates never trust
  implicitly.
- _Context:_ Implements Design §2.1 and Success Criterion 4.

    - `[x]` **3.4.a Add the local-change-set carrier contract**
        - Added a strict local admission contract that revalidates the full repository/base/head snapshot, derives
          only the fixed `local-change-set` carrier with a null change-request identity, rejects uncommitted and
          unborn state, and binds separated author, evaluator, and attesting-runtime identities.

    - `[x]` **3.4.b Implement the local receipt authority**
        - Added a registered repository-scoped v2 receipt ledger and a Git-common-directory store with bounded
          advisory locking, version-checked atomic publication, idempotent replay, and fail-closed conflict/partial
          state handling. The reusable publisher separates evidence and operation namespaces, while explicit hosted
          import revalidates bindings before appending through the destination authority.

    - `[x]` **3.4.c Produce an attested local review receipt**
        - Added a strict normalized-result attestor that revalidates the still-current target, requirement, local
          carrier, rubric, evaluator, and runtime/mechanism bindings before appending. Only complete clean or
          finding results attest; partial, unavailable, failed, stale, self, or mismatched runs fail before storage.

    - `[x]` **3.4.d Qualify local evidence in gate reduction**
        - Added explicit `local` / `hosted` / `both` source qualification over carrier kind, accepted rubric source,
          and provider-event shape. Forward evaluation and carry/direct controller paths now refuse unqualified
          evidence; local receipts satisfy the shared obligation only where project channel policy admits them.

    - `[x]` **3.4.e Cover the local carrier-to-evidence path**
        - Added real-storage integration coverage from local request construction through clean/finding attestation,
          durable reads, and check projection. Separate publishers prove sibling-worktree serialization; stale heads,
          conflicting replay, hosted import validation, namespace isolation, and cross-machine absence fail closed.

### `[x]` **3.5 Migrate strict parsers and invalidate legacy evidence safely**

- _Goal:_ Existing installations fail safely across the forward migration: legacy records remain diagnosable, new
  records parse strictly, and no stale evidence is silently promoted.
- _Context:_ Implements Design §1.4's rollout contract and Success Criterion 8.

    - `[x]` **3.5.a Dispatch parsers by explicit contract version**
        - Added family-specific repository target, requirement, workflow/provider request, receipt, and ledger
          dispatch over explicit schema/semantics pairs. V1 retains exact bare encodings; v2 reuses canonical
          identity validators, while unknown versions, mixed composites, mismatched semantics, and coercion fail.

    - `[x]` **3.5.b Mark legacy evidence ineligible**
        - Added an audit-only eligibility result for parsed v1 receipts with null forward request-reuse and closure
          authority; only exact v2 composites receive membership keys. Mixed/downgraded receipts, requirements, and
          projections fail, while all five legacy provider severities and existing dispositions remain unchanged.

    - `[x]` **3.5.c Update durable and workflow fixtures**
        - Renamed operational qualification builders as explicit legacy-v1 fixtures and marked repair rehearsal data
          with its live contract posture. Forward target/request/receipt, local-store, and check fixtures remain v2
          contract proofs, with runbook text stating that they are dormant and carry no hosted merge authority.

## **Phase 4:** Shipped review doctrine and method family

_Purpose:_ Give every review activity, rubric, standard, response cycle, and invariant one explicit layer owner,
with adopter-facing contracts mirrored through the package source.

### `[x]` **4.1 Ship the review activity, rubric, and standard contracts**

- _Goal:_ Author review, frontline review, implementation audit, and independent analysis are separately named,
  overridable surfaces whose contracts cannot be confused with carrier or evidence roles.

    - `[x]` **4.1.a Rename author diff review to self-review**
        - Renamed the package-authoritative method and project mirror to `self-review`, shipped it active by default,
          retained its aggregate author-side/non-evidence contract, and migrated installation, classification,
          workflow declarations, indexes, current references, and tests to the new identity.

    - `[x]` **4.1.b Add the implementation-audit rubric**
        - Shipped the package-authoritative `implementation-audit` method and project mirror with the five
          medium-neutral change-realization dimensions, complete-change clean rule, grounded finding contract, and
          override-compatible baseline; registered it for installation and integration-time loading.

    - `[x]` **4.1.c Add frontline-review and independent-analysis contracts**
        - Shipped package/project method pairs separating inactive advisory pre-publication review from the satisfying
          non-author exact-change-set standard. Both bind the shared mechanism and rubric without carrier commands,
          controller procedure, or project source policy; the satisfying contract points to its typed v1 identity.

    - `[x]` **4.1.d Reconcile the adversarial-review mechanism**
        - Made launch policy caller-owned: offers use the existing callout while required analysis invokes the same
          mechanism unconditionally. Frontline and local satisfying roles now bind the implementation rubric through
          this mechanism, with reviewers read-only and only an authorized adapter able to attest an exact-target run.

    - `[x]` **4.1.e Bind activatable methods to routing facts**
        - Added the typed `self-review: true` / `frontline-review: false` registry, registry-scoped optional `active`
          frontmatter, package-corpus/default validation, and per-method project resolution with diagnostic fallback.
          The adapter binds effective booleans through the existing routing port independently of override state.

### `[x]` **4.2 Upgrade review triage to severity × disposition**

- _Goal:_ Every finding carries one materiality level and one approved action, with pure-polish nits represented
  orthogonally and blocker/major settlement deterministic across local and hosted review.

    - `[x]` **4.2.a Rewrite the override-proof triage contract**
        - Replaced the conflated four-way labels with orthogonal `blocker | major | minor` severity,
          `fix | defer | reject` disposition, and minor-only code-review `nit`; the method contract now requires
          independent source verification and approval of the complete set before any mutation.

    - `[x]` **4.2.b Add the high-miss-cost DEV-RULES anchor**
        - Added a concise package/project universal rule requiring independent source verification and approval of
          the complete proposed disposition set before any finding-driven fix, independent of reviewer or channel;
          procedural classification remains in `review-triage`.

    - `[x]` **4.2.c Migrate finding and settlement records**
        - Added registered, inferred v2 finding, settlement, and conversation-closure schemas; forward receipts,
          local attestation, reducers, provider normalizers, and settlement runtimes now carry the shared severity ×
          disposition primitives. Provider labels normalize only at adapter boundaries, `nit` requires explicit
          pure-polish evidence and minor severity, and legacy labels remain confined to v1 diagnostic evidence.

    - `[x]` **4.2.d Update disposition reports and commit records**
        - Added the channel-neutral report and commit-body formats plus registered canonical disposition-set and
          approval schemas. Exact target, policy, rubric, findings, rationale, recommendation, questions, and actors
          now bind approval; forward settlement rejects stale, partial, changed, or absent approval before mutation.

- _Outcome:_ Review findings now move through one override-proof source-verification → complete proposal → exact
  approval boundary, with shared severity/disposition records across local and hosted channels and deterministic
  evidence that prevents individual fixes from bypassing the approved set.

### `[x]` **4.3 Ship the channel-neutral review-response contract**

- _Goal:_ Local and hosted findings enter one bounded author-side cycle that verifies, approves, fixes, validates,
  persists, and returns authority-specific closure work to its adapter.

    - `[x]` **4.3.a Define review-response inputs and outputs**
        - Shipped the configurable `review-response` method and registered strict input/plan schemas. The planner
          accepts exact targets, normalized findings, routing, approval, evidence, and capability facts only; it
          emits one of the six response states with legal capabilities, precomposed action text, approved
          dispositions, verification references, old/new targets, and explicit blocking status.

    - `[x]` **4.3.b Encode the bounded response cycle**
        - Bound method execution to the planner-selected author leaf: complete-set approval or one approved fix
          increment with quality evidence. Persistence, adapter reply/closure, and retrigger selection remain
          caller-owned; changed heads return through `reroute`, and blocked states cannot mutate.

    - `[x]` **4.3.c Define channel-specific etiquette boundaries**
        - Local review now ends at its disposition report; hosted plans emit only per-finding actions backed by
          authenticated reply/thread capabilities. Strict schemas reject local, duplicate, and foreign conversation
          actions, while the method forbids roll-up noise, provider impersonation, and resolution-as-authority.

    - `[x]` **4.3.d Define shared review-operation state**
        - Added the injected, versioned `ReviewOperationStateStore` port and registered inferred `frontline-run` /
          `review-suspension` schemas. Strict variants bind exact invalidation and re-entry facts while rejecting
          controller conclusions, approvals, authorizations, receipts, narrative actions, and unknown fields.

    - `[x]` **4.3.e Implement the project operation-state adapter**
        - Added a Git-common-directory operation store over the shared bounded-lock/atomic-publish primitive. Strict
          version and identity checks preserve recoverable records, identical sibling-worktree replay is idempotent,
          and facts-only suspension reconstruction remains structurally outside receipt and evidence parsing.

- _Outcome:_ One typed response family now spans deterministic author actions, channel-owned conversation effects,
  and resumable local operation continuity while preserving exact approval boundaries and keeping operational state
  categorically outside review evidence authority.

### `[x]` **4.4 Retire the legacy toggle and reconcile hook vocabulary**

- _Goal:_ The review feature family uses method activation and settled lifecycle hooks, while generic commit/push/PR
  extensions retain their names and capabilities without carrying semantic review roles.
- **Additional Context:** `strategy-configurability-architecture.md` §§ Extension Points and Method Overrides;
  `strategy-workflow-authoring.md` §§ Author-side Declaration Rule and Body Conventions.

    - `[x]` **4.4.a Remove `review.pre_merge` from the live config surface**
        - Removed the legacy key from package/project config, validation, typed/default settings, operator docs, and
          fixtures. Integration now keys local preflight directly from effective `self-review` activation, and the
          retired key fails shell validation as unknown instead of surviving behind a renamed config toggle.

    - `[x]` **4.4.b Preserve generic extension semantics**
        - Restored the project `pre-pr-open` extension to its inactive, action-neutral package baseline, removing
          classification, billing-label, provider, triage, and review-routing policy while retaining the same
          proposed-change-request input, lifecycle fire point, authored-order halt, and retry-safe contract.

    - `[x]` **4.4.c Reconcile workflow declarations and fire points**
        - Consolidated integration's duplicate pre-push prose into one workflow-wide contract while retaining exact-
          head `pre-merge` settlement, and made sync retry re-fire the extension. The trigger audit now checks
          declaration plus prior firing for every class-tagged push, wrapper command, and pushing `arc sync` across
          integration, Errand, and lifecycle workflows; guidance assigns direct CLI/raw enforcement to hooks/hosts.

    - `[x]` **4.4.d Update configurability documentation and validation**
        - Documented activation independently from override composition, aligned method/extension inventories and
          project/package copies, and closed both frontmatter schemas against unknown or cross-kind fields. Extended
          package-neutrality, parser, corpus, and framework-sync coverage around the settled review surfaces.

- _Outcome:_ Review customization now has one owner per concern: registered method activation controls whether an
  activity runs, method overrides control how it runs, and generic extensions retain operation-boundary semantics.
  Closed-schema and corpus checks prevent the retired toggle or review-specific extension drift from returning.

### `[x]` **4.5 State the enforcement and rubric-delivery boundaries**

- _Goal:_ Shipped guidance tells projects exactly which surfaces are ergonomics, which evidence satisfies review,
  and which host-side check can enforce merge safety—without claiming this repository's controller is operational.

    - `[x]` **4.5.a Document agent ergonomics versus host guarantee**
        - The ARC brief, session-operations strategy, and review method contracts now identify agent-side review as
          best-effort ergonomics and reserve structural merge safety for a configured required host check. The
          self-hosting technical overview separately records that its controller is not operational merge authority
          and preserves the established manual integration path pending later qualification and promotion work.

    - `[x]` **4.5.b Project the rubric into native reviewer surfaces**
        - Added a strict additive project-rubric schema plus generic projection, exact-source validation, and a
          package-neutral human checklist renderer derived from the typed `independent-analysis/v1` baseline. The
          projection carries rubric identity and content only; its closed schema has no coordination, author-state,
          approval, receipt, or controller-state channel.

    - `[x]` **4.5.c Document the generic adapter boundary**
        - Documented the provider-neutral delivery seam: adapters project the typed baseline plus optional additive
          project dimensions into native instruction/configuration surfaces, validate effective exact-target content,
          and record its guidance identity without making that projection rubric, evidence, or merge authority.

- _Outcome:_ Review authority is now explicit end to end: the typed baseline owns the satisfying standard, native
  projections prove delivered content, attestations establish eligible exact-target evidence, and only a configured
  required host check can structurally block merge. Repository-specific carrier rollout remains unclaimed.

## **Phase 5:** Frontline execution and carrier binding

_Purpose:_ Turn the router's frontline decision into a provider-neutral, authorization-preserving execution path
that shapes review spend without producing satisfying evidence.

### `[x]` **5.1 Resolve source fallback and invocation precedence**

- _Goal:_ One pure resolver turns activation, smart routing, source binding, and a one-run override into a complete
  `skip | offer | attempt` record without probing or executing the selected source.

    - `[x]` **5.1.a Implement the source fallback chain**
        - Added deterministic invocation → developer → project → unbound resolution through an injected preference
          port and local `arc.frontlineSource` / `review.frontline_source` adapter. The closed registry maps safe IDs
          only to typed agent capability handles or direct executable-plus-argv descriptors; invalid values and
          storage failures remain diagnosed, and no self-hosting provider binding ships here.

    - `[x]` **5.1.b Apply invocation override precedence**
        - Added a strict `inherit | force | skip` invocation schema and pure precedence resolver: `force` activates
          an attempt for one run, `skip` rejects source input, and `inherit` preserves smart routing while allowing
          source selection without persisting either override.

    - `[x]` **5.1.c Produce the complete semantic result**
        - Composed invocation and source resolution into a validated `frontline-review/v1` record with stable reasons,
          typed source descriptors, bounded pass allowance, and precomposed review or binding text. Source-less
          attempts become actionable offers; skip and attempt invariants are schema-enforced, and diagnostics survive.

    - `[x]` **5.1.d Expose a workflow-facing resolution verb**
        - Added `arc review frontline resolve <file | ->` and an injectable API that accept explicit versioned
          change-set facts and invocation intent, fail malformed facts closed, and emit one JSON result. The CLI
          installs no carrier bindings, while the API only resolves closed typed descriptors and never executes one.

- _Outcome:_ Frontline resolution is now one provider-neutral path from normalized change facts through smart action,
  one-run precedence, private/project source fallback, and a versioned workflow result. Configuration can select safe
  source IDs, but carrier preparation and process authorization remain separate downstream stages.

### `[ ]` **5.2 Execute frontline carriers with typed outcomes**

- _Goal:_ Accepted frontline attempts execute the selected carrier against the exact aggregate target and return a
  truthful provider-neutral outcome without ever producing independent-analysis evidence.
- _Context:_ Implements Design §3's two-stage resolver/adapter boundary.

    - `[x]` **5.2.a Add agent and command carrier adapters**
        - Added effect-free preparation for registered agent handles and direct executable-plus-argv descriptors.
          Harness adapters return `ready | needs-authorization | unavailable | invalid`; only `ready` carries an
          execution capability, while authorization needs become a precomposed one-run offer without spending a pass.

    - `[x]` **5.2.b Normalize execution outcomes**
        - Added a validated provider-neutral outcome record binding every result to its typed source, exact review
          target, and bounded pass. Explicit clean and finding results remain distinct; rate limits normalize to
          unavailable, while ambiguous, partial, malformed, stale-head, and provider failures can never become clean.

    - `[x]` **5.2.c Feed findings through the universal checkpoint**
        - Added a narrow adapter admitting only normalized frontline finding outcomes into the existing local
          `review-response` planner. Complete source-verified disposition approval gates fix capability; changed-target
          verification, affected-gate evidence, persistence, and rerouting remain required without carrier authority.

    - `[ ]` **5.2.d Enforce bounded follow-up policy**
        - Permit one follow-up only after at least one approved `major | blocker` fix changes the target; do not spend
          it on minor/nit-only changes.
        - Prove reduced project limits, cap exhaustion, and provider unavailability remain non-clean and advisory.

### `[ ]` **5.3 Qualify structured CodeRabbit output with a safe fallback**

- _Goal:_ The repository uses CodeRabbit structured output only when bounded live observations plus reproducible
  failure fixtures prove enough of its contract for truthful normalization.
- _Context:_ Resolves the spec Open Question without reopening provider-neutral architecture.

    - `[ ]` **5.3.a Capture bounded `--agent` qualification fixtures**
        - Bound live probes to naturally observable clean, findings, empty-findings, and scoped-directory shapes
          without spending unrelated PR-review capacity or deliberately inducing provider failures.
        - Capture rate-limit, malformed, stale-head, refusal, and process-failure behavior through sanitized recorded
          output or synthetic injected-command fixtures; record the CLI version/behavior assumptions in project-only
          test data or notes.

    - `[ ]` **5.3.b Select structured or plain compatibility parsing**
        - Implement and test the structured parser only if every required outcome is distinguishable; otherwise keep
          `--plain` as the adapter boundary and document the limitation.
        - Treat any required structured success shape not observed within the bounded live probe as insufficient
          qualification rather than extending the probe indefinitely or inferring a schema.
        - In plain mode, emit `findings` only from explicit parsed findings and `clean` only from a version-pinned,
          fixture-proven explicit clean marker; empty/unknown output, parse drift, refusal, or failure stays non-clean.

    - `[ ]` **5.3.c Integrate CodeRabbit frontline execution**
        - Bind the project source to the selected adapter, surface rate limits truthfully, and retain the PR-review
          provider as a separate hosted-review pool and evidence source.

### `[ ]` **5.4 Wire frontline into work-unit and Errand publication**

- _Goal:_ Both publication paths execute the router-selected frontline action at the aggregate pre-PR boundary,
  then enter the ordinary PR lifecycle with an exact, settled head.
- **Additional Context:** `strategy-workflow-authoring.md` §§ Author-side Declaration Rule, Prose economy, and Verbs
  over mechanics.

    - `[ ]` **5.4.a Add the work-unit frontline fire point**
        - Starting from Phase 4's effective `self-review` callsite, add `review-routing` resolution followed by
          conditional `frontline-review` execution at the final-push/pre-creation boundary.
        - Order final push → frontline → approved fix/gates/commit/push → optional follow-up → generic
          `pre-pr-open` → change-request creation; re-resolve the exact target after every fix.

    - `[ ]` **5.4.b Add the Errand frontline fire point**
        - Apply the same resolver and response cycle in `run-errand.md`, preserving auto/reviewed merge-lane policy
          as a project presentation rather than a routing input.
        - Keep partial-protection direct-base Errands outside PR-only mechanics.

    - `[ ]` **5.4.c Surface frontline outcome without gate claims**
        - Carry clean/findings/unavailable/cap results into publication orientation for attention/spend decisions,
          but never emit a receipt or weaken a required independent-analysis obligation.
        - Persist the registered `frontline-run` variant through `ReviewOperationStateStore`, keyed by exact target,
          source, and generation; unchanged-target retries reuse it, head/source/policy/generation changes invalidate
          it, and gate reduction rejects it.
        - Remove provider-specific commands and billing prose from shipped workflow bodies.

    - `[ ]` **5.4.d Validate extension and publication contracts**
        - Extend `pr-open-extensions`, `review-gate-workflows`, framework-sync, and relevant Errand/WU workflow tests
          for ordering, unchanged-target retry/re-entry, active/inactive method, fix-induced invalidation, preparation
          offers, persistence replay/conflict, and failure paths against Phase 4's operational-state adapter.

## **Phase 6:** Review response and integration autonomy

_Purpose:_ Preserve exact-head authority and finding-fix approval before mutation while allowing a fully reviewed
provisional integration candidate to compose, reconcile, suspend, and re-enter between genuine developer decisions.

### `[ ]` **6.1 Graduate the project coordinator behind review-response**

- _Goal:_ Local and hosted obligations enter one source-neutral coordination cycle while
  `coordinate-pr-review.md` retains repository-specific host/provider mechanics and the reusable finding cycle
  lives once in `review-response`.
- _Context:_ Implements Design §§2.1–2.2 and 8 without exporting the half-wired controller as framework authority.

    - `[ ]` **6.1.a Split neutral response from project action/await mechanics**
        - Refactor the coordinator to call `review-response` for verification, approved dispositions, fix
          increments, and rerouting; retain typed `next-action`/`perform-action`/`await` commands project-side.
        - Remove duplicated triage procedure without weakening exact-head or actor validation.

    - `[ ]` **6.1.b Adapt controller findings and native conversations**
        - Normalize both into the method input while retaining distinct closure capabilities and immutable source
          loci.
        - Return adapter handles for controller receipts, provider replies, thread state, and current decisive review
          instead of exposing those mechanics in the method.

    - `[ ]` **6.1.c Recompose after every head or policy change**
        - Invalidate the loop scope after a fix, base merge, lifecycle tail, provider event, or policy identity
          change; re-read canonical target and route before another action.
        - Invalidate a bound composition basis after a substantive fix or interacting reconcile; carry it only when
          typed applicability proves the WU delta unchanged.
        - Extend project workflow/controller tests for stale, exempt, recommended, required, and attention arms.

    - `[ ]` **6.1.d Coordinate source-neutral independent analysis**
        - Consume routing plus explicit `local | hosted | both` channel policy, materialize the exact
          target/requirement/request, invoke the selected carrier, normalize and attest eligible terminal evidence,
          reduce the requirement, and send findings through `review-response` without adding a resident engine.
        - For local review, launch `adversarial-review` under `implementation-audit` without author conclusions;
          require the Phase 3 exact-head attestor before clean satisfaction, and reroute/relaunch after an approved
          fix changes the target.
        - Keep unavailable/partial/failed results non-satisfying, blocking only required obligations; retain hosted
          action/await and conversation authority in project adapters, and expose the same cycle to WU and Errand
          callers.

### `[ ]` **6.2 Enforce approved dispositions and authoritative settlement**

- _Goal:_ No local or hosted finding mutates the tree before the complete disposition set is approved, and no
  conversation closes without the authority that owns it.
- _Context:_ Implements Design §§2.2 and 4–5 plus Success Criterion 6.

    - `[ ]` **6.2.a Add an explicit disposition-set approval state**
        - Add a canonical `DispositionSet` digest over exact old target, normalized finding identities/loci,
          severity, disposition, rationale, policy/rubric identities, and proposer; approval binds the distinct
          approving actor and time.
        - Define, infer, and register the Zod-authoritative proposed/approved `DispositionSet` variants; keep the
          digest input and approval transition strict at runtime.
        - Represent proposed/approved states in the response runtime and adapter receipts without changing the exact
          schema-v1 parser or treating its past-tense actions as v2 approval.
        - Build `test-first` rejection cases for partial approval, stale approval, changed finding sets, or fixes
          attempted without approval.

    - `[ ]` **6.2.b Apply one authorized review-fix increment**
        - Update `runtime/finding-settlement.ts`, head-mutability guards, receipt payloads, and local commit handling
          so a pre-mutation `FixAuthorization` references the approved-set digest before a new head exists, then one
          consumption record binds the actual old→new head, applying actor, and verification references.
        - Define, infer, and register the `FixAuthorization` and consumption schemas, including their single-use and
          old→new target invariants, instead of persisting an interface-only mutation token.
        - Reject missing, stale, ambiguous, mismatched, or reused authorizations before persistence; affected gates
          must pass before commit/push fire sites release.
        - Keep defer/reject head-stable and preserve commit/push interlocks.

    - `[ ]` **6.2.c Close each channel with its own authority**
        - Preserve source-confirmed closure for controller findings; require provider decisive state/conversation
          status for native findings; keep local disposition reports as the terminal record.
        - Reject generic approval, bare thread mutation, coordinator claims, and provider ignore commands as closure.

    - `[ ]` **6.2.d Make severity gating deterministic**
        - Add project-policy `minorGating: blocking | record-only`, default package and self-hosting to `record-only`,
          and force `nit` to record-only while keeping every finding in the approved disposition set.
        - Block terminal settlement on unresolved `blocker | major` and configured blocking minors; never let ARC's
          record-only result override provider-native decisive state or a required conversation.
        - Test mixed severities, both minor policies, recurrences, grouped nits, source closure, and provider-owned
          conversations without an extra “another round?” prompt.

### `[ ]` **6.3 Add resilient review suspend-and-reenter behavior**

- _Goal:_ Asynchronous review can outlive the current process, context window, or machine and resume from durable
  `Integrating` state without a live-session pin or silent stall.
- _Context:_ Implements Design §2.2's watcher → scheduled wakeup → human re-entry capability order.

    - `[ ]` **6.3.a Define the durable suspension record and re-entry check**
        - Consume the registered `review-suspension` variant and version-checked `ReviewOperationStateStore` from
          Task 4.3.d, carrying WU-or-Errand identity, repository/request/exact target, source/generation,
          policy/rubric identities, deadline, and wakeup-deduplication token.
        - Derive live host state, response plan, and narrative resume text afresh; never persist controller
          conclusions or use the meta's free-form `Next Action` as operational authority.
        - Build `test-first` coverage for clean/absent-record reconstruction, stale head, completed review, findings,
          timeout, failed provider state, and version-conflict refusal.

    - `[ ]` **6.3.b Prefer the promoted watcher capability when available**
        - Add an injected `ReviewWakeupCapability` seam, exercise it with fakes, and leave the production binding
          absent until review-gate enforcement promotion.
        - Never invoke, await, or infer availability from the current controller/wakeup modules before promotion.
        - Keep watcher absence an ordinary fallback, not a degraded clean result.

    - `[ ]` **6.3.c Support scheduled and human re-entry fallbacks**
        - Let harness-native scheduling arm a bounded wake/recheck where supported; otherwise emit the exact human
          resume condition and leave the WU or Errand suspended.
        - Convert bounded wait timeout/provider failure into the same explicit re-entry state.

    - `[ ]` **6.3.d Validate session and machine resilience**
        - Add workflow/session tests for WU and Errand re-entry, handoff during review, next-session and new-machine
          reconstruction, duplicate wakeups, stale scheduled actions, and idempotent canonical rereads.

### `[ ]` **6.4 Reshape work-unit composition and late base reconcile**

- _Goal:_ Integration returns the developer only for disposition approval and merge authorization, while content
  composition and safe late base reconciliation form a provisional candidate that is reviewed in full at the
  exact-head merge decision and cannot appear merge-ready before its required lifecycle products exist.
- **Additional Context:** `strategy-workflow-authoring.md` §§ Prose economy, Verbs over mechanics, and Interlock
  markers; `strategy-procedure-evolution.md` §§ Forward-Compat Principles 1–6.

    - `[ ]` **6.4.a Define and assemble the provisional integration candidate**
        - Update the Review-Increment Invariant and `integrate-work-unit.md` with the sole bounded exception: after
          implementation findings settle, cleanup, archive composition/closeout, lifecycle sweep/readiness regen,
          and typed safe reconcile may commit/push before their structured review, but no implementation or finding
          fix may do so and no candidate may merge without exact-head authorization.
        - Name `review-settled` as candidate-entry state, never merge readiness. Treat any pre-composition “merge once
          review settles” direction as permission to advance autonomously to the final interlock, not as authority
          over the not-yet-known candidate head.
        - Remove both composition `proceed` turns; retain exception stops for alignment disagreement, failed gates,
          conflict, or unexpected state.
        - Bind composition to the canonical settled WU change set, completed task outcomes, spec intent/non-goals,
          success-criteria disposition, and verification evidence; stop on material disagreement and recompose after
          a fix or interacting reconcile.
        - Enter candidate assembly only after the source-neutral WU review cycle has reduced the routed obligation
          to settled; a raw local clean report, launched pass, or unattested result is not `review-settled`.

    - `[ ]` **6.4.b Harden public release notes and completion composition**
        - Require release notes to describe only shipped reader/operator-visible outcomes in public language: never
          leak WU names/slugs, task/phase references, branches, roadmap pointers, internal review/provider machinery,
          or other internal development jargon, and never claim planned-but-unshipped work; allow publicly supported
          review concepts and configuration when they are the shipped outcome.
        - Use `Infrastructure` only for externally meaningful operational change; bind breaking-change claims to an
          affected stability contract and migration; make Completion Notes distinguish delivered scope, material
          deviations/supersessions, and verified evidence without repeating history.
        - Treat task/notes cleanup, cohort closeout, archive moves, readiness regeneration, and composition as one
          candidate tail whose exact diff—not excerpts alone—the final interlock surfaces.

    - `[ ]` **6.4.c Consolidate to one late base-reconcile location**
        - Make base reconcile the candidate's final mutation site; append-only merge a clean/disjoint base OID under
          typed applicability and stop on conflict, interaction requiring review, or analyzer/host disagreement.
        - After any append-only merge, push and re-run CI/routing before `pre-merge`; carry composition only under a
          proof that the WU delta is unchanged, and loop to the same location if the base moves again.

    - `[ ]` **6.4.d Preserve an unbroken exact-head merge window**
        - Verify the cadence-required composition/lifecycle products through authoritative lifecycle state, fire
          final `pre-merge`, read checks/threads/requirements, bind the approved head, obtain explicit merge
          authorization over the complete candidate-tail diff, revalidate head and base, and merge with no
          intervening mutation or review action.
        - Prohibit `gh pr merge`, auto-merge enablement, or any queued merge before those products exist and the
          final integration-interlock fires; refuse prospective authorization after any candidate mutation.
        - Keep the integration-interlock as the sole merge authority.

    - `[ ]` **6.4.e Update candidate correction, resume, and failure behavior**
        - Make requested composition corrections append, rerun affected gates/routing, and refire the interlock;
          rework fresh/open/merged PR re-entry around the suspendable cycle and recognize an open candidate whose
          branch projection already swept the WU and records `Shipped`.
        - Extend integration workflow tests for exact-tail surfacing, internal-jargon rejection guidance,
          pre-composition merge/auto-merge refusal, prospective approval rejection, cadence-specific product checks,
          disjoint/interactive reconcile, conflict, post-composition failure, stale approval, open swept-candidate
          resume, already-merged resume, and cleanup; corpus-check that every WU merge command is dominated by
          required lifecycle products and the final interlock.

### `[ ]` **6.5 Align Errand review and final-head settlement**

- _Goal:_ Full-protection Errands use the same routing, response, retrigger, and final-head authority as work units
  without inheriting WU composition or task-list ceremony.
- _Context:_ Implements Design §§3, 5, and 8.

    - `[ ]` **6.5.a Recompose Errand review around the shared methods**
        - Replace inline provider/triage procedure in `run-errand.md` with review routing, optional frontline,
          independent-analysis coordination, and `review-response`.
        - Reuse the vehicle-neutral response-state store and wakeup fallbacks without inventing WU meta or task-list
          state for Errands.
        - Preserve atomic determinacy as a routing fact and auto/reviewed merge lane as downstream presentation.

    - `[ ]` **6.5.b Preserve exact final-head settlement and merge authority**
        - Apply retrigger/carry-forward, generic extensions, and final `pre-merge` ordering before the existing
          integration-interlock; retain direct-base behavior under partial protection.
        - Keep Errands explicitly outside WU composition-product requirements by vehicle while preserving their own
          exact-head final interlock; never infer that exception from absent or malformed WU state.

    - `[ ]` **6.5.c Extend Errand lifecycle coverage**
        - Test clean, findings/fix, unavailable frontline, recommended/required independent review, re-entry,
          auto-merge, owner-review, and already-merged cleanup arms.

## **Phase 7:** Rollout and cross-surface coherence

_Purpose:_ Reconcile project bindings, hosted guidance, package mirrors, and end-to-end coverage so the new review
architecture lands as one coherent forward contract.

### `[ ]` **7.1 Migrate self-hosting policy and hosted-review guidance**

- _Goal:_ Repository-specific policy binds the neutral records, local/hosted sources, and native guidance without
  preserving rejected lanes or implying that live enforcement is enabled.
- _Context:_ Implements Design §§1.4, 2.1, and 8.

    - `[ ]` **7.1.a Replace the self-hosting lane decision**
        - Migrate the complete six-module `policy/self-hosting/` subsystem—`lane.ts`, `risk.ts`, `decision.ts`,
          `qualification.ts`, `reduction.ts`, and `schema.ts`—plus its consumers/tests to normalized ownership,
          authority, risk, routing, channel, and source/admission records.
        - Keep `auto | reviewed` only as a derived display/CI compatibility result where still consumed; do not add
          the downstream qualification WU's lifecycle-readiness adapter here.

    - `[ ]` **7.1.b Bind local, hosted, and human sources**
        - Declare local runtime identities, hosted CodeRabbit/Codex, and qualified-human sources with qualifiers,
          baseline/project guidance identities, admission mode, closure capability, and request mechanism in project
          policy without turning provider availability into obligation policy.
        - Keep evaluator, attestor, approving/applying actor, and hosted-import authority distinct; preserve the
          explicit local receipt/import boundary from Phase 3.
        - Preserve manual authority and inactive live-controller posture until qualification/promotion completes.

    - `[ ]` **7.1.c Update native review instruction projections**
        - Apply Phase 4's generic projector through stable managed boundaries to the hosted Codex rubric block in
          root `AGENTS.md` (inherited by `CLAUDE.md`), CodeRabbit's repository instruction surface, and the local /
          qualified-human checklist in `.github/review-gate-attestation.md`.
        - Deliver only the typed baseline plus project augmentation, record each carrier's digest/admission result,
          and validate effective nested guidance for every changed path.
        - Extend guidance-digest and package/controller tests for missing, stale, identical, conflicting, inherited,
          and nested-effective sets.

    - `[ ]` **7.1.d Reconcile Actions, commands, and operator docs**
        - Define a closed executable-operation map across `run-*.ts` launchers, the private controller entrypoint
          registry, root npm scripts, `.github/workflows/review-gate*.yml`, and operator commands; reject missing,
          duplicate, or publicly exported operations.
        - Update policy examples, `.github/review-gate*.md`, and `coordinate-pr-review.md` so forward operations use
          v2 while the exact v1 parser/ledger, historical evidence, and qualification fixtures remain explicitly
          diagnostic or historical rather than rewritten as v2 qualification.
        - Keep setup, qualification, promotion, and outage authority boundaries intact; never imply that the dormant
          v2 controller is live merge authority or that this WU provides the downstream readiness projection.

### `[ ]` **7.2 Prove routing-to-gate behavior across adapters and workflows**

- _Goal:_ Cross-module tests demonstrate that the architecture preserves its contracts from Git facts through
  routing, review execution, evidence, response, lifecycle re-entry, and merge authorization.
- _Context:_ Operationalizes Success Criteria 4–12 without duplicating the unit behavior lists in earlier tasks.

    - `[ ]` **7.2.a Add cross-layer integration scenarios**
        - Cover local-only, hosted-only, both, inactive review methods, unknown facts, atomic routine code, ordinary
          code, sensitive docs/code, foreign ownership, constitutional authority, and rubric overlay.
        - Make the local-only case run the full route → request → fresh launch → normalize → exact-head attest →
          reduce → response/reroute sequence with no hosted carrier.
        - Assert exact obligations, frontline action, evidence eligibility, retrigger, and the workflow rule that
          review settlement enters candidate assembly but grants no merge authority.

    - `[ ]` **7.2.b Exercise finding and re-entry scenarios**
        - Cover approved fix, defer, reject, mixed severity, provider-native conversation, local finding report,
          suspended review, scheduled/human resume, timeout, stale head, and cap exhaustion.

    - `[ ]` **7.2.c Exercise lifecycle and migration scenarios**
        - Cover WU and Errand publication, reviewed/CI-green pre-composition refusal, `manual` and
          `with-integration` cadence products, complete candidate-tail review, open swept-candidate re-entry,
          composition correction/invalidation, disjoint/interacting base merge, final-full review, schema-v1 residue,
          forward evidence, exact-head merge, and post-merge cleanup.
        - Reject release-note composition containing WU identifiers, branch/task/phase language, internal
          review/provider machinery, or other internal development jargon without rejecting shipped public review
          concepts.

    - `[ ]` **7.2.d Run the affected integration checkpoint**
        - Run focused unit/integration/controller/workflow suites plus source/test typecheck and build; fix all
          failures before the verification phase.

### `[ ]` **7.3 Audit package/project parity and legacy-reference removal**

- _Goal:_ Every shipped review surface is package-authoritative and mirrored accurately, while project-only policy
  remains local and no live file still teaches the retired architecture.
- **Additional Context:** `strategy-package-project-sync.md` §§ Edit Flow Rules, Template Counterparts, and
  Safeguards.

    - `[ ]` **7.3.a Audit framework and configurable mirrors**
        - Verify each methodology edit was made package-first and mirrored in `.arc/` during its owning task;
          reconcile framework equality and configurable project overrides without blind copying.
        - Register added/renamed/retired methods in `packages/arc-framework/init-recipe.json`, method indexes, the
          self-hosting manifest/classification records, and init/update/package tests; keep configurable method files
          as ordinary files rather than inventing `.template.md` variants.
        - Refresh `strategy-package-project-sync.md`'s stale hand-maintained template/file inventory from the recipe
          and source tree, then verify generated manifest expectations.

    - `[ ]` **7.3.b Sweep retired vocabulary and policy references**
        - Search live package/project corpora, CLI/config code, workflows, tests, root docs, and `.github` surfaces for
          `review.pre_merge`, `diff-review`, semantic frontline actions in `pre-pr-open`, old disposition enums,
          four-status changed paths, and gate-v1-as-current claims.
        - Classify every hit through a closed `remove | rename | retain-v1-compat | retain-historical |
          retain-unrelated-schema` disposition before editing; historical corpora are searched for classification,
          not rewritten as live guidance.
        - Preserve `independent-analysis/v1`, unrelated schema-v1 contracts, the exact diagnostic gate-v1 parser,
          and intentional compatibility fixtures with explicit legacy labels.

    - `[ ]` **7.3.c Validate corpus and package boundaries**
        - Run framework-sync, package-neutrality, method/extension declarations, link/reference validation, ARC
          contracts, Markdown lint, and package-list/build schema assertions.
        - Confirm project-only CodeRabbit/controller bindings do not leak into packaged methodology defaults.

## **Phase 8:** Verification

_Purpose:_ Verify the settled implementation and documentation suite against the design, quality gates, and
integration contract.

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The closed routing record resolves every fact combination to one valid obligation set.

- `[ ]` Routine atomic code softens review spend while sensitive or unknown changes retain the maximal floor.

- `[ ]` Malformed, empty, unsupported, or endpoint-incomplete change facts fail closed.

- `[ ]` Local independent analysis can satisfy the exact-head requirement without a hosted provider.

- `[ ]` Every carrier proves the rubric and guidance it received without receiving author conclusions.

- `[ ]` Every finding is source-verified and one canonical exact-head disposition set authorizes any fix mutation.

- `[ ]` Pull-request count never mechanically multiplies or weakens review obligations.

- `[ ]` The gate migrates forward with exact domain-separated ID preimages and golden vectors, without silently
  upgrading legacy receipts or evidence.

- `[ ]` Typed applicability distinguishes carry-forward, incremental interaction review, and final full review.

- `[ ]` Every review surface has one layer owner and states the agent-ergonomics / host-guarantee boundary honestly.

- `[ ]` The complete provisional integration tail is reviewed at the exact-head merge gate, and public release notes
  contain no WU identifiers or internal development jargon.

- `[ ]` Review settlement alone cannot authorize a pre-composition WU merge; every agent-side WU merge path is
  dominated by cadence-required products, complete-tail surfacing, and the final exact-head interlock.

- `[ ]` Package and project copies remain synchronized for every framework surface.

- `[ ]` All quality gates pass (tests, linting, type checking, build)

- `[ ]` Ready for integration
