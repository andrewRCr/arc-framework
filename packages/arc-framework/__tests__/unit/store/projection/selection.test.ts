/** Selection depends on indexed editability and marks, without loading stored records. */
import { expect, it } from "vitest";
import { selectProjectedMarkdown, type SelectionEntry } from "../../../../src/lib/store/projection/selection.js";

const editable: SelectionEntry = { kind: "record", protected: false, markers: null, changed: false, withheld: false };
it("selects editable Markdown across projected roots and excludes reserved personal folders", () => {
  const entries = Object.fromEntries([
    ".arc/active/current/meta-alpha.md", ".arc/active/in-flight/beta/meta-beta.md",
    ".arc/backlog/planned/alpha/scratch/note.md", ".arc/user/andrew/notes.md",
    ".arc/completed/2026-q4/meta-old.md", ".arc/user/andrew/.internal/check.md", ".arc/user/andrew/scratch/note.md",
    ".arc/active/current/diagram.svg", "README.md",
  ].map(path => [path, editable]));
  expect(selectProjectedMarkdown(entries)).toEqual([
    ".arc/active/current/meta-alpha.md", ".arc/active/in-flight/beta/meta-beta.md",
    ".arc/backlog/planned/alpha/scratch/note.md", ".arc/user/andrew/notes.md",
  ]);
});
it("keeps unmarked files normally and selects only marked editable files when requested", () => {
  const entries: Record<string, SelectionEntry> = {
    ".arc/active/current/clean.md": editable,
    ".arc/active/current/changed.md": { ...editable, changed: true },
    ".arc/active/current/protected.md": { ...editable, changed: true, protected: true },
    ".arc/active/current/ownerless.md": { kind: "ownerless" },
  };
  expect(selectProjectedMarkdown(entries)).toEqual([".arc/active/current/clean.md", ".arc/active/current/changed.md"]);
  expect(selectProjectedMarkdown(entries, { changed: true })).toEqual([".arc/active/current/changed.md"]);
});
it("omits marker-bearing files even when changed, while accepting an editable entry without markers", () => {
  const markers = { length: 7, sets: [{ shows: "checkout" as const }] };
  expect(selectProjectedMarkdown({
    ".arc/active/current/marked.md": { ...editable, markers, changed: true },
    ".arc/active/current/noticed.md": { ...editable, changed: true },
  }, { changed: true })).toEqual([".arc/active/current/noticed.md"]);
});
it("keeps a withheld ownership transition out of both selections", () => {
  const entries = {
    ".arc/active/current/held.md": { ...editable, withheld: true, changed: true },
    ".arc/active/current/ready.md": { ...editable, withheld: false, changed: true },
  };
  expect(selectProjectedMarkdown(entries)).toEqual([".arc/active/current/ready.md"]);
  expect(selectProjectedMarkdown(entries, { changed: true })).toEqual([".arc/active/current/ready.md"]);
});
