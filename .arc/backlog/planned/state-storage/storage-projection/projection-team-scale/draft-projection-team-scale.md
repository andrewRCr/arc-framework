# Draft: projection-team-scale

- **Origin:** split from `projection-worktrees` on 2026-11-07. After a Windows scale assessment the Owner approved
  five scale changes to that work unit (A–E), then split them: `projection-worktrees` keeps A (the index split by root,
  the archive by quarter, plain JSON on the hot path), B (later catch-up after a pull) and E (shared protection reads),
  and this work unit takes C, D and the growth-relative scale criterion.
- **Purpose:** Keep a worktree's projected files and an ordinary command's cost bounded as the store grows to team
  scale, by narrowing the projected backlog and archive by size and laying the archive read-only, amended in place
  through a command.

---

## Scope

- **C — the view covers backlog and archive, narrowing by size,** with a notice and `all` one setting away. The `auto`
  setting keeps the backlog at `all` up to about 500 files; this repository holds 345.
- **D — a read-only archive, amended through a command** (provisionally `arc unlock`, with its rights and the removal
  check's changes), and `arc save` no longer scanning the archive. D's amendments to `spec-projection-write-back.md`
  § 8.4 come with it: in-place archive corrections, and their pickup at `arc save`.
- **The growth-relative scale criterion.**
- **ADR-035 item 6's refinement:** a dated amendment recording that C narrows "any artifact opens by name".

Not here, and kept by `projection-worktrees`: A, B and E; the plain benchmark for A's growth claim (Task 1.12.a, with
a structural test in Task 1.2 - `tasks-projection-worktrees.md`); and ADR-035 item 7's refinement for B. The
criterion's clause "a pull lays nothing in other worktrees until their next command" is B's behavior, which
`projection-worktrees` keeps under its amended success criterion 1; this work unit cites it rather than owning it.

## Sequencing and guards

Plan this work unit during `projection-worktrees`' build (about 2026-11-11 to 11-20). Build from that unit's landing; a
few days of build should land it in early December, before `cutover-flip`'s final full rehearsal (Stage 2) and the
cutover window. `cutover-flip` depends on it, so the rehearsal and the window wait for it to land.

Four guards, agreed with the Owner, keep the split from fragmenting the design or forcing rework:

1. `projection-worktrees`' specification designs A's partitions as the seams C and D build on (§ Seams this builds on).
2. The held C and D text moves over as written (§ Held design text), not re-derived.
3. `cutover-flip`'s specification writes its errata convention (H4) for `arc unlock` from the start.
4. Stage 2 runs with this work unit landed.

## Held design text — C and D

Copied from `projection-worktrees` as written on 2026-11-07, with only heading levels adjusted. Part 1 is the design
brief the Owner approved with A–E; Part 2 refined C and D before the split, and governs where the two differ.

### Part 1 — the brief

#### C. The view covers backlog and archive, narrowing by size

- New personal keys `arc.backlogView` and `arc.archiveView`: `auto` (default), `all`, `cohort`, `mine`; pins
  (`arc.inflightPin`) apply to every root. `arc.inflightView` keeps `mine` as its default.
- `auto` is `all` while the store holds at most a threshold of that root's files (backlog ~500, archive ~5,000 — from
  the model: Windows' walk room in the 60 ms budget, and a ~6–8 s spawn), and `cohort` above it; crossing it reports a
  notice once per worktree naming the key to set `all`.
