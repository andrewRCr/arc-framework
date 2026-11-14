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
`integrate-work-unit.md` Steps 5–7) and `arc view meta` shows `**State:** Integrating`. Composition is upstream —
this workflow does not handle it.

---

## Steps

### 1) Pre-condition gate — lifecycle state `integrating`

Query the work unit's authoritative lifecycle state:

```bash
arc status {name} --json
```

Continue only when the result reports `state: "integrating"`. Halt and surface a failed query or any other state —
upstream composition in `integrate-work-unit.md` is the prerequisite. The `arc archive` write below is the transition
archive owns; physical branch/worktree teardown is the integration tail's post-merge cleanup, not archive's.

### 2) Run the archive — `arc archive`

`arc archive` performs the ship in one write through the executor: it computes the dated, numbered archive placement,
moves the WU's records there, flips `**State:**` to `Shipped`, clears the meta `**Branch:**` field to `[none]`, resets
the orientation soft fields, writes the `**PR URL:**` / `**Completed:**` finalize facts as managed fields, and — when
this WU is its cohort's final member — closes the cohort, moving its document to a `{NN}a_cohort-<leaf>` closeout
placement.

```bash
arc archive {name} --pr-url "$(gh pr view {type}/{name} --json url --jq .url)"
# Bare `arc archive` context-defaults to the current worktree's WU.
```

Source `--pr-url` from the integration PR (opened earlier this ceremony). Omit it when no PR exists yet (offline /
pre-PR / standalone) — the command writes a `[none]` placeholder and warns; backfill later with
`arc archive {name} --pr-url <url>`. `--completed` defaults to today (the ship day); pass it only to backfill a
past date.

`{dated}` follows `YYYY-q*` (e.g., `2026-q2`); `{NN}` is the next completion-order index in that quarter,
reset per quarter — both computed by the command. The write is published by the command itself, with nothing to commit
or push. The command reports the archived meta's path and each cohort document it closed — the final-member signal
Step 3 reacts to.

**No teardown.** `arc archive` does **not** delete the working branch or tear down the worktree: that physical
teardown stays the integration tail's post-merge cleanup ([`integrate-work-unit.md`][integrate-work-unit] Step 11).
The archive itself is protection-agnostic and runs the same under either cadence.

### 3) Cohort closeout content — final member only

Skip unless Step 2 reported a closed cohort (this WU was its cohort's final member; a standalone WU or one with
members still in flight reports none). `arc archive` has already moved each cohort document it reports to its
closeout placement — author its closeout content at the reported path, then save it with `arc save`:

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

- **Inline under `with-integration`:** Return to [`integrate-work-unit.md`][integrate-work-unit] Step 9 —
  the final integration push covers the candidate tail.
- **Standalone under `manual`:** Archival is the terminal step.

## Related workflows

- [`integrate-work-unit.md`][integrate-work-unit] — composition + cadence dispatch; this workflow handles
  archival mechanics only.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[integrate-work-unit]: integrate-work-unit.md
