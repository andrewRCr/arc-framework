# Spec (`detailed` · `PRD`): pull-request-surface-policy

- **Origin:** `[internal]`

- **Purpose:** Pull-request titles and bodies describe the change for its reviewer and say nothing about how ARC made
  it. One configurable `pull-request-format` method holds the title rule, one content-gated body shape for every
  Errand and work-unit pull request, and the default that ARC adds no process, provenance, or review metadata.

---

## Introduction

ARC's pull-request surface grew by accretion, and what it writes today serves ARC's workflow more than the reviewer:

- **Titles.** `template-pull-request.md` requires Conventional Commits titles without saying why the rule holds. The
  usual reason, that a squash merge turns the title into a commit subject, does not apply under ARC's default
  `merge.strategy: merge`, and the template's own merge-strategy note already treats the effect as conditional. Stacked
  delivery titles carry the work-unit slug as their scope and an `[n/N]` position that `arc delivery publish` composes
  once and never refreshes, since publication adopts an existing request unchanged.
- **Process on the surface.** The body opens with a `**Design:**` field naming an ARC artifact by filename, which a
  reviewer outside the author's checkout cannot resolve, and a `**Local review:**` field naming the review carrier that
  ran (`delegated-agent` on recent pull requests), which tells a reviewer nothing they can check.
- **Two shapes.** The Errand body is specified inline in `run-errand.md` and the work-unit body in
  `template-pull-request.md`, and they present settled decisions differently: an Errand under a `## Decisions`
  heading, a work unit not at all.
- **No bound.** Nothing limits body length, and agent-written bodies drift toward exhaustive.

**Why now.** The project's storage design sets a surface boundary for every install by default: anything ARC writes, or
has an agent write, to a surface people read without ARC reads as the change it describes, with no ARC vocabulary, no
reference to an ARC artifact, and no ARC process concern, unless the project opts in to more. Pull-request titles and
bodies are such surfaces, and nothing shipped makes them meet it. This change makes the pull-request defaults meet the
boundary from the start rather than waiting for the rest of the boundary work.

## Goals

1. A reviewer reads a pull request as a description of the change: what changed and why, where to look, what to weigh,
   how it was checked, and what not to expect.
2. Every Errand and work-unit pull request uses one body shape; kinds of change differ only in which gated sections
   have content.
3. By default, titles and bodies carry no ARC process vocabulary, artifact reference, or process, provenance, or review
   metadata, and a target repository's own prescriptions govern where they exist.
4. Pull-request format lives in one configurable method a project overrides as it overrides `commit-format`, with no
   new configuration key.
5. The decisions that shape a change reach the reviewer in one form whatever the kind of change, and the same content
   reaches commit bodies.

## User Stories or Use Cases

- As a reviewer who does not use ARC, I want the title and body to describe the change in the project's terms, so I can
  review it without knowing the tool that produced it.
- As a reviewer, I want the few decisions that shape the diff, each with its alternative and reason, so I can judge the
  change instead of reconstructing why it looks the way it does.
- As a maintainer whose project has a pull-request template, contributing guide, AI-use policy, or security policy, I
  want an agent using ARC to follow them, so contributions arrive in the form my project asks for.
- As a project using ARC, I want to change the title rule or body shape once, in a method override that `arc update`
  keeps.
- As the agent opening a pull request, I want one grammar for commits and titles and one body shape with clear gates,
  so composing is filling sections, not deciding what a body is.

## Requirements

All requirements are P0. Identifiers are stable references for the task list.

### Method

1. **M1 — the `pull-request-format` method.** A new method at `system/methods/pull-request-format.md`, in the package
   source and its project copy, in the standard method shape:
    - frontmatter with `name`, `description`, `arc.methods: [commit-format]` (T1 fires the commit subject grammar on
      every title), `related: [commit-format]`, and `override-active: false`;
    - a header whose `When:` line names the operation — an agent composes or edits a pull-request title or body —
      rather than a workflow, and whose `Contract:` line carries the rules every override must keep (T2, T5);
    - a `## pull-request-format.override` section reading `[No override configured]`;
    - a `## pull-request-format.default` section that opens with its scope and then carries the surface boundary
      (S1–S4), the title rule (T1–T5), the body shape and its rules (B1–B7), host-template guidance (H1), and
      delivery-member presentation (D1). The scope is every pull request except those that carry only planning or
      lifecycle records — from grooming sets, housekeep sweeps, and the lifecycle verbs (Non-Goals) — which follow
      their own workflow's guidance. Every rule in the method applies within that scope.
