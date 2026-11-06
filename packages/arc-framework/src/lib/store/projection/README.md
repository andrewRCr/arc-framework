# Projection

The projection is the gitignored working copy of the store at the familiar `.arc/` paths. This folder holds its
engine and the files it writes.

`engine.ts` starts and ends a command over its supplied store. A backend whose state stays in the checkout returns
before resolving engine dependencies. With state off branch, start takes the projection lease before launching the
configuration, state-version read, and shared-root walk together; personal discovery waits for the identity. It sweeps
before scanning edits, rereads recovered paths, and sends an ignore-refused root's edits without replacing its files.
Normal discovery covers active, backlog, and personal roots; save mode includes completed files. Walks use `lstat`,
skip machine-local folders, and return newly discovered files unsent.

`process-state.ts` gives stores created at different call sites the same command's skip verdict, lock state, history
memo, per-root capability and bindings, and copy bookkeeping. Each command starts with fresh bindings and history.
Rights default to granting an edit; adoption, refresh, fan-out, and materialization bindings live with each root.
`engine-end.ts` takes each ready root's lease again and reads its current index before the second check. After another
index read under that lease, it removes retained take-in copies no entry names. An unusable index preserves its files.

`paths.ts` names the checkout's machine-local folder, `.arc/system/.local/`, and the aside folder inside it.

`excludes.ts` builds the clone-local Git exclude list from the projected roots `lib/layout/projected-roots.ts` names:
each shared root and the machine-local folder, as directory patterns. The personal root stays ignored by `.gitignore`
alone and never enters the exclude file. The list is written through `ensureGitExcludePatterns` (`lib/git/exclude.ts`)
in one Git call and one write.

`ignore-guard.ts` proves every projected root and the aside folder ignored with `git check-ignore -z -v --non-matching
--no-index --stdin`. The first query uses the captured excludes selection for all roots; the second checks personal
roots with global excludes disabled and the same captured case policy. Each personal root must match a regular ancestor
worktree `.gitignore` in that second query; npm exclusion has its own policy proof. A relative excludes setting naming
that file cannot supply the worktree proof. `--no-index` judges the rules alone, so a root holding tracked files still
reads as ignored; a path re-included by a `!` pattern reads as not ignored. A refusal names each path and the line that
would ignore it; a call that fails otherwise refuses every root, typed apart, with the remedy of running the command
again. A pass returns the union of both queries' source files — `info/exclude` in the common Git directory, every
`.gitignore` on the path to each guarded root, present or not, the personal npm policy, and every file a match names —
so a caller can skip the guard while none changes. `predictableIgnoreFiles` names the predictable Git sources and npm
policy, which every pass rests on whatever the queries answer.

`index-schema.ts` is the strict schema of the index each projected worktree keeps about its copy. Per path it holds the
record reference the file was read with, its stat, the blob id last written there, its base, its marks, and the aside
copies made of it; beside the entries, the format version, the state version last projected, what the worktree was
projected under, and what the ignore guard last passed on. Stat fields are bigints stored as decimal strings, and a
field the schema does not know, or another format version, fails the parse rather than being dropped.

`location.ts` finds where a checkout keeps its projection state: `arc-projection/` in its own Git directory, beside the
index, the projection lock, and the kept copies. It reads the Git directory from the checkout's `.git` — a folder, or a
`gitdir:` marker naming one — and reads the checkout as the primary where that directory holds no `commondir`; only
where neither form reads does it run Git. It creates `arc-projection/` only inside a Git directory that exists, reading
a missing one as a worktree that is gone.

`change-detection.ts` tells an edited file from one the projection wrote, by Git's racy rule: a file is clean only when
its type, size, modification time, and file identity, read by `lstat` as bigints, match its entry and the modification
time is older than the reference stamp at the aside folder's top. Anything else is hashed against the blob id last
written there, and a missing reference makes every entry racy. A symbolic link, or anything else not a file, reads as
absent and is never followed or read. Each index write smudges every observed stat racy against the reference it
replaces: the cached size is zeroed, so the next check hashes it. This includes a freshly hashed clean stat, a linked
replacement's stat, and fresh ignore snapshots. Only a staged file awaiting installation after that write is exempt.
A recorded size of zero for nonempty content always hashes, so a save that empties the file is still found.

