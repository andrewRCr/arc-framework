# Template: Pull Request Body

Template and guidance for composing pull request descriptions when integrating a work unit. The PR
body is a pre-merge artifact written for the reviewer — focused on what the change is, what shipped,
and what to verify. Post-merge content (workflow continuity, retrospective findings, plan-vs-shipped
delta) belongs in the work unit's durable record (status file) and SESSION-NOTES, not the PR body.

**Formatting follows [strategy-task-list-formatting][task-list-formatting]:**

- Bold field labels (`**Field:**`) for top-of-body metadata
- Italic field labels (`_Field:_`) for in-section descriptors
- Loose-list rendering when any bullet spans 2+ lines — blank line between every item in that list

---

## Template

```markdown
**Spec:** {path or URL — PRD, task list, or external tracker; mirrors the WU's status-file Spec field}

## Summary

{1-2 sentences naming what changed and, when non-obvious, why. The commit-context footer carries
detailed traceability; Summary doesn't restate it.}

## Changes

{Concrete outputs of this PR — components, capabilities, structural shifts. Outcome-shaped bullets,
not an exhaustive diff inventory. Topic phrase + one short sentence per item.}

- _{Topic phrase}_ — {what landed; one or two short sentences}

- _{Another change}_ — {description}

## Test Plan

{Author-verified manual scenarios — edge cases, reproduction steps, behavior checks beyond what CI
covers. Omit categories CI already runs (lint, typecheck, test suite, build) — restating them is
table-stakes redundancy. If no manual verification was performed, omit the section entirely.}

- [ ] {Manual scenario or edge case verified}

- [ ] {Reproduction step a reviewer can run to validate behavior}
```

### Optional Sections

> **Out of Scope** — Add when this PR deliberately doesn't change adjacent surfaces, defers
> concerns, or makes an explicit boundary call. Helps reviewers calibrate scope expectations and
> prevents review-time expansion pressure. Omit if nothing notable is excluded.
>
> ```markdown
> ## Out of Scope
>
> - {Explicit non-change with brief rationale}
> ```

<!-- -->

> **Follow-Up Work** — Add when items are deferred from this PR with forward pointers (issues,
> plan-docs, atomic-inbox entries). Distinct from Out of Scope: these *will* happen, captured here
> as forward commitments. Omit if no deferrals.
>
> ```markdown
> ## Follow-Up Work
>
> - {Deferred item} — {pointer to issue, plan-doc, or atomic-inbox entry}
> ```

---

## Section Guidance

**Spec — required.** Mirrors the WU's status-file `**Spec:**` field. For external trackers
(GitHub issues), use the URL. For in-repo planning artifacts (PRDs, task lists), use the relative
path. Single value, not a list — the Spec field abstracts over the WU's authoritative scope source.

**Summary — required.** Frame the change for the reviewer. Long Summaries get skimmed; keep tight.
Why-it-matters belongs here when non-obvious; otherwise let the diff and the Spec link carry it.

**Changes — recommended for substantial PRs.** For single-line bug fixes or trivial changes the
Summary can subsume the Changes content; omit the section in that case. For multi-component or
multi-file PRs, Changes orients reviewers to where to look.

**Test Plan — content-gated.** Include only when there's manual verification beyond CI to report
(see Anti-Patterns below). Omit entirely if everything is automated.

**Out of Scope and Follow-Up Work — optional.** Include only when there's material content. Empty
optional sections are noise.

### Anti-Patterns

**CI mirroring in Test Plan.** Listing automated gates (`- [x] Markdown lint clean`,
`- [x] Tests pass`, `- [x] Build clean`) restates what CI already shows. Test Plan content should
be what CI doesn't carry — manual scenarios, edge cases, reproduction steps. If nothing manual was
verified, omit the section.

**Post-merge workflow continuity.** Phrases like "Next action after merge: invoke X" or session-
handoff continuity belong in the WU's status file and SESSION-NOTES, not the PR body. The reader is
reviewing a change set. See [DEV-RULES.ARC][dev-rules-arc] § Write for the reader.

**Success-criteria status and pre-merge-review meta-narration.** PRD success-criteria status
("X of Y met + supersessions") and "I reviewed locally before pushing" are post-hoc retrospective
signals (archive-reader audience), not review signals. They live in the WU's durable record, not
the PR body. CI status shows gates passed; the diff is what reviewers verify.

**Restating the commit-context footer.** The footer's `Context:` carries task references and WU
naming for traceability. Summary doesn't need to repeat this — they're complementary surfaces.

---

[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
[dev-rules-arc]: ../constitution/DEV-RULES.ARC.md
