# Spec (`detailed` · `RFC`): arc-view-refinements

- **Origin:** [internal]

- **Purpose:** Refine the shipped `arc view` command so forming artifacts remain readable, bare invocation follows
  the work-unit artifact lifecycle, prose renders carry useful lightweight metadata, task anchoring preserves
  context, and Glow faithfully displays provable loose-list spacing without weakening the command's read-only,
  oracle-resolved, render-once charter or its documented dependency direction.

---

## Introduction / Context

The shipped `arc view` command gives a human operator a zero-input terminal view of the current ARC work context.
Daily use and the resulting architecture review exposed eight related refinement points in that surface:

1. A task list already written during generation can still read as absent until the meta's `Task List` pointer is
   updated at the ceremony boundary.
2. Bare `arc view` assumes `tasks`, so it is unhelpful before a task list exists even when a meta, draft, or spec is
   available.
3. Non-task artifacts provide no content-size signal.
4. The rendered-at stamp is fixed to a 24-hour clock.
5. Line-addressable renderers open flush against the current task instead of preserving a top-margin line.
6. The first task in a phase opens without its phase heading and preamble.
7. Glow's Glamour renderer collapses blank lines between loose-list items even though the source preserves them.
8. The touched viewer modules invert the documented command-to-library dependency direction and bind production
   effects below command orchestration.

The first two issues share the artifact-group resolver. The next four refine the existing formatting and anchor
contracts. The seventh is a renderer-fidelity correction confined to Glow's transient input. The eighth corrects
the touched viewer slice without taking over the broader CLI substrate. Together they sharpen one command without
adding watch behavior, writes, arbitrary-path viewing, or renderer ownership.

## Goals

- Make a forming task list visible as soon as its conventional artifact file exists, without moving ceremony-bound
  meta writes earlier.
- Let a user explicitly select a planning or live WU by slug when no honest ambient WU context exists.
- Make bare `arc view` render the furthest artifact present in the WU lifecycle, with meta as the guaranteed base.
- Add deterministic line-count and configurable clock metadata without introducing repository-history coupling.
- Improve line-addressable task opening with a top margin and first-parent phase context.
- Preserve blank-separated sibling list spacing under Glow at boundaries the existing Markdown state machinery can
  prove, while leaving source, Bat, and plain rendering untouched.
- Restore the documented dependency direction in the touched viewer slice without taking ownership of the broader
  CLI substrate migration.
- Preserve the existing read-only, semantic-kind, resolver-backed, render-once architecture and non-TTY contract.

## Non-Goals

- Viewing completed WUs through explicit targeting. Archived WU artifacts and swept cohort closeout sidecars require
  a separate lifecycle-complete viewing contract.
- Accepting a path, scanning for the newest or dirtiest artifact, inferring a groom target from branch spelling, or
  reading another worktree directly.
- Implementing the future recorded groom-locus provider. `session-locus-model` owns that record and typed reader;
  this WU preserves only the viewer-side consumer seam.
- Adding last-modified metadata. If later required, it must use filesystem mtime, never repository history.
- Adding live watch, follow, re-rendering, input handling, a TUI, or a status/context card.
- Forking or replacing Glamour, adding a second Markdown parser, applying loose-list spacing globally through a
  theme, or postprocessing ANSI output.
- Adding source-line top-margin or phase-heading anchoring to Glow, whose pager anchor remains pattern-based.
- Performing repository-wide `lib` remediation or replacing the cohort-owned layout, command-input, Git-executor,
  validation, or tail-migration substrates.

## Proposed Design

### 1. Resolve an explicit WU context with `--for <slug>`

Add an optional `--for <slug>` target to `arc view`. Its semantic reading is “view this WU's artifact group instead
of the ambient WU context.” It changes only the WU target:

- `arc view --for foo` renders the furthest present artifact for `foo`.
- `arc view spec --for foo` renders exactly `foo`'s spec.
- `arc view --current --for foo` renders `foo`'s current task region.

`--for` is preferred over `--target`, which is path-oriented elsewhere in the CLI, and over the more repetitive
`--work-unit`. Command help must describe the operand as a WU slug and the option as an ambient-context override.

Target precedence is:

1. explicit `--for` slug;
2. active WU resolved for the current worktree;
3. recorded groom locus, once `session-locus-model` exposes it through the shared typed resolver.

This WU implements the first two arms. The third is a forward-compatible consumer seam, not a dependency. The
viewer must never read a raw locus record or parse `arc locus` output.

