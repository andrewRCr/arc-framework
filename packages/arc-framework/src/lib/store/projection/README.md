# Projection

The projection is the gitignored working copy of the store at the familiar `.arc/` paths. This folder holds its
engine and the files it writes.

`paths.ts` names the checkout's machine-local folder, `.arc/system/.local/`, and the aside folder inside it.

`excludes.ts` builds the clone-local Git exclude list from the projected roots `lib/layout/projected-roots.ts` names:
each shared root and the machine-local folder, as directory patterns. The personal root stays ignored by `.gitignore`
alone and never enters the exclude file. The list is written through `ensureGitExcludePatterns` (`lib/git/exclude.ts`)
in one Git call and one write.

`ignore-guard.ts` proves every projected root and the aside folder ignored with one `git check-ignore -z -v
--non-matching --no-index --stdin` call, which judges the rules alone, so a root holding tracked files still reads as
ignored. A path re-included by a `!` pattern reads as not ignored, and the personal root passes only on a rule from a
regular `.gitignore` inside the repository, since `npm pack` reads only those. A relative excludes setting naming the
same path cannot authorize a symlink in its place. A refusal names each path and the line that would ignore it; a call
that fails otherwise refuses every root, typed apart, with the remedy of running the command again. A pass returns the
ignore files its verdict rests on — `info/exclude` in the common Git directory, every `.gitignore` on the path to each
guarded root, present or not, and every other file a match names as its source — so a caller can skip the call while
none of them changes. `predictableIgnoreFiles` names the first two kinds, which every pass rests on whatever the call
answers.

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
guarded roots, effective excludes path, ordered excludes values or ordered case-policy values differ. Its pass records
the actual roots independently of the index's projection identity. The command's configuration read supplies the
rules; a fresh guard pins the captured excludes path and effective case setting, then confirms all raw values before
returning its basis for the sweep to record beside the snapshots. A pass reads every source before the call — the
predictable ones and each file the last pass recorded, a `core.excludesFile` among them — and again after it, and
returns its records only where every read agrees, so an edit landing while Git reads never becomes the baseline a later
command skips the call against. Otherwise it reads again, knowing every file the call named, at most three times, and
then refuses every root with the remedy of running the command again. A refusal stands as the call read it.

`lock.ts` is the projection lock, one advisory lock per worktree at `arc-projection/lock`, its holder recording the
process ID, instance, and process scope under a renewable lease. It creates, renews, and releases only inside a state
folder that exists, so a worktree whose Git directory was removed reads as gone and is never recreated. A lost lease
ends only the guarded operation, at its next step, with the report the caller names. The operation awaits each
`session.step()`, which confirms ownership through the renewable lease before proceeding, even when a queued heartbeat
has not run. Failed confirmation stops the operation with a retry report. A wait that times out names the holder it
last saw. It is not reentrant.

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

`taken-in.ts` records what a persisted write-back took in — a write that landed, whether or not the store's merge filed
conflicts or an entry was refused beside it — with the stamp it read, and leaves the record as it was after any other
outcome. Each entry of the content taken in first takes the ID the landed record gave it, through the one entry-ID
matcher: an entry carrying no ID takes the ID of the one reference entry whose text, apart from its ID line, equals its
own, else of the one sharing its heading or complete field-header paragraph, and a reference entry two entries match the
same way goes to neither. Where the record read back is at the write's version and holds that content apart from the IDs
the store stamped, the version is the content taken in; otherwise the content is kept as a copy under
`arc-projection/taken-in/` until a later landing releases it. A save carrying the recorded stamp takes that content as
its base, and a file other than Markdown takes the closer of a kept copy and the version that write landed, recorded
alongside the copy so a later refresh cannot change the comparison's basis.

`stampless.ts` reads a file other than Markdown, which carries no stamp, against its entry: the entry's version is its
base, so a file restored to an older version is an edit, and an empty file is read only once its modification time is
50 ms old. While a replacement is in progress, the entry also names the version it replaces and the aside copy its batch
makes: content equal to that version reads as unedited, so it is refreshed and never written back over the newer
version, and content matching neither version merges from the closer of the two, read through `history`; where that
read refuses `state-unresolvable`, the file takes neither and stays pending, reported with the refusal. Every deleter
of an aside copy deletes through `deleteAsideCopy`, which clears the copy's record, and the in-progress record where it
names that copy and the file holds what the batch linked there, by the file identity the entry records.

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

`staging.ts` stages a record's file in the aside folder, created exclusively under the name `aside.ts` gives it: a
Markdown file stamped with its stored content's blob id, any other as stored, with the blob id of its bytes and the
version it lays. A protected file is staged read-only, and a link shares that mode.

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
moved aside and recorded as a copy holding what its swap moved — and the file is pending, marked refused or held by the
markers the take-in left. Where the path has moved on, or a save recreates it mid-move, the copy stays aside, reported
with its path.

`aside-moves.ts` makes a swap's two moves, the rename into the aside folder and the link onto the path, inside the
bounded retry, since a reader holding the file without sharing delete access refuses them for a moment on Windows. A
link refused because something is at the path reads as a save that recreated it. The swap, a copy's put-back, and the
second check take the operations and retry sleep a test injects, and the swap, the second check, and the sweep take the
read gate it injects for every copy they check.

`swap.ts` replaces a batch of files between two index writes. The first, with the reference after it, records each
file's new base, the staged file's stat — which the path shares once it is linked — pending, the record of the aside
copy its move makes, and, for a file other than Markdown, an in-progress record naming the version it replaces and that
copy. Then each file is renamed aside and its staged file hard-linked onto the path, both inside the bounded retry
(`aside-moves.ts`), and its copy checked once, an edit taken in and one refused or clashed put back as `aside-copies.ts`
states, nothing deleted; an absent file is rebuilt by the link alone, which makes no copy. A link refused because a save
recreated the path yields to it, the replaced version still recorded; a move still refused past the bound leaves the
file in place, its entry restored; and a link failing otherwise links the copy back, unless it is a symbolic link, which
leaves the path absent. The second write clears the pending mark of each file whose path still holds the staged file's
identity, and a rebuild's in-progress record, but keeps a mark a file carried into a read-back's batch. A stop between
the writes leaves a file pending that write-back reads no edit in. A file the guard staged nothing for is removed: moved
aside and its copy checked like any other, nothing linked, its entry kept its record's, recorded absent and pending.
The entry is dropped once the file is gone and no aside copy of its path remains, at the second write or the second
check, so a copy that goes back to the path is still taken in against that record; where the projection now lays
another record at the path, the entry stays, pending, as a deleted file's. The batch returns the copies it made that its
index still records, and the paths it removed from, for the second check. Hooks after the re-check, the move, and the
first check, and before a rebuild's link, place a save in each interval for tests.

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
