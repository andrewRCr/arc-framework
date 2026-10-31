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
