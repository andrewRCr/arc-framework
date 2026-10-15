---
name: pull-request-format
description: Compose pull-request titles, bodies, and reviewer-facing decisions from the change
arc:
  methods:
    - commit-format
related:
  - commit-format
override-active: false
---

# Method: pull-request-format

> - **Workflow:** [run-errand.md][run-errand], [integrate-work-unit.md][integrate-work-unit],
>   [deliver-stack.md][deliver-stack]
> - **When:** An agent composes or edits a pull-request title or body
>
> - **Contract:** Under `merge.strategy: squash`, the title remains a valid commit subject under the project's
>   commit policy, whatever an override changes. In a multi-member delivery, the authored terminal title is a
>   Conventional Commits subject with an admitted type: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`,
>   or `revert`, regardless of `commit.format` or an override.
> - **Related:** [commit-format](commit-format.md) — shared title grammar and commit-body decision content

## pull-request-format.override

[No override configured]

## pull-request-format.default

Applies to every Errand pull request, including planning-only Errands, and every other pull request except those
carrying only planning or lifecycle records from grooming sets, housekeep sweeps, or the stub, park, resume,
deactivate, decompose, and archive verbs. Those excluded requests follow their workflow's guidance.

### Surface boundary and project prescriptions

Describe the change: what it does and why. By default:

- No ARC process vocabulary: work unit, Errand, Candidate, cohort, review lane or carrier, task or phase IDs, or
  lifecycle actions used to narrate how the change was made.
- No ARC artifact references: meta, draft, spec, task-list, notes, inbox, or session files, except the design link
  below. Do not restate commit traceability footers or post-merge workflow continuity.
- No process, provenance, or review metadata: agent authorship, reviewer identity, pass count, findings, or
  disposition. There is no review line by default; a project wanting one adds it through this method's override.

Subject matter is not process: a project's own domain vocabulary belongs when the change concerns that concept,
including a change to ARC's own features.

Before composing, check the target repository's pull-request template, contributing guide, AI-use policy, and
security policy. On GitHub, check `pull_request_template.md` or `PULL_REQUEST_TEMPLATE/` in the root, `docs/`, or
`.github/`, and inherited defaults for the template, contributing guide, and security policy in the owner's
`.github` repository; a checkout alone does not show those defaults.

A project prescription governs; the defaults here fill only what it leaves open:

- The prescribed template decides sections, order, form, checklists, disclosures, and empty-section conventions.
  Do not omit a prescribed section under this method's content gates. Tick only what actually happened.
- Shape its content with the decision guide, length heuristic, and surface boundary wherever it asks for nothing
  different. Put decisions and the design link in its reviewer-notes section, or at the end of its description
  when it has none.
- Write required disclosures in the project's requested form, including body text where it forbids trailers.
  A required disclosure overrides the default metadata boundary for that content.

A fix for an undisclosed vulnerability follows the project's security policy; its title and body do not describe
how to exploit the flaw.

### Title

Load [commit-format][commit-format] and compose a valid subject under the project's `commit.format`. Scope names
the dominant locus of the change; scope, length, and breaking-change markers follow commit policy. Under
`conventional`, a lowercase scope is required and `!` is rejected.

One grammar makes pull-request lists scannable and filterable, serves title-reading tools such as release drafting
and prefix labelers, remains squash-safe if merge strategy changes, and gives the agent one grammar to compose.
Conventional Commits governs commits; commit-reading release tools do not thereby read titles under merge commits.
This is guidance, not a runtime title check. Under `merge` or `rebase`, an override may replace the default title
grammar; the header's squash and multi-member terminal-title constraints still hold.

For a multi-member delivery, `arc delivery publish` derives the stack's type from the authored terminal title and
composes every published title from it and the delivery plan. These verb-composed titles fall outside the authored
surface boundary above. Authored member presentations do not set member titles. A one-member delivery publishes the
authored title unchanged under the ordinary title policy.

### Body

Compose from the diff, design, and verification, not from a Release Notes Entry. Use the following order because it
follows the reviewer's questions: what and why, where to look, what to weigh, how it was checked, and what not to expect.
Without a prescribed template, omit each section whose gate does not hold, with no placeholder or metadata before
`Summary`.

1. **Summary — always.** One to three sentences naming what changed and why, readable alone. Put issue references
   inline (`#123`); use a closing keyword such as `Fixes #123` only under the project's convention. A public-contract
   break appears in the first sentence with its migration.