2. **M2 — configurable.** `system/methods/pull-request-format.md` joins `CONFIGURABLE_FILES` in `lib/classification.ts`,
   so `classifyFile` returns `Configurable` for it and `arc update` preserves a populated override.
3. **M3 — installed.** `init-recipe.json` installs the method.
4. **M4 — the template retires.** `reference/templates/arc/work-unit/template-pull-request.md` is deleted from the
   package source and the project copy and leaves `init-recipe.json`, and no shipped file references it. The method is
   the one home of what survives from the template, restated under the rules here:
    - **Carried over:** the body shape, section gates and guidance, and delivery-member presentation, as B1–B7 and D1
      restate them; and the anti-patterns of restating CI in the Test Plan (B4), post-merge workflow continuity (S1),
      references a reviewer cannot resolve (S1), process narration and success-criteria status (S1, B5), and
      restating commit traceability footers.
    - **Retired:** bold field-label metadata above the body; the reserved `[RFC]` and `[REL v0.x.y]` title prefixes,
      since T1 governs titles; the statement that tracked artifacts are fine to reference; and the `Design` and
      `Local review` field guidance.

   No alias or redirect is kept.
5. **M5 — no configuration key.** The method reads only existing settings: `merge.strategy` and `commit.format`.
   Content the default withholds — a provenance line, a review line, a disclosure the target project does not
   require — is added through the method's override, never through a toggle.
6. **M6 — consumers cite the method.** `run-errand.md` § Ship — full protection (the creation arm of step 3),
   `integrate-work-unit.md` step 1, and `deliver-stack.md` § Validate and publish declare `pull-request-format` in their
   `arc.methods` frontmatter and load it where they compose a title or body. `run-errand.md` also loads it at
   § Execute's commit step, where commit bodies record decisions under either protection mode (R5). None restates a
   body shape: `run-errand.md`'s inline lean Errand body and `integrate-work-unit.md`'s section list give way to the
   method reference, and each title instruction cites the method's title rule in place of `commit-format` alone.
   `deliver-stack.md` keeps its instruction that the terminal title is an admitted Conventional Commits subject,
   scoped to multi-member deliveries and citing the method's contract (T5); a one-member delivery's title follows T1.

### Surface boundary

7. **S1 — the change, not its making.** By default a title or body describes the change — what it does and why — and
   nothing about how it was produced. It carries:
    - no ARC process vocabulary, such as work unit, Errand, Candidate, cohort, review lane or carrier, task or phase
      IDs, or lifecycle actions;
    - no reference to an ARC artifact — meta, draft, spec, task-list, or notes files, inbox entries, or session
      notes — except the design link (B3);
    - no process, provenance, or review metadata, such as who or what reviewed the change, how many passes ran, or
      which agent wrote it.
8. **S2 — subject matter is not process.** A project's own domain vocabulary is never a leak: a change whose subject is
   a concept names that concept. The method states this, so a change to a tool's own feature names the feature even
   when the tool is ARC.
9. **S3 — the target repository's prescription governs.** Before composing, the agent checks the target repository
   for a pull-request template, a contributing guide, an AI-use policy, and a security policy. On GitHub a template is
   a `pull_request_template.md` file or a `PULL_REQUEST_TEMPLATE/` directory in the root, `docs/`, or `.github/`, and
   the template, contributing guide, and security policy may instead be inherited as defaults from the owner's
   `.github` repository, which a checkout does not show. Where one prescribes content — sections, a checklist, a
   disclosure in a given form — the prescription governs and the method's defaults fill only what it leaves open:
    - **The template decides structure.** Which sections exist, their order, and their form — checklists and
      disclosure fields included — come from the template. A section with nothing to report follows the template's
      own convention; B1's omission gate does not delete a prescribed section.
    - **The method shapes content.** What is written into those sections follows the decision form (B2), the length
      budget (B6), and S1 for anything the template does not ask for. A checklist item is ticked only for what
      actually happened.
    - **Placement.** Decisions (B2) and the design link (B3) go in the template's section for reviewer notes, or at
      the end of its description section when it has none.
    - **Disclosure.** A disclosure the project requires is written in the form it asks for, overriding S1 for that
      content, as body text where the project forbids trailers.