`ignore-snapshot.ts` records each readable source's own path type/stat and content hash, or its absence, and compares
it by the same rule, smudging included. A symlink keeps its own stat and hashes its target on comparison: changing a
regular `.gitignore` into a link invalidates the old pass, and a supported excludes-file link still detects target
edits. A dangling or looping link reads as absent. Git's guard decides which sources actually authorize each root.

`ignore-check.ts` runs the guard before a command's first write into a root when a source may have changed or the
guarded roots, effective excludes path, ordered excludes values or ordered case-policy values differ. Reuse also
requires `personalRules: "worktree-and-npm"`, recording both personal-state proofs. Its pass records the actual roots
independently of the index's projection identity. The command's configuration read supplies the rules; a fresh guard
pins the captured excludes path and effective case setting, then confirms all raw values before returning its basis for
the sweep to record beside the snapshots. A pass reads every source before both queries — the predictable ones and each
file the last pass recorded, a `core.excludesFile` among them — and again after both, and returns its records only where
every read agrees, so an edit landing while Git reads never becomes the baseline a later command skips the call against.
Otherwise it reads again, knowing every file the call named, at most three times, and then refuses every root with the
remedy of running the command again. A refusal stands as the call read it.

`lock.ts` is the projection lock, one advisory lock per worktree at `arc-projection/lock`, its holder recording the
process ID, instance, and process scope under a renewable lease. It creates, renews, and releases only inside a state
folder that exists, so a worktree whose Git directory was removed reads as gone and is never recreated. A lost lease
ends only the guarded operation, at its next step, with the report the caller names. The operation awaits each
`session.step()`, which confirms ownership through the renewable lease before proceeding, even when a queued heartbeat
has not run. Failed confirmation stops the operation with a retry report. A wait that times out names the holder it
last saw. It is not reentrant. The engine forwards its ownership checkpoint through store sends, staging, moves,
index publication, and cleanup, including retry attempts. A lost lease prevents subsequent mutations; the command's
unsent set stays outside the leased operation for reporting, without publishing unlocked pending marks.

`blob-id.ts` computes Git blob ids with `node:crypto`, `blob <length>\0` plus the bytes, in the repository's object
format, never by running Git per file. A file's stored blob id is taken over LF line endings with, for Markdown alone,
the base stamp and notice lines stripped, since the stored record carries neither.

`configuration.ts` supplies the configuration read at command start: `git config --null --get-regexp
'^(arc\.|user\.name$|extensions\.objectformat$|core\.(excludesfile|ignorecase)$)'`. Exit status 1 means no key is set. A
single-valued key takes its last occurrence, and every `arc.inflightPin` is kept. It returns the object format (SHA-1
where unset), the raw view keys, identity or its repair verdict, and an effective excludes path with every raw excludes
and case-policy value in order, or an invalid-setting result. An unset excludes key resolves to Git's default from the
invocation environment; a valueless occurrence is refused before cache reuse, even if a later occurrence has a value.
Home/default expansion and matched source paths retain their traversal components, so a symlink followed by `..` is
evaluated by the filesystem. Git interprets case-policy values: valueless means true and unset defaults to false; an
earlier invalid value still forces a fresh guard and refusal. The ignore check pins its captured effective setting, then
confirms the complete selection through the same reader. A changed selection refuses recoverably. Only fresh guards pay
for confirmation; an unchanged cached check adds no configuration read.

`base-recovery.ts` recovers the base of a file whose stamp was lost. Content equal to a stored version takes it — the
index's version first, by blob id, so a file still holding it reads no `history`, then each version newest first.
Otherwise the base is the candidate with the fewest lines changed in a line diff, among those the diff matches a
non-blank line with: the content the last persisted write-back took in, the index's version, and the five newest
versions, a tie going to that content and then the newer version. Content sharing no non-blank line with any candidate
takes an empty base. A stored version goes to the store as the expected version; a kept copy and the empty base merge in
the checkout. `history` is read through a memo the command holds, one whole answer per record until a landed write
drops it. Where `history` refuses `state-unresolvable`, recovery pulls nothing and chooses between the index's version
and the content taken in alone: a kept copy where it shares a non-blank line with the file, a version the write landed,
being the older base, and otherwise the index's version.