2. **Changes — when Summary cannot name all surfaces.** Three to seven outcome bullets in the form
   `- _topic_ — what landed`, never a file inventory. A visible change may include a before-and-after capture.
3. **Notes for Reviewers — when a decision qualifies, a design link applies, or specific feedback is wanted.**
   Follow the guide below; the section may also direct attention and ask for feedback.
4. **Test Plan — when verification went beyond the visible checks.** Plain bullets naming what actually ran and
   what was observed: a manual scenario, real environment or host run, measurement, or reproducible reviewer steps.
   Do not restate CI or local quality gates; passing them is a publication precondition. No checkboxes.
5. **Out of Scope — when a reader would expect something left out.** Give an issue link for a tracked deferral;
   no separate Follow-Up Work section. An Errand may defer work here, but a deliberate exclusion that must stay out
   makes the change spec-worthy under the record test and therefore a work unit.

#### Decision guide

A credible alternative existed and the rationale is not visible in the diff: both must hold. Prefer choices that
change structure or an external contract, cost much to reverse, or invite "why not X?" from a reviewer. Exclude
implementation-local choices, choices forced by convention, ARC process decisions, and deliberate exclusions
(which belong in Out of Scope).

Use one bullet per decision: an italic descriptor naming the question, then the choice, the alternative it was
chosen over, and why; an accepted cost is optional. For example:

`- _Copy timing_ — copy before the setup script rather than after it, since the script reads the copied files.`

Errands list every qualifying decision, without the work-unit decision budget. A decision needing more than its
one line signals a work unit. When more work-unit decisions qualify than the budget allows, select about three
to five one-line decisions by the preferences above; the rest stay in the design. The same qualification and form
apply whether or not a design document is reachable. Commit bodies carry the same content as plain-prose bullets
without the Markdown descriptor.

#### Design link

When the pull request's diff contains a design document, close Notes for Reviewers with one line using a
commit-pinned permalink and neutral link text such as "full design". Link the tracked spec on the branch; a
layered `spec-{name}-prd.md` and `spec-{name}-rfc.md` pair is one design, so link both on that line. With no design
in the diff, omit the line; decisions carry the review context and an issue reference carries origin.

On GitHub use `https://github.com/<owner>/<repo>/blob/<sha>/<path>` at a commit holding the current design. The pin
survives branch deletion while that commit is reachable: in base history after a merge commit, or through the
pull-request head ref after squash or rebase. Do not use a branch URL or a bare artifact filename.

#### Length and voice

Aim for one screen: Summary about three lines, Changes three to seven bullets, and work-unit decisions about
three to five one-line bullets. This is a heuristic; Errands list every qualifying decision. More suggests design
detail belongs in the design or the change should split. Never restate the diff, file list, CI, process narration,
or success-criteria status. Describe without grading adjectives such as "robust" or "comprehensive" or claims a
reviewer cannot check.

### Copy-ready host template

ARC scaffolds no host template. A project may copy this block; once copied, it is the project's prescription,
including its omission conventions:

```markdown
## Summary

Always: one to three sentences stating what changed and why.

## Changes

Omit unless Summary cannot name all surfaces; use three to seven outcome bullets.

## Notes for Reviewers

Omit unless a decision qualifies, a design link applies, or specific feedback is wanted.

## Test Plan

Omit unless verification went beyond visible checks; state what ran and what was observed.

## Out of Scope

Omit unless a reader would expect something left out; link any tracked deferral.
```

### Non-terminal delivery presentation

Give each non-terminal member of a multi-member delivery one short paragraph naming its purpose and outcome,
without restating its title. Supply outcome bullets only when that summary cannot carry them. Do not supply a
design reference. The publish verb composes its title and body from the presentation and plan; the terminal request
uses the full body guidance above. Follow [deliver-stack.md][deliver-stack] for the presentation input shape.

---

[commit-format]: commit-format.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