Explicit targets are limited to the planning/live lifecycle locations `backlog/provisional`, `backlog/planned`,
and `active`. Resolve the slug through checkout-local lifecycle authority only, then locate its semantic artifact
group in the current checkout. Do not consult the network oracle or read another registered worktree to classify an
explicit target. Model the outcome as a typed target result rather than reducing every failure to “no active WU”:

- an eligible, materialized target resolves its canonical slug, lifecycle location, meta path, and artifact group;
- a locally resolved completed slug returns an unsupported-lifecycle error that identifies completed viewing as
  unsupported;
- every other miss — unknown, malformed or unreadable, remote-only, sibling-worktree-only, or otherwise not
  materialized here — returns one fail-closed target-unavailable error.

An explicit-target failure must never fall back to the ambient WU. Slugs remain subject to the canonical slug
validation before entering any resolver. No option accepts paths, and no resolver directly follows a target into a
sibling worktree. The command deliberately does not broaden authority merely to distinguish kinds of miss.

Reject `--for` when the requested surface is identity-global: `working-memory`, `inbox`, or `inbox --project`.
It remains valid for every WU-scoped kind, including identity-dependent `session-notes`. A resolved WU with no
artifact for an explicit kind uses the existing successful “not present” result.

Keep target selection in the artifact resolver layer. CLI routing parses `--for`; command orchestration passes the
semantic slug; an injected lib-level resolver composes neutral lifecycle, active-context, cohort, session-notes,
and user-surface authorities. The viewer does not construct storage paths or scan `.arc/active/`.

### 2. Resolve the artifact group by convention and existence

For `tasks`, prefer the meta's `Task List` pointer when it is present and resolves to an existing file. Otherwise,
fall back to the conventional `tasks-<slug>.md` sibling of the resolved meta. Existence of that conventional file is
sufficient even while the meta pointer is `[none]`. This closes the task-generation window without changing meta
write timing and preserves an intentionally non-conventional pointer whenever it remains valid.

The same resolved artifact group continues to map semantic kinds to paths. `meta` is the group's canonical meta
path; `draft`, `spec`, `notes`, and the conventional task fallback are adjacent companions. `cohort` and
`session-notes` continue through their semantic resolvers. A missing companion remains absence, not an error.

The resolver must expose kind-to-path candidates and use the injected existence predicate. It must not discover
companions by directory enumeration. This keeps the storage seam replaceable when artifact materialization moves
away from the tracked project tree.

### 3. Make bare view lifecycle-aware

Define the default artifact chain as:

```text
meta → draft → spec → tasks
```

Bare `arc view` checks the chain in reverse (`tasks → spec → draft → meta`) and renders the first existing member.
The meta is the guaranteed base of every successfully resolved artifact group, so bare view has no synthetic
“nothing present” message once a WU target resolves.

Explicit `arc view <kind>` remains exact-kind selection and retains the existing absence output. Omitted-kind
`--current` is deliberately task-specific: it forces `tasks`, bypasses furthest-present selection, and preserves
the existing missing, malformed, and no-open-task behavior. The only default behavior change is bare view without
`--current`.

### 4. Add line count and a user-scoped clock format

Add a line count to the existing one-line header for every non-`tasks` artifact. Count logical source lines before
header insertion:

- empty content is `0 lines`;
- a terminal newline closes the final line and does not create a phantom line;
- CRLF is one separator;
- exactly one logical line renders as `1 line`; every other count renders as `<N> lines`.

Place the count before the rendered-at stamp in the existing header. Task documents keep their task-specific band
and receive no line count.

Add the user-scoped git-config key `arc.viewClock` with values `24h` and `12h`; default to `24h`. Resolve it through
the same user-override machinery and warning posture as `arc.viewRenderer`. Apply the selection to both the task
band and non-task headers:

- `24h` remains zero-padded `09:05`;
- `12h` is locale-independent and hour-unpadded: `9:05 AM` / `9:05 PM`;
- midnight is `12:xx AM`, and noon is `12:xx PM`.

The setting remains personal taste, not project convention. It shares the renderer key's migration seam to
`config-storage-architecture`; this WU adds no `arc-config.yml` axis.

### 5. Preserve top margin for line-addressable anchors

For Bat and plain pager paths, anchor to the guaranteed blank source line immediately above the current target
instead of the target line itself. Account for the prepended task band when translating the source anchor into the
prepared document, and clamp the resulting pager line to the document's first line.

