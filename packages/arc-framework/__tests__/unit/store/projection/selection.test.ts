/** Selection depends on indexed editability and marks, without loading stored records. */
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { expect, it } from "vitest";
import { selectProjectedMarkdown, type SelectionEntry } from "../../../../src/lib/store/projection/selection.js";

const identity = SlugSchema.parse("andrew");
const editable: SelectionEntry = { kind: "record", protected: false, markers: null, changed: false, withheld: false };
it("selects editable Markdown across projected roots and excludes reserved personal folders", () => {
  const entries = Object.fromEntries([
    ".arc/active/current/meta-alpha.md", ".arc/active/in-flight/beta/meta-beta.md",
    ".arc/backlog/planned/alpha/scratch/note.md", ".arc/user/andrew/notes.md",
    ".arc/completed/2026-q4/meta-old.md", ".arc/user/andrew/.internal/check.md", ".arc/user/andrew/scratch/note.md",
    ".arc/active/current/diagram.svg", "README.md",
  ].map(path => [path, editable]));
  expect(selectProjectedMarkdown(entries, identity)).toEqual([
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
  expect(selectProjectedMarkdown(entries, identity)).toEqual([".arc/active/current/clean.md", ".arc/active/current/changed.md"]);
  expect(selectProjectedMarkdown(entries, identity, { changed: true })).toEqual([".arc/active/current/changed.md"]);
});
it("omits marker-bearing files even when changed, while accepting an editable entry without markers", () => {
  const markers = { length: 7, sets: [{ shows: "checkout" as const }] };
  expect(selectProjectedMarkdown({
    ".arc/active/current/marked.md": { ...editable, markers, changed: true },
    ".arc/active/current/noticed.md": { ...editable, changed: true },
  }, identity, { changed: true })).toEqual([".arc/active/current/noticed.md"]);
});
it("keeps a withheld ownership transition out of both selections", () => {
  const entries = {
    ".arc/active/current/held.md": { ...editable, withheld: true, changed: true },
    ".arc/active/current/ready.md": { ...editable, withheld: false, changed: true },
  };
  expect(selectProjectedMarkdown(entries, identity)).toEqual([".arc/active/current/ready.md"]);
  expect(selectProjectedMarkdown(entries, identity, { changed: true })).toEqual([".arc/active/current/ready.md"]);
});

it("selects only the current identity's personal files as the identity changes", () => {
  const entries: Record<string, SelectionEntry> = {
    ".arc/active/current/meta-alpha.md": editable,
    ".arc/user/alice/USER-INBOX.md": editable,
    ".arc/user/bob/USER-INBOX.md": { ...editable, changed: true },
    ".arc/user/bob-extra/USER-INBOX.md": editable,
  };
  expect(selectProjectedMarkdown(entries, SlugSchema.parse("bob"))).toEqual([
    ".arc/active/current/meta-alpha.md", ".arc/user/bob/USER-INBOX.md",
  ]);
  expect(selectProjectedMarkdown(entries, SlugSchema.parse("bob"), { changed: true })).toEqual([".arc/user/bob/USER-INBOX.md"]);
  expect(selectProjectedMarkdown(entries, SlugSchema.parse("alice"), { changed: true })).toEqual([]);
  expect(selectProjectedMarkdown(entries, SlugSchema.parse("alice"))).toEqual([
    ".arc/active/current/meta-alpha.md", ".arc/user/alice/USER-INBOX.md",
  ]);
});
