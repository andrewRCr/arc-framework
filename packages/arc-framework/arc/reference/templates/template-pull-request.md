# Template: Pull Request Body

Template and guidance for composing pull request descriptions when integrating a work unit. The PR
body is a pre-merge artifact written for the reviewer — focused on what the change is, what shipped,
and what to verify. Post-merge content (workflow continuity, retrospective findings, plan-vs-shipped
delta) belongs in the work unit's durable record (status file) and SESSION-NOTES, not the PR body.

**Formatting follows [strategy-task-list-formatting][task-list-formatting]:**

- Bold field labels (`**Field:**`) for top-of-body metadata
- Italic field labels (`_Field:_`) for in-section descriptors
- Loose-list rendering when any bullet spans 2+ lines — blank line between every item in that list

**Planning branches** use a smaller subset of this template — see § Planning PR Variant.

---

## PR Title Format

PR titles follow ARC's [commit-format method][commit-format] (Conventional Commits —
`type(scope): description`), with an optional bracket prefix signaling PR lifecycle stage:

```text
[PLAN] type(scope): description       — planning branch PR
type(scope): description              — implementation, fix, chore, etc.
```

Implementation is the default activity in a code repository — flagging every implementation
PR is noise. Planning and other lifecycle deviations get prefixes because they're scannable
exceptions in a PR list otherwise dominated by code work. Matches Rust (`RFC:` on design PRs
only) and Kubernetes (`KEP-###:` on enhancement PRs only).

**Smaller-scope PRs ride on the Conventional Commits type alone — no bracket prefix.** A typo
fix is `docs(scope): fix typo`, a dependency bump is `chore(deps): bump foo`, a one-file
refactor is `refactor(scope): description`. The type already conveys scope and reviewer
expectation; adding `[ATOMIC]` / `[TINY]` / etc. has no industry precedent and creates noise.

**Reserved prefixes** — don't introduce until a clear pattern needs filtering:

- `[RFC]` — formal design PR with no associated work unit yet (matches Rust's pattern)
- `[REL v0.x.y]` — release PRs

**Merge-strategy note:** under squash-merge, the PR title becomes the commit message —
brackets enter commit history. Under merge-commit strategy (ARC default per
[`arc-config.yml`][arc-config] `merge.strategy`), brackets appear only in the merge commit;
underlying commits stay Conventional-Commits-clean.

---

## Template

```markdown
**Spec:** `{filename}` or {URL}

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

## Planning PR Variant

Planning branches deliver planning artifacts (PRDs, task lists, optional prior-WU archival) —
not implementation. The template above is implementation-flavored; planning PRs use the same
body structure with a smaller footprint.

**Required:** `**Spec:**` (PRD or task-list filename) and `## Summary` (planned WU name, category,
scope shape).

**Typical shape — simple planning branch:**

````markdown
**Spec:** `{filename}` — `prd-{name}.md` or `tasks-{name}.md`

## Summary

{Name the planned WU, category, scope shape in one or two sentences. Reference the PRD for
details rather than restating its contents.}

## Changes

- _{Artifact}_ — {what shipped: PRD with N requirements; task list with N phases / N tasks;
  notes file; etc.}
````

**Omit by default:** Test Plan (markdown lint is CI-carried; planning artifacts have no manual
verification surface beyond it), Out of Scope, Follow-Up Work — apply only when the planning
work itself made explicit boundary calls or surfaced deferrable items.

### Batch Planning Branch

Combines archival of a completed WU with planning of the next. Two top-level sections keep
the transitions distinct:

````markdown
**Spec:** `{filename of the new WU's planning artifact}`

## Summary

{Both transitions in one or two sentences — completed WU archived; new WU planned with scope shape.}

## Archival

- _{Completed WU}_ — {key outcomes, archive path}

## Planning

- _{New WU}_ — {scope shape, PRD requirement count, task-list phase/task count}
````

Cross-referenced from [integrate-planning-branch][integrate-planning-branch] as the canonical
PR-body shape for planning branches.

---

## Section Guidance

**Spec — required.** Mirrors the WU's status-file `**Spec:**` field exactly. Single value, not
a list — the Spec field abstracts over the WU's authoritative scope source.

- **In-repo artifact** — backtick-wrapped filename, no path: `` `prd-{name}.md` ``,
  `` `tasks-{name}.md` ``. Filename-only follows
  [DEV-RULES.ARC § `.arc` artifact references][dev-rules-arc] — files move over the WU lifecycle.
- **External tracker** — bare URL (no backticks). GitHub auto-links bare URLs; backticks
  suppress the link.
- **Combined ref** (filename + task pointer) follows the in-`.arc/` convention:
  `` `tasks-{name}.md` `` (Task X.Y).

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

**Gitignored-file references.** SESSION-NOTES, ATOMIC-INBOX, and other gitignored files aren't
visible to reviewers (or anyone outside the developer's clone). Don't cite them as evidence,
context, or "see X for rationale" — the reference resolves to nothing for the audience. If the
substance matters for review, restate it inline; if it's workflow continuity, it doesn't belong
in the PR body at all. Tracked artifacts (status files, plans, ADRs, completion docs, strategies)
are fine to reference.

**Success-criteria status and pre-merge-review meta-narration.** PRD success-criteria status
("X of Y met + supersessions") and "I reviewed locally before pushing" are post-hoc retrospective
signals (archive-reader audience), not review signals. They live in the WU's durable record, not
the PR body. CI status shows gates passed; the diff is what reviewers verify.

**Restating the commit-context footer.** The footer's `Context:` carries task references and WU
naming for traceability. Summary doesn't need to repeat this — they're complementary surfaces.

---

[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
[dev-rules-arc]: ../constitution/DEV-RULES.ARC.md
[integrate-planning-branch]: ../../system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md
[commit-format]: ../../system/methods/commit-format.md
[arc-config]: ../../system/arc-config.yml