`guardProjectionIgnores` also requires a regular `.arc/user/.npmignore` containing only blank/comment lines and at
least one literal `*` line. Managed ignore setup creates it exclusively when absent, retains accepted contents and
refuses conflicts without overwriting them. The policy participates in the existing type/content snapshot bracket;
its removal or change invalidates the cache. An opaque proof identity invalidates older Git-only passes without
clearing the index's recovery entries. Protection covers Git ignore-aware capture and npm's normal project-root walk,
including root npm overrides and `main`/`bin` entries. Other packagers, separate package roots and edits after the last
check are outside that guarantee. Command start invokes no npm process and interprets no package manifest.

`taken-in.ts` records what a persisted write-back took in — a write that landed, whether or not the store's merge filed
conflicts or an entry was refused beside it — with the stamp it read, and leaves the record as it was after any other
outcome. Each entry of the content taken in first takes the ID the landed record gave it, through the one entry-ID
matcher: an entry carrying no ID takes the ID of the one reference entry whose text, apart from its ID line, equals its
own, else of the one sharing its heading or complete field-header paragraph, and a reference entry two entries match the
same way goes to neither. Where the record read back is at the write's version and holds that content apart from the IDs
the store stamped, the version is the content taken in; otherwise the content is kept as a copy under
`arc-projection/taken-in/` until a later landing releases it. A Markdown save carrying the recorded stamp takes that
content as its base. For a file without a stamp, the take-in records its carried base blob id and retains both the
landed version and any kept copy as candidates, independently of later refreshes.

`stampless.ts` reads a file other than Markdown, which carries no stamp, against its entry: the entry's version is its
base, so a file restored to an older version is an edit, and an empty file is read only once its modification time is
50 ms old. While a replacement is in progress, the entry also names the version it replaces and the aside copy its batch
makes. Content equal to what was written, or to the replaced version, is unedited unless the last persisted take-in
recorded that version's base blob id, which makes it the person's revert. An edit retains both replacement versions,
read through `history`; where that read refuses `state-unresolvable` or neither version is readable, the file stays
pending, reported with the refusal. Every deleter of an aside copy deletes through `deleteAsideCopy`, which clears the
copy's record, and the in-progress record where it names that copy and the file holds what the batch linked there, by the
file identity the entry records.

`base-selection.ts` resolves a Markdown save's stamp, falling back to recovery when it was lost or names no stored
version. `stampless-base.ts` compares a stampless save's carried base, the replaced version at its path, the last
take-in's landed version, and its kept copy. Stored candidates count once by record version, while a kept copy counts
separately by blob id. One candidate needs no content read; otherwise every candidate must give the same merge before
the edit is sent against its carried base. Comparison includes each clash's position and preserved sides, so identical
stored clashes agree while a clash from a kept copy remains distinct. Unreadable candidates stay pending; differing
merges become checkout holds.

`write-back.ts` prepares an edit without writing, then sends it as one content put with hand-edit provenance. It restores
missing entry IDs through the shared matcher and repairs later duplicates from the repeatable stream in
`write-back-ids.ts`. The take-in port records a landing and its read-back without swapping. `read-back.ts` owns the file
walk's guarded read-back batch, using the exact bytes read as its baseline and retaining any earlier pending mark.
The operation supplies `write-back` or `save`, each with `edit`; editable bytes supply neither provenance field.
Backend record-malformed refusals retain their rule ID with the condition and remedy.

`write-refusal.ts` handles a rejected merge base by reading the record and claiming one recovery allowance per logical
record for the command. Recovery consults fresh history while retaining the save's original stamp or carried blob;
stampless candidate agreement still applies. A removed record leaves a refused edit with a copy-out remedy. A second
version conflict or a held store lock leaves the edit pending with the backend's remedy. Other refusals preserve the
edit and their remedy without pulling history. A failed read-back after acceptance stays pending without another send.
An existing ambiguity hold retains its original token across refused attempts; backend diagnostics remain separate
from that durable hold, which a successful send clears.

`command-hooks.ts` registers the root Commander's entry after the development guard and its completion after the
development refresh registration, so Commander's reverse completion order settles copies before rebuilding. Root
`save` uses save provenance and includes completed roots. Every start outcome remains in process state for the action
to inspect. Native bindings check the backend capability before resolving a root; the in-repo backend returns without
projection I/O. `report.ts` flushes new diagnostics and resolutions to stderr before the action and after completion,
including corrective argv, unseen conflicts, pending saves, and retained aside copies with their original paths.

`status.ts` reads outstanding file marks, ownerless entries, unseen conflicts, and recorded aside copies without a
lease or index write. Its JSON view omits filesystem stats, and its summary retains repair guidance and copy paths.
Composite status runs this reader as an independent probe; an unreadable projection leaves the other sections
available. Disabled backends resolve no projection dependency.