Glow remains unchanged: its renderer does not preserve source line numbers and anchors by searching for the task
identifier. The top-margin refinement is a graceful no-op on that path.

### 6. Anchor the first parent task to its phase

When `cursor.section` is the first parent-task section in its phase, use the phase heading as the line-addressable
anchor target, then apply the same preceding-line margin. This predicate keys on the parent section, not
`cursor.leaf`; it remains true while work advances through later subtasks inside that first parent. Every later
parent task continues to anchor to its own preceding blank line.

Expose the phase-heading line through the task-list analysis result rather than reparsing Markdown in the view
formatter. The parser already tracks the section/leaf distinction and phase boundaries. As with the top-margin
change, phase anchoring affects Bat and plain only; Glow retains its task-id pattern anchor. A valid task list with
no explicit phase headings retains the parser's existing implicit single phase and uses the normal preceding-task
anchor because no phase-heading line exists.

### 7. Restore provable loose-list gaps for Glow

Goldmark preserves CommonMark list tightness, but Glamour does not consult it. Glamour flattens direct paragraphs
inside list items, applies one list style without a tight/loose selector, and emits the same item newline for both
forms. A style file therefore cannot restore spacing only for loose lists.

Add a conservative transient adapter to Glow preparation. Run it after soft-break normalization, which preserves
blank lines, and before terminal-width wrapping. At a boundary the state machine can prove is a blank-separated
sibling list item, insert an HTML comment with the same blockquote prefix and list-container indentation. Glamour
sanitizes the comment, while the resulting adjacent list blocks retain one blank display row.

The proof must establish the enclosing blockquote, list depth, sibling container, and compatible list form while
respecting fenced blocks and multi-block items. Reuse the existing fence, blockquote, and list-prefix awareness in
`view-renderer.ts`; do not introduce a second Markdown parser. If the boundary is ambiguous, leave it compact under
Glow. A false negative is acceptable; a semantic rewrite is not.

For ordered lists, compute and materialize the ordinal in the transient copy before splitting. This preserves
displayed `1, 2, ...` numbering when source authors use lazy repeated markers such as `1.`, `1.`. Task markers and
nested list content must remain byte-for-byte unchanged apart from the transient comment and any required transient
ordered marker.

The adapter affects only input sent to Glow's interactive renderer. The source file, non-TTY plain output, Bat
input, and plain pager input remain unchanged. Pin the causal behavior with an available-binary Glow probe in tests;
if a supported Glow/Glamour version invalidates the assumption, disable the adapter rather than adding ANSI
postprocessing or broadening uncertain transformations. No per-invocation version probe is added.

### 8. Restore viewer-local dependency direction

The existing viewer inverts the documented `cli → commands → lib` direction: `view-artifact.ts` imports command
modules and binds filesystem and Git production behavior, `view-renderer.ts` binds executable probing and process
spawning, and semantic formatting lives under `commands`. Because this WU expands those same modules, correct the
touched slice rather than deepening the inversion.

Define neutral viewer contracts in `lib`. Keep artifact selection, formatting, clock handling, task-anchor
calculation, Glow transformation, and pager-process planning pure or dependency-injected there. No viewer `lib`
module may import `commands`, prompt code, or command-owned active-session envelopes. A neutral target-resolution
result separates viewer semantics from the active command's transport shape.

Command modules own production composition: filesystem reads and access checks, conversion from active context,
checkout-local lifecycle lookup, git-config execution, executable probing, and process spawning. Existing public
command exports remain compatibility re-exports so downstream imports do not break while implementation ownership
moves. Add a viewer-scoped import-boundary test that rejects upward `lib → commands` imports and direct production
effect bindings in the corrected modules.

This correction does not create the cohort's general substrate. Keep current path derivation narrow and behind an
injected viewer port; do not introduce project-wide layout tokens or a layout service. Preserve the current
`GitExec` seam for later production-adapter migration. Validate `--for` with the kernel-owned slug contract and only
the domain checks this command immediately requires; do not build the future command-input framework here.

## Alternatives & Rationale

- **Write the task pointer earlier.** Rejected because meta updates are ceremony-bound. Existence-based viewing is
  the correct read-side fix and does not perturb write timing.
- **Scan `.arc/active/` or infer the target from branch/dirty files.** Rejected because it bakes in the current
  tracked-tree layout and cannot identify a partial-protection grooming target honestly.
- **Accept completed WUs through `--for` now.** Rejected because completed cohort documents may live in separate
  archive sidecars. Lifecycle-complete viewing is a distinct follow-up contract.
