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
is the prerequisite. The `arc archive` sweep below is the transition archive owns; physical branch/worktree
teardown is the integration tail's post-merge cleanup, not archive's.

### 2) Run the archive sweep — `arc archive`

`arc archive` performs the deterministic ship mechanics through the executor: it computes the dated/numbered
`completed/{dated}/{NN}_{name}/` destination, relocates the WU's artifact set there, flips `**State:**` to
`Shipped`, clears the meta `**Branch:**` field to `[none]`, resets the orientation soft fields, and — when this WU
is its cohort's final member — sweeps the coordinating `cohort-<leaf>.md` into a `{NN}a_cohort-<leaf>` closeout
sidecar.

```bash
arc archive {name}   # or bare `arc archive` — context-defaults to the current worktree's WU
```

`{dated}` follows `YYYY-q*` (e.g., `2026-q2`); `{NN}` is the next completion-order index in that quarter,
reset per quarter — both computed by the command. The relocations are **staged, not committed** (the executor
never commits); they bundle into the archival commit (Step 5). The command reports the computed destination and
**whether the cohort doc was swept** — the final-member signal Step 3 reacts to.

**Mergeable sweep only.** `arc archive` does **not** delete the working branch or tear down the worktree: that
physical teardown is non-mergeable (it cannot ride the ship PR) and stays the integration tail's post-merge
cleanup ([`integrate-work-unit.md`][integrate-work-unit] Step 13). The sweep itself is protection-agnostic — it
rides the ship PR under `with-integration` (one PR, full or partial protection), or commits standalone post-merge
under `manual`.

### 3) Cohort closeout content — final member only

Skip unless Step 2 reported a cohort sweep (this WU was its cohort's final member; a standalone WU or one with
members still in flight reports none). `arc archive` already performed the mechanical `git mv` of
`cohort-<leaf>.md` into its `{NN}a_cohort-<leaf>` sidecar — author its closeout content at that swept path:

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

The cohort closeout entry is not a WU archive: it carries no `meta-*`, task list, branch, or release notes entry.
It preserves completion-order browsing while the cohort doc's `Parent` field preserves nesting context.

### 4) Regenerate ROADMAP · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

WU integration is a regen fire-point. Re-render per [Work Organization Strategy § ROADMAP][work-org-roadmap] —
the shipped WU drops out of ROADMAP (rendered from `active/**` and `backlog/planned/**`; once swept, no longer
reachable).

### 5) Fire `post-work-unit-archive` extension

If `post-work-unit-archive` appears in the active-extensions list (established at session init), load and
execute its [`.actions`][arc-ext-post-archive]. Otherwise, skip.

### 6) Commit archival

Bundle the `arc archive` sweep (state flip + WU relocation + cohort move) + the cohort closeout content when
applicable + ROADMAP regen.

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

- **Inline under `with-integration`:** Return to [`integrate-work-unit.md`][integrate-work-unit] Step 12 —
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