10. **S4 — undisclosed vulnerabilities.** A fix for a vulnerability not yet publicly disclosed follows the target
    project's security policy, and its title and body do not describe how the flaw is exploited.

### Titles

11. **T1 — one grammar with commits.** The default title is a valid subject under the project's `commit.format`. Scope,
    length, and the breaking-change marker follow commit policy, and the scope names the dominant locus of the change.
    Under `conventional`, `validateConventionalSubject` in `lib/commit-check/policy.ts` requires a scope and rejects
    the `!` marker, so titles inherit both.
12. **T2 — pinned under squash.** Under `merge.strategy: squash` the title becomes the commit subject, so it stays a
    valid commit subject whatever an override changes. The method's `Contract:` line states this rule (M1), because a
    populated override in the default `replace` mode skips the `.default` section and the contract is what binds
    every override. Under `merge` and `rebase`, T1 is the method default, which an override may replace — for example,
    with a plain imperative sentence.
13. **T3 — the stated justification.** The method justifies T1 by what holds under every merge strategy: scannable and
    filterable pull-request lists, tools that read titles (release drafting, title-prefix labelers), squash safety if
    a project switches strategy, and one grammar for the agent to compose. It does not rest the rule on the
    Conventional Commits specification, which governs commits, and it does not claim that commit-reading release
    tools consume titles under merge commits.
14. **T4 — guided, not gated.** No code checks a pull-request title's format; code cannot see a method override.
15. **T5 — stacked deliveries.** In a multi-member delivery the authored terminal title is a Conventional Commits
    subject with an admitted type — `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, or `revert`, the set
    `CONVENTIONAL_TYPES` in `lib/commit-check/policy.ts` holds — whatever `commit.format` or an override says. The
    method's `Contract:` line states this rule and names the eight types (M1), so it stands when the default sections
    of this method or `commit-format` are replaced. `arc delivery publish` takes the stack's type from that title and
    refuses (`terminal-title-not-conventional` from `resolveDeliveryPublicationPresentations`) when it is not one; a
    one-member delivery's title is published unchanged and follows T1. The method also states that the verb composes
    every published request title in the stack from that terminal title and the delivery plan, and that authored
    presentations do not set member titles.

### Body

16. **B1 — one shape, content-gated.** Every pull request in the method's scope whose body an author writes (M1) —
    Errand and work-unit pull requests, a multi-member delivery's terminal request, and any other in scope — uses this
    body, except where a prescribed template decides the structure (S3). A section whose gate does not hold is omitted
    entirely, with no placeholder. Nothing precedes `Summary`: no `Design`, `Local review`, or other field line. In
    order:
    1. **`## Summary`** — always. One to three sentences: what changed and why, readable alone. Issue references sit
       inline as plain references (`#123`); a closing keyword (`Fixes #123`), which closes the issue on merge, is used
       only where the project's convention calls for one. A change that breaks a public contract says so in the first
       sentence and names the migration.
    2. **`## Changes`** — when the change spans more surfaces than the Summary can name. Three to seven outcome bullets
       in the form `- _topic_ — what landed`, never a file inventory. A visible change may carry a before-and-after
       capture here.
    3. **`## Notes for Reviewers`** — when a decision qualifies (B2), the design link applies (B3), or there is a
       specific feedback ask.
    4. **`## Test Plan`** — when verification went beyond the gates (B4).
    5. **`## Out of Scope`** — when a reader would expect something the change leaves out. A tracked deferral carries
       its issue link. There is no separate `Follow-Up Work` section. An Errand may carry the section for a deferral;
       an exclusion that must stay left out answers yes to `classify-work-unit`'s record-test question on a
       deliberate exclusion, which makes the change a work unit rather than an Errand.

    The method gives the order's reason: it follows the reviewer's questions — what and why, where to look, what to
    weigh, how it was checked, and what not to expect.