- **Use `--target` or a path operand.** Rejected because `target` already connotes paths in the CLI and arbitrary
  paths violate the semantic-kind boundary. `--for <slug>` reads as a concise WU-context override.
- **Derive last-modified from Git history.** Rejected because history belongs to the backing store once `.arc/`
  becomes materialized and gitignored in the code repository. Filesystem mtime remains a possible future, lossy
  signal; line count is sufficient here.
- **Make clock format project-scoped.** Rejected because clock presentation is user preference, matching renderer
  selection rather than project methodology.
- **Use a custom Glamour style.** Rejected because the style schema has no tight/loose or per-item vertical-spacing
  selector; a global margin would over-space tight lists and override user theme choices.
- **Fork Glamour or add a full Markdown parser.** Rejected as disproportionate. The correct renderer-level change
  belongs upstream; the local state machine needs only conservative boundary recognition.
- **Postprocess rendered ANSI.** Rejected because it would require capturing pager input and surviving wrapping,
  style sequences, and sentinel movement across lines.
- **Accept compact loose lists.** Lower risk, but rejected because the flattening materially harms readability and
  the HTML-comment mechanism restores fidelity without changing stored content or non-Glow paths.
- **Grandfather the viewer's existing layer inversion.** Rejected because expanding the inverted modules would
  compound known architectural drift and make the later repository-wide remediation harder.
- **Wait for the whole CLI substrate cohort.** Rejected because only the shared schema kernel is prerequisite. The
  later layout, input, Git-executor, and tail-migration members compose through the explicit boundaries above.

## Cross-cutting Considerations

### Security and trust boundaries

`--for` accepts only a validated WU slug and resolves it through checkout-local semantic authorities. It never
accepts or derives a filesystem path from unsanitized input and never directly reads a sibling worktree.
Explicit-target errors do not fall through to another WU, preventing surprising cross-context reads.

This preserves the shipped viewer's trusted-repository filesystem model rather than adding a new containment
subsystem: repository-managed artifact symlinks follow normal filesystem behavior and may resolve outside the
checkout. The guarantee is against user-supplied paths and resolver-directed cross-worktree lookup, not `realpath`
containment of trusted repository entries.

The Glow adapter operates on already-read Markdown in memory and introduces a fixed internal comment token. It does
not execute HTML or preserve the token in repository content.

### Performance

The command remains read-once and render-once. Bare selection adds a bounded four-candidate existence pass. Explicit
targeting performs one checkout-local lifecycle lookup and artifact-group resolution, with no network or
cross-worktree roster read. The Markdown adapter is a linear pass over Glow input. No cache, watcher, background
process, or extra renderer invocation is introduced.

### Testing

Extend unit and integration coverage across these contracts:

- explicit active, planned, and provisional targets; the shared unavailable outcome for unknown, malformed,
  unreadable, remote-only, sibling-only, and unmaterialized misses; locally resolved completed, invalid-slug, and
  no-fallback failures; rejection with each identity-global form; no network or sibling-worktree reads;
- task-pointer precedence, missing-pointer and stale-pointer conventional fallback, and absence when neither path
  exists;
- bare selection at every lifecycle stage, meta-only base behavior, exact explicit-kind absence, and omitted-kind
  `--current` task forcing;
- line counts for empty, one-line, terminal-newline, no-terminal-newline, multiline, and CRLF content;
- exact 24-hour, AM, PM, midnight, and noon stamps plus invalid-config fallback/warning behavior;
- normal task top margin, phase-heading anchoring for the first parent while later subtasks are current, later-parent
  anchoring, implicit-phase normal-task fallback, start-of-file clamping, and unchanged Glow pattern anchors;
- Glow transient input for tight and loose top-level unordered lists, nested lists, ordered lists with repeated
  markers, task lists, blockquotes, multi-block items, fenced content, ambiguous false negatives, and no source or
  non-Glow mutation;
- a real Glow behavior probe when the binary is available, skipped rather than failed when it is absent;
- viewer dependency-direction coverage that rejects command imports and directly bound production effects from the
  corrected `lib` modules, plus tests that production effects remain adapter-injected and compatibility exports
  resolve.

Retain the existing malformed-task, no-open-task, non-TTY, renderer detection, and pager-composition tests as
regression coverage.

### Migration and rollout

The change is backward-compatible for explicit kinds and `--current`. Bare `arc view` intentionally changes from
task-only selection to furthest-present selection, but still resolves to tasks whenever tasks exist. The new clock
key defaults to the existing 24-hour form, so no configuration migration is required.

