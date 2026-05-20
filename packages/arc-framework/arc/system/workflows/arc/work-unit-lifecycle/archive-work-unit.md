---
purpose: Archive a shipped work unit — state flip, file sweep, ROADMAP regen. Cadence-invariant body.
audience: agent
arc:
  extensions:
    - post-work-unit-archive
---

# Workflow: Archive Work Unit

Archival mechanics for a shipped WU — state flip `Integrating → Shipped`, file sweep from `active/` to
`archive/<dated>/<wu-name>/`, ROADMAP regen. Body is invariant across invocation contexts: invoked inline
from [`integrate-work-unit.md`][integrate-work-unit] under `archive.cadence: with-integration` (default),
or standalone post-merge under `manual` cadence per [Work Organization Strategy][work-org] § Archival.

**When to use:** Composition is complete (Release Notes Entry + Completion Notes composed into
`active/meta-{name}.md` per `integrate-work-unit.md` Steps 8–9) and the meta file shows
`**State:** Integrating`. Composition is upstream — this workflow does not handle it.

---

## Steps

### 1) Pre-condition gate — `**State:** Integrating`

Verify the meta file's state:

```bash
grep -E '^\- \*\*State:\*\*' .arc/active/meta-{name}.md
```

Halt with surface if `**State:** Integrating` is absent — upstream composition in `integrate-work-unit.md`
is the prerequisite. State flip below is the only transition archive owns.

### 2) State flip — `Integrating → Shipped`

Edit `active/meta-{name}.md`: `**State:** Integrating` → `**State:** Shipped`. Single direction; always.

### 3) Sweep — move WU files to `archive/`

```bash
mkdir -p .arc/archive/{dated}/{name}
git mv .arc/active/meta-{name}.md   .arc/archive/{dated}/{name}/
git mv .arc/active/prd-{name}.md    .arc/archive/{dated}/{name}/   # when WU has a PRD
git mv .arc/active/tasks-{name}.md  .arc/archive/{dated}/{name}/   # when WU has a task list
git mv .arc/active/notes-{name}.md  .arc/archive/{dated}/{name}/   # when present
git mv .arc/active/atomic-{name}.md .arc/archive/{dated}/{name}/   # when present
```

`{dated}` follows `YYYY-q*` (e.g., `2026-q2`). Adjust the file list to what exists for the WU —
per-worktree isolation means `active/` carries only this WU's artifacts (see [Work Organization
Strategy][work-org] § Per-Worktree Isolation).

### 4) Regenerate ROADMAP · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

WU integration is a regen fire-point. Hand-maintain (interim, pre-CLI) per [Work Organization Strategy
§ ROADMAP][work-org-roadmap] — the shipped WU drops out of ROADMAP (rendered from `active/**` and
`backlog/planned/**`; once swept, no longer reachable).

### 5) Fire `post-work-unit-archive` extension

If `post-work-unit-archive` appears in the active-extensions list (established at session init), load and
execute its [`.actions`][arc-ext-post-archive]. Otherwise, skip.

### 6) Commit archival

Bundle state flip + sweep + ROADMAP regen.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): archive {name}

- Flip State: Integrating → Shipped
- Sweep meta + companions to archive/{dated}/{name}/
- Regenerate ROADMAP

Context: meta-{name}.md (archival)
```

See [DEV-RULES.ARC][dev-rules-arc] § Commit format.

---

## Post-`Shipped` errata convention

Release Notes Entry edits after `**State:** Shipped` are errata only — git history is the lock (matches
keep-a-changelog norms). No mechanical enforcement; convention only.

---

## Next step

- **Inline under `with-integration`:** Return to [`integrate-work-unit.md`][integrate-work-unit] Step 14 —
  the final integration push covers completion content + sweep + ROADMAP regen as one push.
- **Standalone under `manual`:** Archival is the terminal step. Push the archive commit per project
  convention (under `branch.protection: full`, route through a housekeeping branch + PR).

## Related workflows

- [`integrate-work-unit.md`][integrate-work-unit] — composition + cadence dispatch; this workflow handles
  archival mechanics only.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[integrate-work-unit]: integrate-work-unit.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[arc-ext-post-archive]: ../../../extensions/post-work-unit-archive.md