17. **B2 — the decision guide.** `Notes for Reviewers` carries the decisions a reviewer needs to judge the diff, in one
    form for every kind of change and whether or not a design document is reachable. It is a selection, not the
    design's full record:
    - **Form.** One bullet per decision: an italic descriptor naming the question, then the choice, the alternative it
      was chosen over, and why, with an optional accepted cost.
    - **Inclusion — both must hold.** A credible alternative existed, and the rationale is not visible in the diff.
    - **Preference.** A decision that changes structure or an external contract, one that is costly to reverse, or one
      a reviewer would otherwise ask "why not X?" about.
    - **Excluded.** An implementation-local choice; a choice an existing convention forced; a decision about ARC's own
      process (S1); and a deliberate exclusion, which belongs in `Out of Scope`.
    - **Errands list every qualifying decision;** the B6 budget does not apply to them. A decision that needs more than
      its one line is a sign the change is a work unit, not an Errand.
    - **Work units select.** When more decisions qualify than B6 allows, the preference above chooses, and the rest
      stay in the design.
    - **Commit bodies** carry the same content as plain-prose bullets with no Markdown descriptor.
    - The section may also say where to look and what feedback is wanted.
18. **B3 — the design link.** When a design document is in the pull request's diff, `Notes for Reviewers` closes with
    one line linking it by a commit-pinned permalink — a blob URL at a commit SHA — with neutral link text such as
    "full design". It replaces the `Design:` field.
    - The design document in the diff is the tracked spec the work-unit branch carries. A layered pair
      (`spec-{name}-prd.md` and `spec-{name}-rfc.md`) is one design in two files: the line links each.
    - With no design document in the diff there is no line; the decisions (B2) carry what the reviewer needs, and an
      issue link carries origin.
    - The pin keeps the link alive after the branch is deleted. After a merge commit, the pinned commit is in the
      base's history. After a squash or rebase merge, it stays reachable through the pull request's head ref
      (Technical Considerations).
19. **B4 — Test Plan.** Present only when verification went beyond what the visible checks show: a manual scenario, a
    run against a real environment or host, a measurement, or steps a reviewer should exercise. It never restates CI
    or the local quality gates, since passing them is a precondition of publishing. Plain bullets, not checkboxes, each
    stating what was run and what was observed, specific enough to reproduce. Only what actually ran is listed.
20. **B5 — no review line.** The default body carries no line about review: no carrier or lane, no pass count, no
    finding summary, and no disposition. The `**Local review:**` field retires. A project that wants such a line adds
    it through the method's override; the method ships no format for one.
21. **B6 — length.** A body fits one screen: `Summary` within about three lines, `Changes` three to seven bullets, and
    `Notes for Reviewers` about three to five one-line decisions on a work unit (an Errand lists every qualifying one,
    B2). A body that needs more signals that design detail belongs in the design or that the change should split.
    Never restate the diff, the file list, or CI. Describe, don't sell: no adjectives that grade the work ("robust",
    "comprehensive") and no claim a reviewer cannot check. The method presents the budget as a heuristic.
22. **B7 — composition source.** The body is composed from the change itself — its diff, its design, and its
    verification. It does not derive from the Release Notes Entry, which `integrate-work-unit.md` composes later (step
    5) from the same facts.

### Keep-current

23. **K1 — the body follows review fixes.** Each review-fix round that can change an open pull request gains one step
    after an approved fix is pushed:
    - **Update** any section the fix made inaccurate, a listed decision (B2) included.
    - **Re-pin** the design link (B3) when either exit status says so: `git diff --quiet <pinned> HEAD -- <paths>`
      fails, meaning a design document changed (every linked path is tested); or
      `git merge-base --is-ancestor <pinned> HEAD` fails, meaning the pinned commit left the head's history. The step
      acts on those exit statuses rather than reasoning about Git state in prose. The ancestor test makes it correct
      both for an append-only fix and for a fix that rewrote the branch.
    - **Rounds:** `run-errand.md` § Ship — full protection step 4, and `integrate-work-unit.md` step 2, which also
      carries a multi-member delivery's terminal request, including the corrections it publishes through
      `arc delivery review-fix continue`.

### Host template