`save.ts` reports the save start's refusal or its final store version using the backend retained by command entry. The
retained selection includes the checkout even when initialization is disabled or refused; the handler takes its Store
explicitly. An explicit resolution binds its exact subject and conflict through the index before the sweep, rechecks
them afterward, and sends only at that subject's path. Standing or malformed markers keep their repair route.
Whole-record resolution checks the submitted content while retaining the stored placement and links: keeping the stored
side or an admitted content edit discards the other alternative; actual verb-owned field changes require their owning
verbs. `bases-disagree` holds use their recorded token and the current stored base after controls are removed. Accepted
resolutions remain accepted when later rendering or read-back fails.

`check-edit.ts` runs the kind's production check over merged content, with current parsed fields or raw prior content
when parsing fails. It stamps only the entry merge's check copy and reports every broken rule with its remedy.
`after-view.ts` overlays that caller-parsed pending record on reads and family listings, retaining its prior envelope
or inheriting a new companion's owner placement. Other reads, saved-state queries, and all lookups remain the backend's.
Name-only queries resolve through the backend's canonical record or owner, so a reused name retains the generation the
backend selects.

`conflict-placement.ts` locates stored entry conflicts by their stable ID. Hunk placement relocates the base range
through the line diff, then checks the exact current side and neighboring lines or file edges. Historical content comes
from the command's memo; an unreadable base leaves the conflict unplaced. Side line counts distinguish a blank line from
an empty side, whose span is an insertion point.

`marker-render.ts` creates one renderer from the whole file and its preserved conflict sides. Every set uses its
chosen length, names its stored conflict or checkout origin, and carries a resolve-by-hand instruction when escalated.

`record-render.ts` composes checked placement with the whole file's marker rendering. It preserves existing sets by
their labels, draws remaining conflicts in token order against stable content coordinates, and emits notices for
unplaceable, overlapping, or whole-record conflicts. A stampless file records those conflicts only in its index.
`render-held.ts` reserves each set's lines and each empty side's insertion point, including its edges, and excludes
generated controls when selecting the final marker length.

`conflicted-refresh.ts` prepares a marked file's next view by merging its indexed stored base, the newer record, and
the file with its markers. Closed sets leave only when the file's bytes still equal what was written; open sets grow
before merging marker-like prose. An overlap or unreadable base returns a retryable pending remedy. A clean result
passes through the shared renderer, removing closed notices and drawing newly open conflicts together.

`marker-scan.ts` locates complete and malformed controls at exactly the indexed length. `marker-preparation.ts` reads
indexed conflict evidence, including retained history for conflicts already closed elsewhere; `marker-parse.ts`
substitutes untouched stored sides and attaches resolutions to the same content put. Edited standing sides and checkout
clashes hold the whole file. `marker-entries.ts` restores malformed entries from the selected base by section and
identity, retaining independent edits and new entries. A partial landing still answers refused, preserves the original
file and base, and records its sanitized take-in. Aside copies refuse whole before returning to their path.
`held-conflicts.ts` retains and reports open conflicts the held file cannot show, using the file's repair remedy.

`checkout-merge.ts` merges kept-copy and empty bases, and stale single-writer records, onto the current stored version.
Entry merges stamp their own repeatable copy and fall back to a clean line merge. The sent content is the merge's,
while the recorded take-in remains the file's input. Conflicts stay in the checkout, rendered by `mergeLineText` through
its optional line callback, which preserves the distinction between no lines and one blank line.

`checkout-differences.ts` draws every actual difference of a stampless hold, retaining common file lines and its final
newline. A final-newline-only difference draws the whole file. `checkout-drawing.ts` installs drawings through the
replace guard and swap; a `bases-disagree` refusal and its resolution token belong to that staged drawing alone until
it is installed, and then persist until the file is sent. Rendering metadata stays off the guard's input, so a save it
holds or restages inherits no proposed drawing marks. A guard-observed edit reaches candidate comparison even when
its later save equals the index again.

