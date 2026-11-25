---
purpose: Archive a shipped work unit — state flip, archive placement, cohort closeout. Cadence-invariant body.
audience: agent
---

# Workflow: Archive Work Unit

Archival mechanics for a shipped WU — state flip `Integrating → Shipped`, the move of its records to their dated
archive placement, and cohort closeout when the shipped WU is the final member. Body is invariant across invocation
contexts: invoked inline from [`integrate-work-unit.md`][integrate-work-unit] under `archive.cadence:
with-integration` (default), or standalone post-merge under `manual` cadence per [Work Organization
Strategy][work-org] § Archival.

**When to use:** Composition is complete (Release Notes Entry + Completion Notes composed and saved into the meta per
`integrate-work-unit.md` Steps 5–7). Use this workflow for the initial archive or to finish publication and cohort
closeout for the same work unit's persisted archive.

---

## Steps

### 1) Pre-condition gate — initial archive or recovery

Query the work unit's authoritative lifecycle state:

```bash
arc status {name} --json
```

For a first archive, require `state: "integrating"` and saved upstream composition. For recovery, require
`state: "shipped"` in `completed` for the same work unit. Halt on a failed query or any other state. Surface the
observed condition, follow any reported remedy, and rerun `arc status {name} --json` before continuing.

### 2) Run the archive — `arc archive`

For recovery, run `arc archive {name}` to settle the persisted archive and recover its cohort report.

For an initial archive, use the command below. It computes the dated, numbered archive placement,
moves the WU's records there, flips `**State:**` to `Shipped`, clears the meta `**Branch:**` field to `[none]`, resets
the orientation soft fields, writes the `**PR URL:**` / `**Completed:**` finalize facts as managed fields, and — when
this WU is its cohort's final member — closes the cohort, moving its document to a `{NN}a_cohort-<leaf>` closeout
placement.

```bash
arc archive {name} --pr-url "$(gh pr view {type}/{name} --json url --jq .url)"
# Bare `arc archive` context-defaults to the current worktree's WU.
```

Source `--pr-url` from the integration PR (opened earlier this ceremony). Omit it when no PR exists yet (offline /
pre-PR / standalone). The command writes a `[none]` placeholder and warns. Once the PR exists, have the Owner
set `PR URL` in the archived meta, using `arc view meta --for {name} --path` to locate it. Run `arc save` and
verify the saved value with `arc view meta --for {name}`. If the configured writer refuses the edit, surface its
diagnostic and report that the URL is still missing. `--completed` defaults to today (the ship day). Pass it only
on the initial archive when recording a past ship date.

`{dated}` follows `YYYY-q*` (e.g., `2026-q2`); `{NN}` is the next completion-order index in that quarter,
reset per quarter — both computed by the command. The write is published by the command itself, with nothing to commit
or push. The command reports the archived meta's path and each cohort document it closed — the final-member signal
Step 3 consumes. On refusal, surface the reason and follow the supplied remedy. If it names an archive retry,
re-enter Step 1 for the same work unit after repair. Require a successful archive report before Step 3.

**No teardown.** `arc archive` does **not** delete the working branch or tear down the worktree: that physical
teardown stays the integration tail's post-merge cleanup ([`integrate-work-unit.md`][integrate-work-unit] Step 11).
The archive itself is protection-agnostic and runs the same under either cadence.

### 3) Cohort closeout content — final member only

For each closed cohort in Step 2's successful report, open its document at the reported closeout path. Skip
authoring if it already has a complete `## Closeout` section. Otherwise, complete the section as follows. Save
any outstanding closeout edits with `arc save` and require success before continuing. On refusal, apply the reported
remedy and retry the save.

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

The cohort closeout entry is not a WU archive: it carries no meta, task list, branch, or release notes entry.
It preserves completion-order browsing while the cohort doc's `Parent` field records its nesting.

---

## Post-`Shipped` errata convention

Release Notes Entry edits after `**State:** Shipped` are errata only, matching keep-a-changelog norms: edit the
archived meta's Release Notes Entry in place, then save it with `arc save`; the store's history of the archived meta
records each correction. A substantial change is a new, origin-linked work unit, since no verb reopens archived work.
No mechanical enforcement; convention only.

---

## Next step

- **Initial pre-merge archive under `with-integration`:** Return to [`integrate-work-unit.md`][integrate-work-unit]
  Step 9 — the final integration push covers the candidate tail.
- **Integration recovery:** Return to the integration resume point that invoked archival.
- **Post-merge archive under `manual`:** Resume integration Step 11 at teardown when invoked from integration.

## Related workflows

- [`integrate-work-unit.md`][integrate-work-unit] — composition + cadence dispatch; this workflow handles
  archival mechanics only.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[integrate-work-unit]: integrate-work-unit.md
