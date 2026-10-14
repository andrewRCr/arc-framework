# Draft: Pull-Request Surface Policy

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Cohort:** `doc-conventions`
- **Purpose:** Define what ARC writes on pull-request titles and bodies — the title grammar, one body shape for every
  kind of change, and what process or provenance metadata appears — from the reviewer's needs and the repository's
  conventions rather than from ARC's internal workflow.

---

## Readiness

- **State:** formalization-ready (assessed 2026-10-14). Two adversarial passes ran to the `Heavy` cap: pass 1 found nine
  majors, and pass 2 found four majors, three of them in pass 1's fixes, and four minors. An independent fix check then
  ran two rounds over pass 2's fixes, finding one major and six minors. Every approved fix is folded in.
- **Planning read (2026-10-14):** `Class` ratchets from the stub's `Light` estimate to `Heavy` on the derivation
  trigger: the title rule per merge strategy, the body shape, provenance metadata, the design pointer, and where
  settings live each carry alternatives and trade-offs that must be settled before implementation. Not `Novel`:
  the design composes `commit-format`, the storage contract's D18 and D19, and external convention; the one piece
  without precedent (disclosing pre-publication agent review) is resolved by not minting it (B5). Depth `high`.
- **Boundary fit:** stays one WU. Evidence basis: one concern — what ARC writes on a pull request — whose title,
  body, and provenance rules share one reader and one composition point. No host-template scaffold is built (H1).
  Planning and bookkeeping pull requests are transitional and stay out (§ Scope boundary).
- **Inbound integrated:** the three routed-in entries are folded into the body below: the host-side template (H1,
  rejected in its generated form), Conventional Commits in titles (T1–T2), and host disclosure of unattended work (F2,
  B5).

## Problem / Motivation

ARC's pull-request surface grew by accretion. The canonical template requires Conventional Commits titles flatly. The
usual justification for that rule, squash promotion, does not hold under ARC's default merge-commit strategy, and the
same file's merge-strategy note already makes the effect conditional. Stacked delivery titles compose the work-unit slug
as the scope and a `[n/N]` position that `arc delivery publish` never refreshes. The `Design:` field names an ARC
artifact by filename, which the storage contract's surface boundary (D19) forbids by default and which a host reviewer
cannot resolve once design leaves the tracked tree. The `Local review` marker renders as a lane label (`delegated-agent`
on recent pull requests) that tells a reviewer nothing. Errand and work-unit bodies are specified separately — the
Errand body inline in `run-errand.md`, the work-unit body in `template-pull-request.md` — and their settled-decision
presentation differs. Nothing bounds body length, and agent-authored bodies drift toward exhaustive.

## Frame

- **F1. The surface boundary is the default now.** D19 (`spec-storage-contract.md`) applies to every profile: titles
  and bodies carry no ARC vocabulary, no reference to an ARC artifact, and no ARC process concern, and a project opts
  in to more on its own surfaces. This WU lands before `ghost-mode`, so its defaults meet D19 from the start rather
  than waiting for ghost-mode to make the boundary true. Subject matter is not a leak, in D19's words: "a change to
  ARC's own Errand code says 'Errand' in this repository". ARC's concepts as the subject of a change are this
  repository's domain vocabulary; naming this repository's own work units and Errands as the process that produced a
  change is still process. That self-hosting distinction lives in `DEV-RULES.PROJECT`, never in a shipped surface.
