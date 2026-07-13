/** Unit tests for content relations between local and remote user-note trees. */

import { describe, expect, it } from "vitest";

import {
  classifyNoteSetRelation,
  resolveExcludedNotePairKeys,
  type NoteSetSnapshot,
  type NotesCompactionManifest,
  type NotesCompactionPair,
} from "../../src/lib/user-sync/index.js";

const oid = (seed: string): string => seed.padEnd(40, "0");
const pair = (commit: string, blob: string): NotesCompactionPair => ({
  blob: oid(blob),
  commit: oid(commit),
});
const snapshot = (entries: readonly NotesCompactionPair[]): NoteSetSnapshot => ({
  entries,
  manifest: null,
});
const manifest = (
  generation: number,
  pruned: NotesCompactionPair[],
): NotesCompactionManifest => ({
  version: 1,
  generation,
  preCompactionTip: null,
  pruned,
});

describe("classifyNoteSetRelation", () => {
  it("classifies all five content relations", () => {
    const shared = pair("a1", "11");
    const localOnly = pair("b2", "22");
    const remoteOnly = pair("c3", "33");
    const contestedLocal = pair("d4", "44");
    const contestedRemote = pair("d4", "55");

    expect([
      classifyNoteSetRelation(snapshot([shared]), snapshot([shared])),
      classifyNoteSetRelation(snapshot([shared, localOnly]), snapshot([shared])),
      classifyNoteSetRelation(snapshot([shared]), snapshot([shared, remoteOnly])),
      classifyNoteSetRelation(snapshot([shared, localOnly]), snapshot([shared, remoteOnly])),
      classifyNoteSetRelation(snapshot([contestedLocal]), snapshot([contestedRemote])),
    ]).toEqual([
      "equal",
      "remote-subset",
      "local-subset",
      "mixed-uncontested",
      "conflicting",
    ]);
  });

  it("classifies both-sides-unique entries without contested commits as mixed", () => {
    expect(classifyNoteSetRelation(
      snapshot([pair("a1", "11")]),
      snapshot([pair("b2", "22")]),
    )).toBe("mixed-uncontested");
  });

  it("excludes pairs pruned by whichever side has the newer manifest", () => {
    const shared = pair("a1", "11");
    const pruned = pair("b2", "22");
    const older = manifest(1, []);
    const newer = manifest(2, [pruned]);

    expect(classifyNoteSetRelation(
      { entries: [shared], manifest: newer },
      { entries: [shared, pruned], manifest: older },
    )).toBe("equal");
    expect(classifyNoteSetRelation(
      { entries: [shared, pruned], manifest: older },
      { entries: [shared], manifest: newer },
    )).toBe("equal");
    expect([...resolveExcludedNotePairKeys(older, newer)])
      .toEqual([`${pruned.blob}\0${pruned.commit}`]);
  });

  it("classifies empty-side boundaries as subsets or equality", () => {
    const entry = pair("a1", "11");

    expect(classifyNoteSetRelation(snapshot([entry]), snapshot([]))).toBe("remote-subset");
    expect(classifyNoteSetRelation(snapshot([]), snapshot([entry]))).toBe("local-subset");
    expect(classifyNoteSetRelation(snapshot([]), snapshot([]))).toBe("equal");
  });
});