- `cohort`/`mine` for backlog and archive: the person's own (owner or creator), their cohort's, unowned stubs in their
  cohort, and every work unit an in-view unit `Depends On` (so A's dependency B lands).
- The effective view per root is recorded in `projectedUnder`; a change reprojects as § 10.4 does now.

#### D. A read-only archive, amended through a command

- Archived records lay read-only (protected, reason `archive`, notice naming the command). `arc edit <path>` makes one
  archived file writable in this worktree: the index marks it unlocked; the next command takes the edit in, lands it,
  and lays the file read-only again.
- `arc save` walks only unlocked archive entries. The removal check and the persist and release steps still walk the
  whole archive (rare; teardown), so a forced edit (chmod + edit without `arc edit`) is never lost — it refuses the
  removal, naming `arc edit` and `arc save`.
- Rights: completed placement stops being plainly editable; the owner's edit needs the unlock. `amend-design` (which
  amends archived designs) runs `arc edit` first. (Check `arc editor`'s name for a clash.)

### Part 2 — refinements put to the Owner (2026-11-07, about 8:15 am CT)

> 1. **The automatic view (C), three sub-decisions:**
>    - _When the size is checked:_ not on every command, since counting means a store listing and three Git calls each
>      time. It's checked when a worktree is built, re-laid or reprojected, using the listing those already make, and
>      recorded in the index. **Lean: yes.**
>    - _Flip-flopping:_ a backlog hovering around the threshold would add and remove thousands of files across 20
>      worktrees each time it crossed. My lean is to narrow automatically when the size crosses the threshold, and only
>      ever widen again when you explicitly set it. Thresholds from the model: about 500 backlog files and about 5,000
>      archive files. **Lean: yes.**
>    - _Dependencies (new, not part of what you approved):_ the narrow views would also include every work unit that
>      something in your view depends on. If A depends on B, B's archive lands even under a narrow view. **Lean: yes.**
>
> 2. **The read-only archive (D):** the command is `arc unlock <path>`. `arc edit` sits too close to the existing
>    `arc editor <vscode|zed>`. Unlock is for a small correction made in place; anything substantial goes through
>    reopening the work unit, which is the existing lifecycle path. A file edited without unlocking it first (made
>    writable and changed anyway) is still never lost. The teardown check scans the archive, refuses the removal, and
>    names `arc unlock` and `arc save`. **Lean: yes.**

### Decision status

- **Approved with A–E (2026-11-07):** C's per-root view keys `arc.backlogView` and `arc.archiveView`, valued `auto`
  (default), `all`, `cohort` or `mine`, with pins applying to every root and `auto` narrowing by size with a notice;
  and D's archive laid read-only, amended in place through a command, `arc save` leaving the archive out of its walk,
  and the removal check still walking it.
- **Confirm at drafting — C's automatic-view mechanics:** the three sub-decisions in Part 2, proposed as written, each
  leaning yes.
- **Confirm at drafting — the command's name:** `arc unlock <path>`, superseding Part 1's `arc edit`, leaning yes.
- Both items to confirm are leaning-approved rather than open: the Owner agreed the leans after a report that listed
  them under "only if you keep C and D here", and the split then moved them here.
- **Re-derive the thresholds.** About 500 backlog and 5,000 archive files came from model v1. Model v2 changes the
  per-command constants slightly (§ Evidence); re-derive them if the design keeps numbers.

## D's amendments to `spec-projection-write-back.md` § 8.4

No specification text was drafted for these before the split. The substance is settled with the Owner's A–E approval.

- **The current text:** § 8.4 "Archived work" (lines 1041–1066 at `6b82b6f671`) lets the archived work unit's owner
  edit its `completed/` files in place from any checkout, a correction persisting "at `arc save`, at the persist or
  release step, or when a refresh touches the file", and moves the errata convention onto the store's history (§ 18).
- **What D changes there:**
    - archived files are laid read-only (protected, reason `archive`, the notice naming the command);
    - an in-place correction first makes one file writable in that worktree (`arc unlock <path>`, name to confirm);
      the next command or `arc save` takes the edit in and lays the file read-only again;
    - `arc save` walks only unlocked archive entries rather than all of `completed/`;
    - the removal check and the persist and release steps still walk the whole archive, so a file forced writable and
      edited without the command is never lost: the removal refuses, naming the command and `arc save`;
    - substantive changes go through reopening the work unit, not an in-place edit.
- **How the amendment lands:** `projection-write-back` is in execution, so this work unit's specification carries the
  § 8.4 change as a forward amendment, as `projection-worktrees` amends `spec-projection-substrate.md` (its § 16.2).
- **The flip's errata convention (H4)** edits projected archive files per § 8.4, so D's amendment and its `arc save`
  pickup reach H4 wherever it lands; `cutover-flip` writes H4 for `arc unlock` from the start (guard 3).
- **The unlocked set's read:** `arc save` reading only unlocked archive entries needs the unlocked set readable without
  loading every `completed/` quarter's partition. A header field beside `withheldCopies` fits A's seams without
  reshaping them.

## The growth-relative scale criterion

Two wordings, both verbatim. The design brief's, approved with A–E but not yet put to the Owner as a criterion:

> "An ordinary command's overhead does not grow with the archive or the team's activity: with 60,000 archived files
> and a pull of a day's changes waiting, the no-change overhead stays within its budget plus N ms, and a pull lays
> nothing in other worktrees." — a benchmark at synthetic scale in the store or integration suite.

The later wording, put to the Owner on 2026-11-07 as decision 4 of four:

> 4. **New success criterion for scale.** "An ordinary command's overhead does not grow with the archive or the team:
>    with 60,000 archived files, the no-change overhead stays within N ms of its value with an empty archive, and a
>    pull lays nothing in other worktrees until their next command." It's checked by a synthetic-scale benchmark. From
>    the model, N is a few ms on Linux and about 10 ms on Windows. **Lean: add it.**

Status: leaning-approved with the other leans; confirm at drafting. `projection-worktrees` keeps only a plain benchmark
for A's own claim, a no-change start with about 60,000 `completed/` entries against one with none, reported rather
than held as a criterion.

## ADR-035 item 6's refinement

No amendment text was drafted. What was put to the Owner on 2026-11-07:

> **ADR-035.** Its item 6 says any artifact opens by name and is searchable from your editor; C narrows that once a
> store is large. Item 7 says the writer refreshes your other worktrees, which B qualifies for pulls. The ADR
> methodology offers two routes:
>
> - **(a) A dated amendment appended to ADR-035** saying C refines item 6 and B refines item 7, leaving the decision
>   text untouched. ADR-035 already has four such "refines item N" amendments. **My lean:** the decision itself stands
>   (the store is the authority; the working copy sits at the familiar paths and opens in your own editor); C only
>   bounds what lands by default past a size, with `all` one setting away.
> - **(b) A new ADR that supersedes it,** if you read C as changing the decision itself.

The Owner agreed route (a), the Tier 2 lean. Item 7's refinement stays with `projection-worktrees`; item 6's lands here.
Follow ADR-035 § Amending This Document and its four "**Amendment (2026-09-29):** The contract design refines item N"
annotations, and load `strategy-adr-methodology.md` before writing it.

## Seams this builds on

A's partitions are designed as fixed seams in `spec-projection-worktrees.md`, as revised on that work unit's planning
branch (2026-11-07). Its section numbers are expected to hold; its wording may still move in that unit's review loop,
so re-read the committed text before relying on it here.

- **§ 3.1 "The index's parts":** the header and partitions. One root group per root and per `completed/` quarter, loose
  `completed/` files their own group; SHA-1 blob-id names; the header as the commit point; reads load only the
  partitions holding touched entries; lock-free readers; a racy reference per written partition; a plain-JSON codec;
  and separate header and partition schemas.
- **§ 3.1 "The partitions' seams":** the fixed-seams statement, quoted below.
- **§ 15.3 "The index read, and what is left on Windows":** a command reads its walked roots' partitions, and an
  archive quarter's only where it lays, removes or sweeps a file there, so the archive's size costs a command nothing.
- **§ 15.5, the fan-out paragraph:** a worktree a fan-out visits reads and writes its header and the partitions holding
  each path it lays or removes.
- **§ 16.2 "The index is a header and partitions":** the forward amendment to `spec-projection-substrate.md` § 3.1 and
  § 3.3.

§ 3.1, as drafted:

> **The partitions' seams.** The root groups — one per root, `completed/` one per quarter — and the header as the
> commit point are the index's fixed seams. A change to which of `backlog/`'s or `completed/`'s records a worktree
> projects, or to how archived files are laid and edited, changes the entries a partition holds and the behavior laid
> over them, never how entries are grouped, named, or committed.

## Evidence

The scale assessment lives on this machine at `~/dev/arc-evidence/projection-worktrees/`:

- `SCALE-SUMMARY.md` — the findings, model v2's Windows runner constants, and the Corrections section (2026-11-07)
  with the figures the thresholds should be re-derived from;
- `scale-model.py` (v2) and `scale-model.v1.py`, `scale-linux.json`, `scale-win32.json`, `bench/` and
  `protection-reads/`.

`notes-projection-worktrees.md` carries the same results under § Spike 3 and § Spike 4.