The explicit groom target works immediately through `--for`. When `session-locus-model` lands, the viewer may add
its typed groom-subject reader as the third target-precedence arm without changing CLI syntax or artifact selection.

Implementation begins after `cli-schema-kernel` lands and its updated base is merged into this branch. Do not
rebase or otherwise rewrite this branch. The later CLI substrate members are not rollout prerequisites; activation
overlap prevents concurrent edits to the same viewer files, and whichever change lands second consumes the first
through an append-only merge.

### Architectural alignment

After the viewer-local correction, the command follows the `lib` branch of TECHNICAL-OVERVIEW §2's
`cli → commands → prompts + lib` flow: Commander owns syntax, command orchestration owns production read/render
effects, and injected `lib` resolvers, formatters, transformations, and process plans own semantic logic. No new
package dependency or infrastructure component is introduced.

The design advances the PROJECT-PRD principles _Operational friction down, judgment friction up_ by removing
repeated artifact-location friction, and _Designed to evolve_ by keeping target, storage, and future groom-locus
knowledge behind typed semantic resolvers.

### CLI substrate coordination and sequencing

`cli-schema-kernel` is the sole hard dependency. Record it in the meta at spec finalization. Once it lands, merge
the updated base into this branch without rebasing, then consume its `Slug` / `SlugSchema` contract for `--for`.

The remaining coordination is soft:

| Work unit                          | Ownership boundary for this WU                                                                   |
|------------------------------------|--------------------------------------------------------------------------------------------------|
| `cli-layout-resolver`              | May replace the narrow viewer path port; this WU creates no competing layout vocabulary/service. |
| `cli-command-inputs`               | Later inventories `--for`; this WU performs only immediate slug and domain validation.           |
| `cli-git-executor`                 | Later migrates the preserved `GitExec` adapter without changing the viewer-facing contract.      |
| `cli-substrate-complete-migration` | Reconciles residual adoption during its tail sweep.                                              |

At activation, same-file overlap serializes implementation. If a cohort member lands first, this WU consumes it
through the append-only base merge; if this WU lands first, the cohort member adapts to the viewer boundary it
finds. `lib-layer-type-extraction` excludes the corrected viewer from its broader inversion inventory rather than
duplicating the work.

## Success Criteria

- A conventional task file written beside a resolved meta renders before the meta's `Task List` pointer is updated;
  a valid existing non-conventional pointer still wins.
- `arc view --for <slug>` resolves active, planned, and provisional WUs through checkout-local authority, accepts no
  path, performs no network or direct sibling-worktree read, never falls back on failure, returns one unavailable
  outcome for every unresolved miss, and returns the completed-specific error only for a locally resolved completed
  record.
- Bare `arc view` renders `tasks`, else `spec`, else `draft`, else `meta`; explicit kinds retain exact selection and
  omitted-kind `--current` remains task-specific.
- Every non-task header carries the exact logical line count, while task documents retain their existing counter
  band without a line count.
- `arc.viewClock=24h` and `12h` produce the specified locale-independent timestamps, with the current 24-hour output
  remaining the default.
- Bat and plain open with one source line above the normal current-task target; when the current parent is the first
  in its explicit phase, they open one line above the phase heading even if a later subtask is current; a task list
  with only an implicit phase retains the normal preceding-task anchor.
- Glow's anchor behavior remains pattern-based and unchanged by the line-addressable anchor refinements.
- Glow displays one blank row at every supported blank-separated sibling list boundary, preserves computed ordered
  numbering, leaves ambiguous boundaries compact, and does not change stored source or Bat/plain output.
- Non-TTY invocation remains plain, pager-free, ANSI-free, and render-once; the command introduces no writes, watch
  loop, input handling, or arbitrary-path surface.
- Corrected viewer `lib` modules have no upward command imports or directly bound production effects; command
  adapters own filesystem, lifecycle, Git-config, executable-probe, and process-spawn effects.
- Existing public viewer imports remain valid through compatibility exports, and the correction introduces no
  competing layout service, command-input framework, Git executor, or general substrate.
- All new behavior is covered through injected unit seams and command-level integration tests, with the optional
  real-Glow probe confirming the renderer assumption where the binary exists.

## Open Questions

None. Completed-WU viewing, ambient groom-locus provision, last-modified metadata, and any upstream Glamour change
are bounded follow-ups rather than unresolved decisions in this design.