24. **H1 — no scaffold.** ARC writes no pull-request template into a project. The method's default includes a
    copy-ready Markdown block — the five section headings, each with its one-line gate — that a project may copy into
    its host template. Each gate line says to omit the section when the gate does not hold, so omission is the copied
    template's own convention. Once copied, that template is the project's prescription and S3 applies.

### Delivery members

25. **D1 — member presentation.** The method gives content guidance for each non-terminal member of a multi-member
    delivery: the summary is one short paragraph naming the member's purpose and outcome without restating its title,
    changes are outcome bullets present only when the summary cannot carry them, and no design reference is supplied.
    It does not restate the presentation's fields or shape, which `DeliveryMemberReviewerPresentation` declares and
    `deliver-stack.md`'s example shows. The publish verb composes each member's title and body from that presentation
    and the plan; the terminal request takes B1.
26. **D2 — `deliver-stack.md`.** § Validate and publish loads the method in place of the template's two forms. Its
    presentation example drops `designReference`, and its guidance says not to supply one. Its account of title
    composition matches `composeDeliveryRequestTitle` in `lib/delivery/materialization.ts`: the type comes from the
    authored terminal title and the scope is the work-unit ID.

### Rules and reconciliation

27. **R1 — `DEV-RULES.ARC` § Commit and PR surface language.** The pull-request half becomes an operation-anchored
    firing condition plus the boundary: always load `pull-request-format` before composing or editing a pull-request
    title or body within its scope (M1), inside a workflow or not, rather than composing one from memory; by default
    those titles and bodies carry no ARC process vocabulary, artifact reference, or process metadata (S1, S2). The
    commit half is unchanged. The pull-request half replaces the text it supersedes in place rather than adding to it.
28. **R2 — `DEV-RULES.ARC` § `.arc/` artifact references.** The rule that shipped or published content cannot reference
    a movable artifact, and its requirement of a backticked filename with no links or paths, gain one exception, in one
    clause covering both: the commit-pinned link to the design document in a pull request's diff (B3).
29. **R3 — `DEV-RULES.PROJECT`.** A passage of at most two sentences gives this repository's reading of S2: ARC's
    concepts are domain vocabulary here when they are a change's subject, while naming this repository's own work units
    and Errands as the process that produced a change is still process.
30. **R4 — squash traceability text.** The `squash` bullet in `strategy-configurability-architecture.md` and the
    `merge.strategy` comment in `arc-config.yml` (package and project copies) stop saying the pull-request description
    carries the traceability commits would; they say the title becomes the commit subject.
31. **R5 — the commit-side decision form.** `commit-format`'s default gains one plain-prose line: a decision bullet in
    a commit body names the choice, the alternative, and why, as the decision guide in `pull-request-format` defines
    (B2). It cites the method rather than firing it, so `commit-format` lists `pull-request-format` under `related`
    only, as it cites `commit-footer`; an `arc.methods` edge from it would close a cycle with M1's edge, which the
    method-dependency audit (`audit-method-triggers.ts`, run as `lint:arc:triggers`) refuses. The one workflow whose
    commits record decisions, `run-errand.md`, loads the guide through its own declaration (M6). Its § Execute commit
    step records each qualifying decision by that guide in place of "each fork the Errand settled", in both its prose
    and its message template.
32. **R6 — ADR-037.** A forward amendment to `adr-037-decide-errand-boundary-by-record-test.md` records that an Errand's
    pull-request decisions sit under `Notes for Reviewers` rather than `## Decisions`, and that its pull request and
    commit record each qualifying decision (B2) rather than each settled one. The earlier amendment stands.
33. **R7 — `drain-inbox.md`.** Its lean grooming-PR body is stated on its own terms, without "mirroring" `run-errand.md`
    § Ship, whose inline body no longer exists.
34. **R8 — indexes.** `reference/templates/arc/README.md` drops the template. In `system/methods/README.md`'s
    related-methods table, `pull-request-format` gains a row and `commit-format`'s row adds it.
