# Projection

The projection is the gitignored working copy of the store at the familiar `.arc/` paths. This folder holds its
engine and the files it writes.

`paths.ts` names the checkout's machine-local folder, `.arc/system/.local/`, and the aside folder inside it.

`excludes.ts` builds the clone-local Git exclude list from the projected roots `lib/layout/projected-roots.ts` names:
each shared root and the machine-local folder, as directory patterns. The personal root stays ignored by `.gitignore`
alone and never enters the exclude file. The list is written through `ensureGitExcludePatterns` (`lib/git/exclude.ts`)
in one Git call and one write.

`ignore-guard.ts` proves every projected root and the aside folder ignored with one
`git check-ignore -z -v --non-matching --no-index --stdin` call, which judges the rules alone, so a root holding
tracked files still reads as ignored. A path re-included by a `!` pattern reads as not ignored, and the personal root
passes only on a rule from a `.gitignore` inside the repository, since `npm pack` reads only those. A refusal names
each path and the line that would ignore it; a call that fails otherwise refuses every root, typed apart, with the
remedy of running the command again. A pass returns the ignore files its verdict rests on — `info/exclude` in the
common Git directory, every `.gitignore` on the path to each guarded root, present or not, and every other file a match
names as its source — so a caller can skip the call while none of them changes.

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
absent and is never followed or read. Each index write smudges what it carries over while racy against the reference it
replaces, after Git's: the entry's cached size is zeroed, so the next check hashes it, and a recorded size of zero for
content that is not empty always hashes, so a save that empties the file is still found. What the write records afresh
is racy against the new reference instead, and a file that hashes clean has its stat recorded again.

`ignore-snapshot.ts` records the ignore files a guard pass rests on — each one's stat and blob id, or that it is absent
— and compares that record against each file as it is by the same rule, smudging included, so a command runs the guard
again only when one may have changed. An ignore file is read through a symbolic link, as Git reads it, and a link that
loops reads as absent.

`lock.ts` is the projection lock, one advisory lock per worktree at `arc-projection/lock`, its holder recording the
process ID, instance, and process scope under a renewable lease. It creates, renews, and releases only inside a state
folder that exists, so a worktree whose Git directory was removed reads as gone and is never recreated. A lost lease
ends only the guarded operation, at its next step, with the report the caller names; a wait that times out names the
holder it last saw. It is not reentrant.

`blob-id.ts` computes Git blob ids with `node:crypto`, `blob <length>\0` plus the bytes, in the repository's object
format, never by running Git per file. A file's stored blob id is taken over LF line endings with, for Markdown alone,
the base stamp and notice lines stripped, since the stored record carries neither.

`configuration.ts` is the one configuration read a command's start makes:
`git config --null --get-regexp '^(arc\.|user\.name$|extensions\.objectformat$)'`, exit status 1 read as no key set.
A single-valued key takes its last occurrence, as `git config --get` does, and each `arc.inflightPin` is kept. It returns
the object format, SHA-1 where unset; the in-flight view keys as set; and identity, resolved by the rule
`lib/git/identity.ts` owns, or the no-identity verdict naming the remedy that sets `arc.identity`.

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
own, else of the one sharing its heading, and a reference entry two entries match the same way goes to neither. Where
the record read back is at the write's version and holds that content apart from the IDs the store stamped, the version
is the content taken in; otherwise the content is kept as a copy under `arc-projection/taken-in/` until a later landing
releases it. A save carrying the recorded stamp takes that content as its base, and a file other than Markdown takes the
closer of a kept copy and the version the read-back laid.

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

`index-file.ts` writes the index whole by temp-and-rename into that folder, never creating it, so a write that stops
partway leaves the previous index and no write recreates a removed worktree's Git directory. A commit smudges the index,
writes it, and then rewrites the reference. Reading it returns the index, no projection where a checkout holding none
has no index, or why it cannot be used — missing, unreadable, or of another format version — and each caller applies its
own policy to that.