`read-gate.ts` gates every read of a projected file on its stats alone, so write-back never reads one mid-save. An empty
file younger than 50 ms waits for the next command, since an editor that truncates before writing leaves it empty
mid-save. An empty Markdown file older than that is a deleted file and no edit, since every projected one carries its
stamp, and so is anything at the path that is not a file: read by `lstat`, never followed, and reported with the remedy
of replacing it with a regular file. Any other file modified within the last 50 ms is read only once two stats 15 ms
apart agree on its size and modification time, up to three tries, else it waits for the next command. The clock, stat,
and sleep are injected, the system's unless a caller passes its own.

`stamp.ts` renders, parses, and strips a Markdown file's base stamp, `<!-- arc-base: <blob id> -->`, on its first line
or the line after its YAML frontmatter, and the notice lines directly after it, each one comment opening
`<!-- arc-notice:`. Only lines of that form in that block strip, so a person's own comment stays content, and a file
whose stamp is not where it belongs reads as stampless and whole.

`aside.ts` names the copies a swap moves aside and the staged files it links into place, under the aside folder's
`aside/`, in folders mirroring the file's path below `.arc/` with the file's own name as the last folder. Each name is
`<base blob id>.<pid>-<instance>-<scope digest>.<nonce>.<role>`: the version it replaced, its writer as the projection
lock records a holder, with the process scope digested since a scope holds characters a name cannot, a per-move nonce,
and `aside` or `staged`, so no name ends in `.md` and none grows with its path. A location parses back to what it
records, and a staged file is created exclusively.

`staging.ts` stages rendered content in the aside folder, created exclusively under the name `aside.ts` gives it. A
Markdown file carries its stored content's blob id as its stamp, while its `written` blob identifies the rendered bytes;
its base keeps the stored version. A file without a stamp carries the rendered content directly. A protected file is
staged read-only, and a link shares that mode. The record-to-stage operation returns store refusals before creating
staged bytes. Read-back and checkout drawings bind the same renderer for the guard's restage; a rendering failure keeps
the original file pending, retaining any write that already landed.

`take-in-port.ts` is the port reading and replacing hand every edit they meet to, and write-back answers once bound: the
worktree whose file holds the edit, the path or the aside copy, its entry, and its base — the stamp it carries, or, for
a stampless file, its entry's version or the base its copy's name carries. It answers `no-edit`, `taken-in`, `deferred`,
`pending`, `refused`, `unparseable`, or `clashed`, each with the entry as the take-in left it, since the index stays in
memory until the batch writes it. `taken-in` means the edit landed whole and carries what the take-in read, and
`refused` and `unparseable` carry the mark the file takes.

`replace-guard.ts` re-checks a file by the racy rule before it is replaced or removed, against its entry or, for a file
write-back just sent or drew a clash into, against what write-back read. A withheld file is left as it is, its entry
unchanged, before anything reads it, since nothing writes over or sends one. A file that matches is replaced, its stat
re-recorded where only the hash matched. A changed one goes to the take-in: one with no edit is replaced, its stat
recorded as its baseline; one taken in is re-checked against what the take-in read once the record's current version is
restaged, or at once for a removal, which stages nothing, for at most three passes; and any other answer leaves it in
place and pending, marked refused where its edit was. A refused read of the current version leaves it pending too,
retryable. Each replacement names the blob id its swap moves aside.

`aside-copies.ts` holds the rules every reader of an aside copy applies. A copy's path has moved on once it holds
anything but what the swap linked, or once a write-back of it has been sent since the swap, there or not, and
`recordWriteBackSent` marks every copy but the one being taken in before such a send. Settling a copy reads it by
`lstat` first: one not a file is deleted as no edit, never followed, as is one holding what its swap moved or what it
held when its own take-in landed, without reaching the port. One holding an edit goes to the take-in only while its path
has not moved on, and is deleted once its edit lands whole, kept where the take-in defers or leaves it pending; one
whose path has moved on is kept, reported with its path and never sent. A record whose copy is gone is dropped. A copy
whose edit is refused, unparseable, or clashed is never deleted while that stands. Where its path has not moved on it
goes back there — linked back to an absent path, or swapped back onto one holding what its swap linked, the replacement
moved aside and recorded as a copy holding what its swap moved — and the file is pending with its own marker and notice
mapping restored. A checkout clash remains undrawn until the file's own write-back. Where the path has moved on, or a
save recreates it mid-move, the copy stays aside, reported with its path.

