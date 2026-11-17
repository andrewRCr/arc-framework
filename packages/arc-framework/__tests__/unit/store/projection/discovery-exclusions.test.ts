/** Discovery distinguishes editor/system side files and legacy views from ordinary managed prose. */
import { expect, it } from "vitest";
import { isExcludedProjectionFile, isExcludedProjectionPath, isMachineLocalProjectionPath } from "../../../../src/lib/store/projection/discovery-exclusions.js";

it.each(["note.md~", ".#note.md", "#note.md#", ".note.md.swp", ".note.md.swx", "4913",
  "note.md.tmp.123.Abc123", ".DS_Store", "._note.md", "Thumbs.db", "desktop.ini", ".directory"])(
  "excludes the side-file name %s wherever a work item could own it", name => {
    expect(isExcludedProjectionFile(`.arc/active/current/${name}`)).toBe(true);
    expect(isExcludedProjectionFile(`.arc/backlog/planned/alpha/research/${name}`)).toBe(true);
  },
);

it.each(["note.md", "not-a-swap.swp", ".note.swpp", "note.tmp.abc.def", "note.tmp.123.nothex",
  "notes-4913.md", "#note.md", "notes.md#"])("retains the ordinary file %s", name => {
  expect(isExcludedProjectionFile(`.arc/active/current/${name}`)).toBe(false);
});

it.each([".arc/backlog/ROADMAP.md", ".arc/user/andrew/STATUS.USER.md"])("excludes the legacy derived view %s", path => {
  expect(isExcludedProjectionFile(path)).toBe(true);
});

it.each([".arc/active/current/ROADMAP.md", ".arc/backlog/planned/alpha/ROADMAP.md",
  ".arc/user/andrew/scratch/STATUS.USER.md", ".arc/user/andrew/alpha/STATUS.USER.md"])(
  "retains an ordinary document sharing a derived view's basename at %s", path => {
    expect(isExcludedProjectionFile(path)).toBe(false);
  },
);

it.each([
  [".arc/system/.internal/worktree-marker.json", true],
  [".arc/system/.internal/pristine.json", true],
  [".arc/system/.internal/schemas/project.schema.json", true],
  [".arc/system/.internal/project-owned.md", false],
] as const)("classifies named machine-local state without excluding its neighbor: %s", (path, expected) => {
  expect(isMachineLocalProjectionPath(path)).toBe(expected);
  expect(isExcludedProjectionPath(path)).toBe(expected);
});
