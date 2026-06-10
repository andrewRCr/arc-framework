---
purpose: Archive a shipped work unit — state flip, file sweep, cohort closeout, ROADMAP regen. Cadence-invariant body.
audience: agent
arc:
  extensions:
    - post-work-unit-archive
---

# Workflow: Archive Work Unit

Archival mechanics for a shipped WU — state flip `Integrating → Shipped`, file sweep from `active/` to
`completed/<dated>/<NN>_<wu-name>/`, cohort closeout when the shipped WU is the final member, and ROADMAP regen.
Body is invariant across invocation contexts: invoked inline from [`integrate-work-unit.md`][integrate-work-unit]
under `archive.cadence: with-integration` (default), or standalone post-merge under `manual` cadence per
[Work Organization Strategy][work-org] § Archival.

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

### 3) Sweep — move WU files to `completed/`

```bash
mkdir -p .arc/completed/{dated}/{NN}_{name}
git mv .arc/active/meta-{name}.md   .arc/completed/{dated}/{NN}_{name}/
git mv .arc/active/spec-{name}.md   .arc/completed/{dated}/{NN}_{name}/   # single-form spec
git mv .arc/active/spec-{name}-prd.md .arc/completed/{dated}/{NN}_{name}/ # layered spec, when present
git mv .arc/active/spec-{name}-rfc.md .arc/completed/{dated}/{NN}_{name}/ # layered spec, when present
git mv .arc/active/tasks-{name}.md  .arc/completed/{dated}/{NN}_{name}/   # when present
git mv .arc/active/notes-{name}.md  .arc/completed/{dated}/{NN}_{name}/   # when present
```

`{dated}` follows `YYYY-q*` (e.g., `2026-q2`). `{NN}` is a 2-digit completion-order prefix assigned at
archival — the next index after the highest already present in the `{dated}` subdir (e.g., `10_` when
`01_`–`09_` exist), reset per quarter — giving a browse-time "by completion order" view. Adjust the file
list to what exists for the WU, moving both `spec-{name}-prd.md` and `spec-{name}-rfc.md` when the layered
pair exists — per-worktree isolation means `active/` carries only this WU's artifacts
(see [Work Organization Strategy][work-org] § Per-Worktree Isolation).

### 4) Cohort closeout — final member only

Skip when the archived WU's `**Cohort:**` field is `[none]`, empty, or absent.

Otherwise, resolve the cohort path from the WU's `**Cohort:**` field. The cohort doc's live home remains
`.arc/backlog/planned/{cohort-path}/cohort-{cohort-name}.md` until this closeout; `{cohort-name}` is the path's
leaf segment. Determine lifecycle-complete cohort membership by reading WU metas across:

- `.arc/backlog/planned/**/meta-*.md`
- `.arc/active/**/meta-*.md`
- `.arc/completed/**/meta-*.md`

If any member with the same `**Cohort:**` field is not under `.arc/completed/`, skip closeout — the cohort is
still live even if its doc has no co-located backlog members. The WU archived in Step 3 counts as completed.

When every member with the cohort path is under `.arc/completed/`, close the cohort doc:

1. Lightly clean the doc for archive: remove transient open coordination, route unresolved follow-up to its
   authoritative home, and keep only historical coordination that helps future readers.
2. Add an archive-phase separator and a brief `## Closeout` section above the file's final `---` separator:

    ```markdown
    ---

    ## Closeout

    - **Closed:** {YYYY-MM-DD}
    - **Final member:** `{name}`
    - **Member archives:** `{NN_member}`, `{NN_member}`, ...
    - **Outcome:** <one meaningful sentence>
    - **Follow-up:** [none] or <routed destination>
    ```

3. Move the cohort doc into a lettered sidecar of the WU archive entry from Step 3. Use `{NN}a` for the first
   cohort closed by this final member, `{NN}b` for a parent cohort that closes in the same event, and so on:

    ```bash
    mkdir -p .arc/completed/{dated}/{NN}a_cohort-{cohort-name}
    git mv .arc/backlog/planned/{cohort-path}/cohort-{cohort-name}.md \
      .arc/completed/{dated}/{NN}a_cohort-{cohort-name}/
    ```

The cohort closeout entry is not a WU archive: it carries no `meta-*`, task list, branch, or release notes entry.
It preserves completion-order browsing while the cohort doc's `Parent` field preserves nesting context.

### 5) Regenerate ROADMAP · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

WU integration is a regen fire-point. Re-render per [Work Organization Strategy § ROADMAP][work-org-roadmap] —
the shipped WU drops out of ROADMAP (rendered from `active/**` and `backlog/planned/**`; once swept, no longer
reachable).

### 6) Fire `post-work-unit-archive` extension

If `post-work-unit-archive` appears in the active-extensions list (established at session init), load and
execute its [`.actions`][arc-ext-post-archive]. Otherwise, skip.

### 7) Commit archival

Bundle state flip + WU sweep + cohort closeout when applicable + ROADMAP regen.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): archive {name}

- Flip State: Integrating → Shipped
- Sweep meta + companions to completed/{dated}/{NN}_{name}/
- Close cohort doc if {name} is the final member
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
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[arc-ext-post-archive]: ../../../extensions/post-work-unit-archive.md
