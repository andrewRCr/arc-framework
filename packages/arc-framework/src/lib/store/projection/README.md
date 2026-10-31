# Projection

The projection is the gitignored working copy of the store at the familiar `.arc/` paths. This folder holds its
engine and the files it writes.

`excludes.ts` builds the clone-local Git exclude list from the projected roots `lib/layout/projected-roots.ts` names:
each shared root and `.arc/system/.local/`, the folder for the projection's machine-local files, as directory
patterns. The personal root stays ignored by `.gitignore` alone and never enters the exclude file. The list is written
through `ensureGitExcludePatterns` (`lib/git/exclude.ts`) in one Git call and one write.
