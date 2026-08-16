# Template: Pull Request Body

Template and guidance for composing pull request descriptions when integrating a work unit. The PR
body is a pre-merge artifact written for the reviewer — focused on what the change is, what shipped,
and what to verify. Post-merge content (workflow continuity, retrospective findings, plan-vs-shipped
delta) belongs in the work unit's durable record (meta file) and SESSION-NOTES, not the PR body.

**Formatting follows [strategy-task-list-formatting][task-list-formatting]:**

- Bold field labels (`**Field:**`) for top-of-body metadata
- Italic field labels (`_Field:_`) for in-section descriptors
- Loose-list rendering when any bullet spans 2+ lines — blank line between every item in that list

---

## PR Title Format

PR titles follow ARC's [commit-format method][commit-format] (Conventional Commits —
`type(scope): description`). Most PRs need no prefix:

```text
type(scope): description              — implementation, fix, chore, etc.
```

Implementation is the default activity in a code repository — flagging every implementation
PR is noise. The reserved prefixes below (design RFCs, releases) are the scannable exceptions
in a PR list otherwise dominated by code work. Matches Rust (`RFC:` on design PRs only) and
Kubernetes (`KEP-###:` on enhancement PRs only).

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
**Design:** `{filename}` or {URL}
**Local review:** {carrier identity}

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

## Delivery-Member Variant

A non-terminal member of a planned delivery stack is a review and merge boundary inside one work unit, not a
second work unit. Use the member form below:

```text
{work-unit-slug} [{position}/{total}]: {member title}
```

The position is stack-review metadata; commit-format rules continue to govern the commits that land. The title
already supplies delivery identity, position, and member scope. Do not add a `Delivery` field that repeats them.

The body uses the ordinary template's reviewer-facing roles, with content scoped to this member:

```markdown
**Design:** `{filename}` or {URL} <!-- optional; see below -->

## Summary

{One short paragraph naming this member's purpose and outcome. Do not restate the title or merely say that this is
one layer of a stack.}

## Changes

- _{Concrete topic}_ — {Specific output delivered by this member}

- _{Another concrete topic}_ — {Description}
```

`Changes` remains recommended rather than required when the Summary fully carries a small member. `Test Plan`,
`Out of Scope`, and `Follow-Up Work` retain their ordinary content gates, as does the `Local review` field. The
terminal member uses the ordinary work-unit template because it carries the lifecycle artifacts and closes the
work unit.

Design is content-gated for delivery members. Include `Design` only when the intended reviewers can resolve the
reference from the code repository, an accessible URL, or the configured ARC backing store. The design need not be
present in this member's diff. Omit the field when it would point GitHub-only or public reviewers at unavailable
content; work-unit identity in the title is correlation, not a substitute for an accessible design reference.

## Optional Sections

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
> draft-docs, atomic-inbox entries). Distinct from Out of Scope: these _will_ happen, captured here
> as forward commitments. Omit if no deferrals.
>
> ```markdown
> ## Follow-Up Work
>
> - {Deferred item} — {pointer to issue, draft-doc, or atomic-inbox entry}
> ```

---

## Section Guidance

**Design — required for ordinary work-unit PRs; content-gated for delivery members.** Mirrors the WU's meta-file
`**Design:**` field exactly when included. Single value, not a list — the field abstracts over the WU's
authoritative scope source. The delivery-member accessibility rule above governs whether that variant includes it.

- **In-repo artifact** — backtick-wrapped filename, no path: `` `spec-{name}.md` ``,
  `` `tasks-{name}.md` ``. Filename-only follows
  [DEV-RULES.ARC § `.arc` artifact references][dev-rules-arc] — files move over the WU lifecycle.
- **External tracker** — bare URL (no backticks). GitHub auto-links bare URLs; backticks
  suppress the link.
- **Combined ref** (filename + task pointer) follows the in-`.arc/` convention:
  `` `tasks-{name}.md` `` (Task X.Y).

**Local review — content-gated.** Include only when a gated review ran locally before publication. Name the
carrier that ran it and nothing else — no pass counts, no finding summaries, no dispositions. Local review leaves
no trace the platform or the diff can show, which is the whole reason the field exists; review that ran on the
pull request is already visible where it happened. Omit the field entirely when no local review ran — no `None`,
no placeholder. Never carry it as `Reviewed-by:`, which long-standing convention reserves for consenting human
reviewers.

**Summary — required.** Frame the change for the reviewer. Long Summaries get skimmed; keep tight.
Why-it-matters belongs here when non-obvious; otherwise let the diff and the Design reference carry it.

**Changes — recommended for substantial PRs.** For single-line bug fixes or trivial changes the
Summary can subsume the Changes content; omit the section in that case. For multi-component or
multi-file PRs, Changes orients reviewers to where to look.

**Test Plan — content-gated.** Include only when there's manual verification beyond CI to report
(see Anti-Patterns below). Omit entirely if everything is automated.

**Out of Scope and Follow-Up Work — optional.** Include only when there's material content. Empty optional sections
are noise.

### Anti-Patterns

**CI mirroring in Test Plan.** Listing automated gates (`- [x] Markdown lint clean`,
`- [x] Tests pass`, `- [x] Build clean`) restates what CI already shows. Test Plan content should
be what CI doesn't carry — manual scenarios, edge cases, reproduction steps. If nothing manual was
verified, omit the section.

**Post-merge workflow continuity.** Phrases like "Next action after merge: invoke X" or session-
handoff continuity belong in the WU's meta file and SESSION-NOTES, not the PR body. The reader is
reviewing a change set. See [DEV-RULES.ARC][dev-rules-arc] § Write for the reader.

**Gitignored-file references.** SESSION-NOTES, ATOMIC-INBOX, and other gitignored files aren't
visible to reviewers (or anyone outside the developer's clone). Don't cite them as evidence,
context, or "see X for rationale" — the reference resolves to nothing for the audience. If the
substance matters for review, restate it inline; if it's workflow continuity, it doesn't belong
in the PR body at all. Tracked artifacts (meta files, plans, ADRs, completion docs, strategies)
are fine to reference.

**Success-criteria status and informal local-review narration.** PRD success-criteria status
("X of Y met + supersessions") and unstructured process narration such as "I reviewed locally before pushing" are
post-hoc retrospective signals, not the `Local review` attestation above. They live in the WU's durable record, not
the PR body. CI status shows gates passed; the diff is what reviewers verify.

**Restating the commit-context footer.** The footer's `Context:` carries task references and WU
naming for traceability. Summary doesn't need to repeat this — they're complementary surfaces.

---

[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
[dev-rules-arc]: ../../system/rules/DEV-RULES.ARC.md
[commit-format]: ../../system/methods/commit-format.md
[arc-config]: ../../system/arc-config.yml