35. **R9 — tests.** Tests that pin the template or the retired field move to the new surfaces:
    `review-driver-lifecycle.test.ts` (the template's `Local review` text, the delivery-member variant, and the
    `[{position}/{total}]` form), `prepublication-workflow.test.ts` (recipe inclusion and link resolution), and
    `review-gate-workflows.test.ts` (the `Local review` wording in `run-errand.md` and `integrate-work-unit.md`). Each
    either asserts the method and the new workflow wording or asserts the retired text's absence.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Planning and bookkeeping pull requests.** Pull requests from grooming sets, housekeep sweeps, and the lifecycle
  verbs — stub, park, resume, deactivate, decompose, and archive — keep their current bodies. They carry only planning
  or lifecycle records, and they stop being pull requests once that state moves out of tracked files. An Errand pull
  request follows B1 whatever its diff, including a planning-only one.
- **Commit-message surfaces.** Footers, trailers, the commit hook, and the review-disposition body of review-fix
  commits are unchanged. So is `commit-format`'s subject grammar: under `conventional`, a scope stays required and `!`
  stays rejected. R5 is the only change to commit guidance.
- **Delivery publication code.** `composeDeliveryRequestTitle`, `deriveDeliveryTitleIdentity`,
  `describeDeliveryMemberPresentation`, `DeliveryMemberReviewerPresentation`, and the `terminal-title-not-conventional`
  refusal are unchanged. Composed titles in a multi-member delivery, terminal included, keep the work-unit slug as
  scope and an `[n/N]` position, and fall outside S1 while the verb composes them — an accepted cost.
- **Review-projection pull requests.** This repository's `scripts/review-projection.sh` opens draft pull requests
  that project a work unit's review chunks and never merge; it is not shipped, and its composed titles and bodies are
  unchanged.
- **A title check at merge time.** Under squash the title becomes an unvalidated commit subject; no merge-time check is
  added (T4).
- **A generated or scaffolded host template** (H1).
- **Re-pinning outside a review-fix round.** No ARC operation today rewrites an open pull request's branch outside a
  review fix, but two rewrites can follow the last keep-current step and leave the pin stale through merge, an
  accepted residual: the history cleanup — squash, reorder, final rebase — that `strategy-concurrent-work.md` sanctions
  at integration, after review; and routine catch-up rewrites once a rewriting history policy becomes the default,
  which the storage design specifies (`history.policy: rewrite-with-lease`).
- **The design-document export.** Neither the export setting nor its copy is built here, and B3 does not yet name
  the export (Technical Considerations).
- **Disclosure, provenance, or review lines by default** (S1, B5).

## Technical Considerations

- **Expected contract — the design-document export.** The storage design specifies a setting,
  `storage.track_design_docs: none | specs`, that copies a work unit's authored design into `.arc/specs/<slug>/` on its
  branch at publication, re-exports it on an amending review fix, and deletes it in candidate-tail cleanup before
  merge. It is absent from `src/` and `arc-config.yml` today and becomes available with the storage cutover. Until
  then B3 links the tracked spec. When the export exists, B3's subject becomes the exported copy under `specs`, with
  no line under `none`. That extension lands with the export, not here; the shipped method describes current
  behavior only.
- **Permalinks.** On GitHub a pinned link has the form `https://github.com/<owner>/<repo>/blob/<sha>/<path>`, where
  `<sha>` is a commit on the head branch that holds the current design and `<path>` is its path at that commit. K1
  names the two re-pin tests. GitHub keeps `refs/pull/<n>/head` after a branch is deleted (observed here on merged
  pull requests, such as `refs/pull/300/head`), but does not document its retention. The body is edited with
  `gh pr edit <n> --body-file`.
- **Hosts.** The method stays host-neutral where it can and names GitHub specifics (template locations, permalink
  form, `gh`) as GitHub's.
- **Classification and install.** `classifyFile` decides update behavior: a `Configurable` method keeps its populated
  override across `arc update`, while a `Framework` file such as the retiring template is overwritten. The generated
  install manifest under `system/.internal/` follows the recipe.
- **Package-project sync.** Package source is authoritative; each edited framework file is synced to its `.arc/`
  copy, and configurable files keep project-specific sections.
- **Workflow authoring.** The edits to `run-errand.md`, `integrate-work-unit.md`, `deliver-stack.md`, and
  `drain-inbox.md` follow the workflow-authoring strategy: a method is declared in `arc.methods` and loaded at the step
  that fires it.
- **Compatibility.** ARC is pre-public-release, so the template retires without an alias. Since update overwrites it,
  no project override of it survives to migrate.