Each aside record retains the marker length, origins, and notice references of the bytes it displaced. Its take-in
uses that snapshot while the live entry continues describing the current path. `returned-copies.ts` publishes a
returned file's restored mapping with its alias still recorded, then unlinks the alias and publishes finalization.
Interrupted links are recovered by proving the copy and path share both device and inode before restoring the mapping.
A path on another inode keeps its own mapping and leaves the copy available. Current open-conflict knowledge advances
independently of the displaced file's rendering snapshot.

`aside-moves.ts` makes a swap's two moves, the rename into the aside folder and the link onto the path, inside the
bounded retry, since a reader holding the file without sharing delete access refuses them for a moment on Windows. A
link refused because something is at the path reads as a save that recreated it. The swap, a copy's put-back, and the
second check take the operations and retry sleep a test injects, and the swap, the second check, and the sweep take the
read gate it injects for every copy they check.

`swap.ts` publishes planned replacements before moving files and settled entries afterward. The first write, with the
reference after it, records each file's new base, the staged file's stat — which the path shares once it is linked —
pending, the record of the aside copy its move makes, and, for a file other than Markdown, an in-progress record naming
the version it replaces and that copy. Then each file is renamed aside and its staged file hard-linked onto the path,
both inside the bounded retry (`aside-moves.ts`), and its copy checked once, an edit taken in and one refused or clashed
put back as `aside-copies.ts` states, nothing deleted; an absent file is rebuilt by the link alone, which makes no copy.
A link refused because a save recreated the path yields to it, the replaced version still recorded; a move still refused
past the bound leaves the file in place, its entry restored; and a link failing otherwise links the copy back, unless it
is a symbolic link, which leaves the path absent. The second write clears the pending mark of each file whose path still
holds the staged file's identity, and a rebuild's in-progress record, but keeps a mark a file carried into a read-back's
batch. A stop between the writes leaves a file pending that write-back reads no edit in. A file the guard staged nothing
for is removed: moved aside and its copy checked like any other, nothing linked, its entry kept its record's, recorded
absent and pending. The entry is dropped once the file is gone and no aside copy of its path remains, at the second
write or the second check, so a copy that goes back to the path is still taken in against that record; where the
projection now lays another record at the path, the entry stays, pending, as a deleted file's. The batch returns the
copies it made that its index still records, and the paths it removed from, for the second check. Hooks after the
re-check, the move, and the first check, and before a rebuild's link, place a save in each interval for tests.

`second-check.ts` checks each aside copy a command's batches made once more at the command's end, under the projection
lock again, since a save through a handle opened before the move can write after the first check. Each copy the index
still records is settled as `aside-copies.ts` states, a removed file's entry is dropped once the file and the last copy
of its path are gone, and the index is written. A copy kept there, and the replacement a swap back there moves aside,
wait for the next command's sweep.

`sweep.ts` sweeps the aside folder at every command's start, under the projection lock and before write-back reads a
file, after the ignore check. A refusal of the aside folder, as a failed call refuses every root, leaves it writing
nothing, and a refusal of a root leaves every copy under it untouched for the command; the index the sweep writes
records a pass, and no pass after a refusal. It takes over only the copies and staged files whose writer has exited,
judged as the projection lock judges a holder, and never one from another process scope, since a copy holds no lease:
those it reports with their paths. Each recorded copy is taken in its entry's record order. A record whose copy is gone
is dropped, and a symbolic-link copy is deleted as itself, never followed, its absent path left pending. A directory
copy stays with its contents, reported with a repair route, whether recorded, unrecorded, or found without an index. The
replace guard also leaves a directory at the projected path in place, pending with a repair route. One whose path is
absent and has not moved on is linked back, the file pending, and every other copy is settled as `aside-copies.ts`
states. A copy the index lists as withheld is left. One the index does not record, as a stop between a swap back's move
and its index write leaves, is deleted where it equals its base, its stamp set aside, and otherwise kept and reported.
Staged files are deleted and the reference stamp is left. With no usable index it takes nothing in: a regular-file copy
whose path is absent is linked back, a symbolic link or a file equal to its base is deleted, and every other stays,
returned for the rebuilt index to record as withheld. The sweep returns the replacements a swap back made, for the
command's second check.

`index-file.ts` writes the index whole by temp-and-rename into that folder, never creating it, so a write that stops
partway leaves the previous index and no write recreates a removed worktree's Git directory. A commit smudges the index,
writes it, and then rewrites the reference. Reading it returns the index, no projection where a checkout holding none
has no index, or why it cannot be used — missing, unreadable, or of another format version — and each caller applies its
own policy to that.