- **F2. Nothing added by ARC on its own.** By default ARC writes the description of the change and nothing about how it
  was made — no provenance, process, or review metadata. Where the target repository prescribes pull-request content —
  its own PR template, contributing guide, AI-use policy, or security policy — that prescription governs and ARC's
  defaults fill only what it leaves open. A fix for a vulnerability not yet disclosed follows the project's security
  policy and does not describe how the flaw is exploited. This is the general form of the disclosure question
  `draft-autonomy-levels.md` assigned here: its "nothing on host surfaces" holds as ARC's default, not as a rule that
  overrides a project which requires disclosure. Ghost mode is the sharpest case — it removes ARC's trace, not the
  person's obligation to an upstream's AI policy (Kubernetes, Ghostty, Fedora, and LLVM now require disclosure, and
  Kubernetes forbids AI trailers, so a required disclosure is body text in the upstream's form).
- **F3. Settings live in a method, mirroring `commit-format`.** A `pull-request-format` method carries the default title
  rule, body shape, and composition guidance; a project changes them through the method's override, which survives `arc
  update` — `template-pull-request.md` is a framework file that update overwrites (`classifyFile` in
  `lib/classification.ts` lists methods in `CONFIGURABLE_FILES` and leaves templates in the framework default; the new
  method joins that list). Configuration keys appear only where code reads them, and the existing ones suffice:
  `merge.strategy`, `commit.format`, and (from the cutover) `storage.track_design_docs`. This is the forward seam past
  the configuration overhaul: method overrides do not depend on where configuration is stored, and no key is added for
  `config-storage-architecture` to relocate. Opt-in content F2 withholds by default (a provenance or review line) is an
  override, not a toggle. The method absorbs `template-pull-request.md` — the shape, the gates, the decision guide, the
  delivery-member variant — and the template file retires, leaving the method as the one home.

## Titles

- **T1. Conventional Commits by default, justified by what holds.** The default title is a valid subject under the
  project's `commit.format`. Commits and titles share one grammar, so a title carries no rule its commits do not: scope,
  length, and the breaking-change marker follow commit policy (today `validateConventionalSubject` in
  `commit-check/policy.ts` requires a scope and rejects `!`; § Coordination's Errand aligns scope with the
  specification), and the scope names the dominant locus. Under `merge.strategy: squash` the rule is pinned, since the
  title becomes the commit subject. Under `merge` and `rebase` it is the method default, which a project may override to
  a plain imperative sentence. The justification is scannable and filterable pull-request lists, title-reading tools
  (release-drafter, title-prefix labelers, release notes via labels), squash safety if a project switches, and the agent
  composing one grammar for commits and titles. It is not the Conventional Commits specification, which is
  commit-scoped, and under merge commits no commit-reading tool (release-please, semantic-release) consumes the title.
  In this repository the title enters history only as the merge commit's body (`merge_commit_message: PR_TITLE`).
  Practice here has converged: the last 25 merged pull requests all use the form.
- **T2. Stacked members take ordinary titles.** Each member's title is its own `type(scope): summary`, with no work-unit
  slug as scope and no `[n/N]` position. The slug-as-scope breaks `commit-format`'s locus rule, and a slug that
  `SLUG_PATTERN` admits with a leading digit fails `SCOPE_PATTERN`. The position goes stale because publish adopts an
  existing request unchanged. No stacked-diff tool writes position into a title. Stack position belongs in the host's
  stack display where one exists — GitHub's stacked pull requests became generally available on github.com on
  2026-10-06, with Enterprise Server to follow — and otherwise in a body line regenerated on publish; the delivery
  stream settles which per host. Implementation sits in delivery code (`composeDeliveryRequestTitle` and
  `deriveDeliveryTitleIdentity` in `lib/delivery/materialization.ts`), held until the cutover, so the grammar settles
  here and the change routes to the delivery stream (§ Coordination).
- **T3. Titles are guided, not gated.** No code checks title format: code cannot see a method override. Once
  delivery adopts T2, its type derivation and the `terminal-title-not-conventional` refusal go. A merge-time title
  check under squash is a separate mechanism (§ Scope boundary).

## Body

- **B1. One template, content-gated.** Every Errand and work-unit pull request, and a stack's terminal request, uses
  one shape, and the kinds differ only by which gated sections have content. A non-terminal stack member's body is
  composed by code from a fixed presentation schema (`DeliveryMemberReviewerPresentation`: summary, changes, design
  reference) that no method override reaches; it takes this shape when delivery adopts it (§ Coordination).
  `run-errand.md` § Ship and `integrate-work-unit.md` reference the method rather than restating a body. Sections in
  order, each with its gate:
    1. **`Summary`** — always. One to three sentences: what changed and why, readable alone. Issue links such as
       `Fixes #123` sit inline. A change that breaks a public contract says so in the first sentence and names the
       migration.
    2. **`Changes`** — when the change spans more surfaces than the Summary can name. Three to seven outcome bullets
       (`- _topic_ — what landed`), never a file inventory. Usual on work units, rare on Errands. A visible change
       may carry a before-and-after capture here.
    3. **`Notes for Reviewers`** — when a decision qualifies (B2), the design pointer applies (B3), or there is a
       specific feedback ask. The name keeps the established idiom, in the template's title case.
    4. **`Test Plan`** — when verification went beyond the gates (B4).
    5. **`Out of Scope`** — when a reader would expect something the change leaves out; a tracked deferral carries its
       issue link. An Errand may carry one for a deferral. An exclusion that must stay left out is the record test's
       second question, and makes the change a work unit.

  The order follows the reviewer's questions: what and why, where to look, what to weigh, how it was checked, and
  what not to expect. The three middle sections stay separate because each answers a different question —
  navigation, judgment, verification — and the gates keep empty ones out. `Follow-Up Work` folds into `Out of Scope`,
  since its pointers to drafts and inbox entries are artifact references under D19.
- **B2. Key decisions appear whenever one qualifies.** `Notes for Reviewers` carries the decisions a reviewer needs to
  judge the diff, whether or not a design document is reachable, so the format is the same for every kind of change and
  the gap closes where no design is exported. One bullet per decision: an italic descriptor naming the question, then
  the choice, the alternative it was chosen over, and why. It is a selection, not the design's full record. The section
  may also say where to look and what feedback is wanted. The top-level `## Decisions` heading retires:
  reviewer-directed notes are the idiomatic home (Kubernetes' "Special notes for your reviewer"), and stating the
  feedback wanted was the strongest acceptance predictor in the research. When a review fix changes a listed decision,
  the body is updated. The selection composes existing idiom and mints no new criterion:
    - **Form.** A compressed Y-statement (Zimmermann: "in the context of …, facing …, we decided for … and neglected
      …, to achieve …, accepting …"). The italic descriptor supplies the context. The bullet gives the choice, the
      alternative, and why, with an optional accepted cost — the kernel's "describe the trade-offs".
    - **Inclusion — both must hold.** A credible alternative existed (the ADR strategy's "multiple alternatives were
      considered"; an Errand's "fork"). The rationale is not visible in the diff (Google's CL-description guidance).
    - **Which few.** Prefer a decision that changes structure or an external contract (the ADR strategy's first
      criterion), one that is costly to reverse (the record test's third question), or one a reviewer would otherwise
      ask "why not X?" about.
    - **Excluded.**
        - An implementation-local choice (`classify-work-unit`'s design-versus-implementation floor).
        - A choice an existing convention forced.
        - An ARC process decision (D19).
        - A deliberate exclusion, which belongs in `Out of Scope` (the record test's second question).
    - **Errands list every qualifying decision.** B6's budget does not apply: an Errand has no design document, so its
      PR body and commit carry its decisions (ADR-037's amendment). The inclusion and exclusion tests still apply, so an
      Errand records each qualifying decision rather than every settled one. The narrowing reaches ADR-037's forward
      amendment (R3) and `run-errand.md`'s commit step, whose "each fork the Errand settled" becomes each qualifying
      decision. The record test's fourth question still governs each decision's depth: one that needs more than its line
      makes the change a work unit.
    - **Work units select.** When more decisions qualify than B6's budget holds, "which few" selects. The rest stay in
      the design, reachable through B3's link when the design is in the diff.
    - **One form for commits.** `run-errand.md` also writes decision bullets into commit bodies. The guide lives in the
      `pull-request-format` method, and `commit-format` and `run-errand.md`'s commit step (§ Execute) cite it. Commit
      bodies take the same content as plain prose with no Markdown descriptor, since Git renders none — as
      `run-errand.md` writes them today.
- **B3. A pinned design link replaces the `Design:` field.** A backticked filename is an artifact reference under D19,
  and a `draft-*` never reaches a reviewer after the cutover. When the design document is in the diff — before the
  cutover the tracked spec the work unit's branch carries, after it the export (D18, `.arc/specs/<slug>/`) —
  `Notes for Reviewers` closes with one line linking the full design by a commit-pinned permalink. The export earns its
  keep only if reviewers find it, and the files list buries it. A branch link dies when the design moves or the
  candidate-tail deletes the review copy; a pinned link survives while its commit stays reachable:
    - after a merge commit, in the base's history;
    - after a squash or rebase merge, through the pull request's head ref (`refs/pull/<n>/head`), since GitHub's rebase
      merge writes new commits. GitHub does not document that ref's retention; it is observed here on merged pull
      requests whose branches are gone (`refs/pull/300/head`).

  The link is re-pinned to stay current and reachable: a design change leaves the pinned version stale, and a history
  rewrite — an amended fix or a catch-up rebase under the post-cutover `history.policy` default (D20) — moves the pinned
  commit out of reach. R5's keep-current step re-pins when the design changed or the pinned commit is no longer an
  ancestor of the head, which covers its own rewrite and any earlier one; `history-policy` re-pins after the rewrites it
  performs. A hand rewrite after the last keep-current step can leave the pin stale through merge; that residual is
  accepted. There is no line when the export is `none`, under ghost, or when no design document is in the diff; B2
  carries what the reviewer needs and an issue link carries origin. The link text stays neutral ("full design"). Reading
  the link as content rather than an ARC artifact reference is this WU's own reading of D19, for the one artifact that
  exists to be reviewed; R1 records it in `DEV-RULES.ARC` and § Coordination routes it to `ghost-mode`'s boundary ADR.
- **B4. Test Plan.** Present only when verification went beyond what the visible checks show: a manual scenario, a run
  against a real environment or host, a measurement, or steps a reviewer should exercise. It never restates CI or the
  local quality gates — passing them is a precondition of publishing, so listing them carries no information. Plain
  bullets, not checkboxes: each states what was run and what was observed, specific enough to reproduce. Checkboxes
  read as task lists on GitHub ("0 of 2 tasks" in the pull-request list) and a self-ticked box is an attestation
  without a witness; the Test Plan's own lineage (Phabricator) is prose. Only what actually ran is listed.
- **B5. No review line by default.** The `Local review` marker retires from the default body. This reverses
  `integration-boundary-accuracy`'s G5, which kept the marker because review run locally before publication leaves no
  platform trace, so without the marker it is invisible to everyone but its operator. That premise stands; the
  conclusion does not, for reasons that postdate G5:
    - **D19 now governs the surface.** By default a host surface carries no ARC process concern. A line attesting an
      ARC review lane is exactly that. G6 already conceded the line was "minted, not adopted"; as of 2026-10 no
      convention covers disclosing pre-publication AI review either.
    - **G7's escape hatch is retiring.** Richer reporting was to move to a `pre-merge` extension, and
      `retire-extension-points` removes the extension mechanism.
    - **The reader cannot use it.** A reviewer who does not use ARC gets an unverifiable claim. A "thoroughly
      reviewed" line also invites lighter human review, the opposite of its intent (inference).
    - **G5's team case has a better home.** Teammates who use ARC read stored review facts after the cutover.
    - **The diff is the evidence.** Fix commits are not: their disposition bodies leave commits under D19 and
      `review-protocol-alignment`, and a clean review produces none.

  **Accepted interim cost:** between this landing and the cutover, a teammate cannot see that a local review ran.
  ARC has no team adopters yet, and a project that wants the line adds it through the method's override. ARC ships no
  shape for one; a shipped format would mint the convention this item declines to mint.
- **B6. Length.** A body fits one screen: `Summary` within about three lines, `Changes` three to seven outcome bullets,
  `Notes for Reviewers` about three to five one-line decisions on a work unit (an Errand lists every qualifying one,
  B2). A body that needs more is a signal that design detail belongs in the design or the change should split. Never
  restate the diff, the file list, or CI. Describe, don't sell: no adjectives that grade the work ("robust",
  "comprehensive"), and no claim a reviewer cannot check. The budget is a heuristic; the length evidence is mixed and
  secondhand.

## Host template

- **H1. No scaffold; a project's own template governs.** The routed-in concern asked for a host template generated from
  the canonical one. Generated and kept in sync, it would be a second home for the body shape. Scaffolded once and then
  project-owned, F2 would make it govern: it would outrank the project's own method override, keep an old shape when
  ARC's default changes, and render B1's content gates as static headings. Instead the method's default shape is written
  copy-ready, and ARC writes no PR template into `.github/`. A project that wants a host template copies it in; from
  then on that template is the project's statement and governs under F2. Inside it, the agent fills the template's
  sections, and the method's content rules still govern what goes in: the gates, the length budget, decision phrasing,
  and the surface boundary.

## Reconciliation

The surfaces this WU changes beyond the new method and the two workflows B1 names.

- **R1. `DEV-RULES.ARC`.**
    - **§ Commit and PR surface language.** It still admits backticked artifact references and routes traceability to
      the footer. This WU lands first and its defaults must meet D19, so it rewrites the pull-request half now.
      `ghost-mode` rewrites the commit half and records the boundary's ADR.
    - **§ `.arc/` artifact references.** It says published content cannot reference a movable artifact "at all" and
      forbids links and paths. It gains B3's one exception: the commit-pinned link to the design document in the diff.
- **R2. Text that conflicts with D19 or this design.**
    - `strategy-configurability-architecture.md` and the `merge.strategy` comment in `arc-config.yml` both say that
      under squash the PR description carries the traceability commits would.
    - `deliver-stack.md`:
        - It says the shared scope comes from the authored title, while the code substitutes the slug (moot under T2
          once delivery adopts it).
        - Its member guidance asks for a design reference as "{accessible filename or URL}", which renders a
          backticked `**Design:**` line. It changes to omitting the reference until delivery adopts B3's link.
- **R3. Readers of the retiring template.**
    - `init-recipe.json`: the template leaves and the method joins. The method also joins `CONFIGURABLE_FILES` (F3).
    - Tests that pin the template:
        - `review-driver-lifecycle.test.ts`, which asserts the `Local review` text, the member variant, and the
          `[{position}/{total}]` form;
        - `prepublication-workflow.test.ts`, which asserts recipe inclusion and link resolution;
        - `review-gate-workflows.test.ts`, which asserts the `Local review` wording in `run-errand.md` § Ship and
          `integrate-work-unit.md` step 1.
    - The references to it in `reference/templates/arc/README.md` and `deliver-stack.md` (its load step and link
      definition).
    - `drain-inbox.md`'s lean grooming body "mirroring" `run-errand.md` § Ship.
    - ADR-037's 2026-10-10 amendment, which names the `## Decisions` heading and has an Errand write each settled
      decision. Its forward amendment moves the heading and narrows the record to each qualifying decision (B2).
- **R4. `DEV-RULES.PROJECT` gains F1's self-hosting distinction.** Subject matter is not a leak here. It has no such
  section today.
- **R5. Keep-current steps.** B2 and B3 require the body to follow review fixes. The review-fix loops in
  `integrate-work-unit.md` (step 2), `run-errand.md` (§ Ship step 4), and `deliver-stack.md`'s terminal request gain the
  step. It updates a listed decision the fix changed, and re-pins B3's link when the design changed or the pinned commit
  is no longer an ancestor of the head, so it holds before and after the cutover. `history-policy` re-pins after the
  rewrites it performs (§ Coordination).
- **R6. Release notes and the body are siblings.** D19 names the Release Notes Entry the body's input, but
  `integrate-work-unit.md` opens the pull request at step 1 and composes that entry at step 5. Both are composed from
  the same facts and neither derives from the other. D19 is shipped text, so the correction routes to `ghost-mode`,
  whose draft repeats the claim.

## Success signal

Under default settings, every Errand and work-unit pull request opened after landing has the following. Delivery
members join once delivery adopts T2 and B1, and planning and bookkeeping pull requests stay out (§ Scope boundary).

- a title that is a valid subject under `commit.format`;
- a body holding only gated sections, in B1's order;
- no ARC process vocabulary, artifact reference, or review line — subject matter (F1) and B3's pinned design link
  excepted;
- one screen of length;
- the same decision form whatever the kind of change.

Checkable against the next few pull requests after landing. Checkable at landing:

- `pull-request-format` installs as a configurable method, and a populated override survives `arc update`.
- `template-pull-request.md` is gone from the install recipe, and no shipped file references it.
- `commit-format` and `run-errand.md`'s commit step cite B2's guide.

## Evidence

**Local (2026-10-14).**

- **One composer.** `arc delivery publish` is the only CLI composer of a title or body. Errand and work-unit PRs are
  agent-composed from prose (`gh pr create` with no `--title` or `--body` in either workflow). No CI or hook checks a
  pull request's title or body.
- **No host template.** The repository has no `.github` PR template.
- **Merge settings.** `allow_squash_merge: false`, `merge_commit_title: MERGE_MESSAGE`,
  `merge_commit_message: PR_TITLE`. The commit-msg hook's merge exemption covers local merges only; the host's merge
  commit runs no local hook.
- **Review-record history.** A composed `## Review` record — local and hosted pass counts, and
  `Triage: @handle — addressed · deferred · unresolved` — shipped 2026-08-15 (`745e8e580`). It was cut to a
  carrier-only marker the next day (`42df72ccc`) after a precedent review found no convention for recording review
  in a pull-request body. The rationale is `integration-boundary-accuracy`'s G3–G7. G7's escape hatch, richer
  reporting through a `pre-merge` extension, is itself retiring with `retire-extension-points`.
- **`Decisions` history.** It reached the Errand body as `Decided: X over Y — because Z` (ADR-037, 2026-10-09) and
  became a prose `## Decisions` section the next day (`c986146d9`).

**External (2026-10-14).** Five load-bearing claims were checked directly:

- commitlint's `config-conventional` sets `subject-case` to never sentence, start, pascal, or upper case.
- Kubernetes requires disclosure in the PR description and prohibits `assisted-by` and `co-developed` trailers, per the
  April 2026 dev-list announcement and the 2026-06-26 blog post.
- The Y-statement form is Zimmermann's, evolved from Fairbanks' architecture haiku. Cite the wording from
  `ozimmer.ch`; the check confirmed it only through secondary sources.
- `refs/pull/<n>/head` persists after branch deletion, as observed (B3).
- GitHub's stacked pull requests are generally available on all github.com plans, per the 2026-10-06 changelog;
  Enterprise Server support is announced for a later release, and stack auto-merge is still rolling out (T2).

The rest come from one unverified research pass (confidence medium):

- **Titles.**
    - No prevalence study of PR-title formats exists.
    - PR-title linters (`amannn/action-semantic-pull-request`) assume squash.
    - release-drafter and title-prefix labelers read titles under any merge strategy; release-please and
      semantic-release read commits.
    - Copilot's coding agent titles in prose.
    - Google's guidance asks for a short imperative first line and is compatible with a type prefix.
    - The ICSE 2025 Conventional Commits study reports type choice as the top pain, which sharpens the ambiguity of
      one type over a multi-commit PR.
- **Disclosure.**
    - `Assisted-by:` leads among trailers. The Linux kernel uses `Assisted-by: AGENT:MODEL [TOOLS]`, Fedora uses
      `Assisted-by:`, and OpenStack uses `Assisted-By`/`Generated-By`. `Co-authored-by` for a model is disfavored.
    - Kubernetes requires disclosure in the PR description and forbids AI trailers.
    - Ghostty asks for the tool and the extent of AI use.
    - LLVM (2026-01) requires a human in the loop and labelling substantial generated content.
    - Every policy puts accountability on the submitter. None asks for a per-pull-request triage statement, and none
      covers AI review disclosure.
- **Body.**
    - Pirouzkhah et al. 2026 (about 80K pull requests) find that stating the desired feedback type best predicts
      acceptance.
    - Xiao et al. (FSE 2024) find generated descriptions associate with faster review, with a caution against
      including every generated section.
    - The evidence on length is conflicting.
    - Kubernetes headings: "What this PR does / why we need it", "Special notes for your reviewer".
    - Phabricator: "Summary" and "Test Plan".
    - Maintainers object to verbose AI-written descriptions (Biopython, Godot, Autoware's policy).

## Coordination

Route at draft close through `USER-INBOX` captures, never by editing a sibling's tracked artifacts.

- **`ghost-mode`.**
    - Its footprint inventory's "pull-request titles and bodies" row has this WU as its answer.
    - R1 splits the `DEV-RULES.ARC` rewrite between the two WUs.
    - B3's reading of D19 — a commit-pinned link to the design document in the diff is content — is for its boundary
      ADR to carry or contest.
    - R6's release-notes correction goes there.
    - Its draft still says delivery names the design by its `draft-*` filename; D19 corrected that.
- **Delivery stream** (the next delivery WU after the cutover):
    - T2's member title grammar and the stack position's new home;
    - T3's removal of the type derivation and the `terminal-title-not-conventional` refusal;
    - a member presentation schema that carries B1's gated sections and B2's decisions;
    - B3's pinned link in place of the filename-style `designReference`.
- **`autonomy-levels`.** F2 answers its disclosure handoff: ARC adds nothing by default, and a target project's
  requirement governs.
- **`seam-delivery-review`.** It builds `storage.track_design_docs`; B3 consumes the export as specified.
- **`history-policy`.** The rewrites it performs re-pin an open pull request's design link (B3): its lease-guarded
  catch-up under the default `rewrite-with-lease`, beside the task-capture and branch-link remaps its inbound entries
  ask for. A review fix that rewrites the branch re-pins through R5's step instead.
- **Errand captures.**
    - **Align the commit subject grammar with Conventional Commits.** Make the scope optional: use one when a single
      area dominates, and omit it for a cross-cutting change, as the specification ("A scope MAY be provided") and
      Angular allow. `validateConventionalSubject` rejects a missing scope with no recorded rationale. Start the
      description lowercase, as Angular and commitlint's `config-conventional` do; recent subjects here mix
      `fix(errand): Discover…` and `fix(sync): name…`. The Errand decides whether lowercase is enforced or guided.
      Titles inherit both through T1.
    - **Fix the squash examples.** `park-work-unit.md` and `resume-work-unit.md` show `gh pr merge --squash` against
      the `merge` default. That is a merge-strategy defect, not a pull-request-surface one.

## Scope boundary (Won't Do)

- **Planning and bookkeeping pull-request bodies.** Pull requests from grooming sets, housekeep sweeps, and the
  lifecycle verbs — stub, park, resume, deactivate, decompose, and archive — are transitional. They carry only planning
  or lifecycle records: planning leaves pull requests at the cutover, and a lifecycle move becomes a store write, since
  placement is a record field (D5) and an archive writes its quarter's archive ref (D10). An Errand pull request follows
  B1 whatever its diff, including a planning-only one. Under the default `archive.cadence: with-integration` the archive
  is a commit in the work unit's own pull request; a separate archive pull request exists only under `manual`, and no
  shipped workflow composes its body.
- **Commit-message surfaces.** Footers, trailers, and the commit hook belong to `ghost-mode`. The review disposition
  body belongs to `review-protocol-alignment`. `commit-format` and `run-errand.md`'s commit step take only B2's guide
  here. `commit-format`'s subject grammar aligns with the specification through the Errand in § Coordination, and titles
  inherit it through T1.
- **Delivery code changes while delivery is held.**
- **A title check at merge time.** Under squash the title becomes an unvalidated commit subject; a check at the merge
  verb would close that, but no project here squashes and the default is merge commits (T3).

## Next

The capture commit, then `create-spec`. § Coordination's captures route at draft close.

---