- **This repository's settings.** Pull requests merge by merge commit only (`allow_squash_merge` and
  `allow_rebase_merge` are false), with `merge_commit_title: MERGE_MESSAGE` and `merge_commit_message: PR_TITLE`, so a
  title enters history as the merge commit's body. The repository has no host pull-request template. No CI job or hook
  checks a pull request's title or body. `arc delivery publish` is the only CLI composer of a title or body; Errand
  and work-unit pull requests are agent-composed (`gh pr create` with no `--title` or `--body` in either workflow).
  The only other composer is the unshipped `scripts/review-projection.sh` (Non-Goals).

## Design Considerations

The decisions behind the requirements, with the alternatives they were chosen over.

- **Boundary fit: stays one work unit.** One concern — what ARC writes on a pull request — whose title, body, and
  metadata rules share one reader and one composition point. No independently deliverable piece stands apart: the
  method, its consumers, and the reconciled rules land together or leave contradictory guidance shipped.
- **Settings in a method, not configuration (M1, M5).** A configuration key per choice was the alternative. A method
  mirrors `commit-format`, survives `arc update` as a configurable file, and does not depend on where configuration is
  stored, so no key needs relocating later. The template could not serve: update overwrites it.
- **The body shape stays method prose, not a typed renderer (B1, M5).** A CLI renderer taking typed sections — the
  shape `DeliveryMemberReviewerPresentation` already gives stacked members — was the alternative, and the direction of
  moving structure out of prose favors it. It loses here for three reasons: code cannot see a method override, so a
  renderer could not honor a project's changed shape without the configuration keys M5 declines; what remains for code
  is only ordering and omitting empty sections, while the substance — which decisions qualify, what a reviewer would
  expect — is judgment either way; and nothing checks a body today, so a renderer would add machinery without a
  consumer. Delivery keeps the one typed composer.
- **Titles keep Conventional Commits, justified by what holds (T1–T3).** A plain imperative sentence was the
  alternative under merge commits, where no commit-reading tool consumes the title. The format stays the default for
  list scanning and filtering, title-reading tools, squash safety, and one grammar with commits; the last 25 merged
  pull requests here already use it. A project may override it under `merge` and `rebase`, except for a stacked
  delivery's terminal title, which the publish verb parses (T5).
- **The method defines no stack-specific form for published titles (T5, D1).** Documenting the composed
  `type(<slug>): [n/N] <summary>` form as the stack's title format was the alternative. The slug-as-scope breaks
  `commit-format`'s locus rule, a slug `SLUG_PATTERN` admits with a leading digit fails `SCOPE_PATTERN`, and a
  position goes stale when publication adopts an existing request. No stacked-diff tool writes position into a title.
  The method states only what the verb composes, and T5 constrains only the terminal title the author writes, because
  the verb parses it. Changing the composed titles is outside this change (Non-Goals).
- **One body, content-gated (B1).** Separate Errand and work-unit shapes were the alternative. One shape with gates
  lets the kinds differ only by content, so the same reader questions get the same places. `Changes`,
  `Notes for Reviewers`, and `Test Plan` stay separate because each answers a different question — navigation,
  judgment, verification — and the gates keep empty ones out. `Follow-Up Work` folds into `Out of Scope` because its
  pointers to drafts and inbox entries are artifact references.
- **`Notes for Reviewers` holds the decisions (B2).** A top-level `## Decisions` heading was the alternative.
  Reviewer-directed notes are the established idiom (Kubernetes' "Special notes for your reviewer"), and stating the
  feedback wanted is the strongest predictor of acceptance in a study of about 80,000 pull requests (Pirouzkhah et al.,
  2026). The form is a compressed Y-statement (Zimmermann). Inclusion and exclusion compose existing tests: the ADR
  strategy's "multiple alternatives were considered", Google's guidance that a description carries what the diff
  cannot, and `classify-work-unit`'s design-versus-implementation floor.
- **Errands list every qualifying decision; work units select (B2, B6).** Applying the budget to Errands was the
  alternative. An Errand has no design document, so its pull request and commit carry its decisions; the qualifying
  tests still apply, and a decision that outgrows its line marks a work unit. A work unit's full record
  stays in its design.
- **A pinned design link replaces the `Design:` field (B3).** Keeping the field was the alternative; a backticked
  filename is an artifact reference a host reviewer cannot resolve. Linking the design earns its keep only if
  reviewers find it, and the files list buries it. A branch link dies when the design moves or the branch is deleted;
  a pinned link survives while its commit is reachable. This change reads the pinned link as content rather than an
  artifact reference, for the one artifact that exists to be reviewed, and records that reading in `DEV-RULES.ARC`
  (R2).
- **No review line (B5).** Keeping a carrier-only marker was the alternative. It existed because local review leaves
  no platform trace, so without it only the person who ran the review knows it happened. That premise holds, but the
  line fails the reader:
    - It is an ARC process concern on a host surface (S1).
    - No convention covers disclosing pre-publication AI review, so a shipped line would mint one.
    - A reviewer who does not use ARC gets a claim they cannot verify, and a "reviewed" marker invites lighter human
      review, the opposite of its intent.
    - Richer review reporting had an extension route, and the extension mechanism is gone.
    - The diff is the evidence. Fix commits are not, and a clean review leaves none.

  **Accepted cost:** until review facts are stored where teammates can read them, a teammate cannot see that a local
  review ran. ARC has no team installs yet, and a project that wants the line adds it through the override.
- **No host-template scaffold (H1).** Generating a host template from the canonical shape was the alternative. Kept in
  sync, it is a second home for the shape. Scaffolded once and then owned by the project, S3 would make it govern: it
  would outrank the project's own method override, keep an old shape when ARC's default changes, and render the
  content gates as static headings.
- **ARC adds nothing by default; the target project's requirement governs (S1, S3).** A default disclosure or
  `Assisted-by` trailer was the alternative. Policies diverge: Kubernetes requires disclosure in the description and
  forbids AI trailers; Ghostty, Fedora, and LLVM ask for disclosure in their own forms. Every policy puts
  accountability on the submitter. Following the project's own statement meets each without ARC choosing one.
- **Test Plan as plain bullets (B4).** Checkboxes were the alternative. They render as task lists in GitHub's
  pull-request list ("0 of 2 tasks"), and a self-ticked box is an attestation without a witness; the section's own
  lineage, Phabricator's "Test Plan", is prose.
- **A heuristic length budget (B6).** A hard limit was the alternative. The evidence on description length is mixed,
  so the budget guides rather than gates; maintainers objecting to verbose AI-written descriptions (Biopython, Godot)
  motivate the bound.

## Success Criteria

After landing, under default settings and with no prescribed pull-request template (S3), every Errand and work-unit
pull request opened has the following. A multi-member delivery's composed titles and member bodies, and planning and
bookkeeping pull requests, are excluded (Non-Goals).

1. A title that is a valid subject under `commit.format`.
2. A body holding only gated sections, in B1's order.
3. No ARC process vocabulary, artifact reference, or review line — subject matter (S2) and the pinned design link (B3)
   excepted.
4. One screen of length.
5. The same decision form whatever the kind of change.

Criteria 1–5 are checked against the next few pull requests after landing. The rest are checked at landing:

6. `pull-request-format` installs as a configurable method (`classifyFile` returns `Configurable`), and a populated
   override survives `arc update`.
7. `template-pull-request.md` is gone from the install recipe and from both copies, and no shipped file references it.
8. `commit-format` and `run-errand.md`'s commit step cite the decision guide.
9. No shipped workflow or method instructs a `Design:` field, a `Local review` field, a `## Decisions` heading, or a
   `Follow-Up Work` section in a pull-request body.
10. `run-errand.md`, `integrate-work-unit.md`, and `deliver-stack.md` declare and load the method, and `run-errand.md`
    and `integrate-work-unit.md` carry K1's keep-current step in the rounds K1 names.
11. `DEV-RULES.ARC`, `DEV-RULES.PROJECT`, the squash traceability text, ADR-037, `drain-inbox.md`, and the indexes read
    as R1–R8 require.
12. The test suite passes with R9's retargeted assertions.

## Open Questions

- **Resolve before starting:** none.
- **Resolve during work:** the exact wording of the method's copy-ready block (H1), and, per R9 test, whether it is
  retargeted to the new surface or asserts the retired text's absence.

## Amendments

None.

---
