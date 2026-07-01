/**
 * Unit tests for `readRecentUserNotes` — the ref-wide N-most-recent-note read
 * that backs the cross-WU merge. Distinct from the first-hit ancestor walk: it
 * returns an ordered sequence (most-recent first), bounded by the window.
 */

import { describe, it, expect } from "vitest";

import { listAnnotatedNoteCommits, readRecentUserNotes } from "../../src/lib/user-sync/index.js";
import type { GitExec } from "../../src/lib/git/index.js";

/** A 40-char hex commit from a short hex seed. */
const annotated = (seed: string): string => seed.padEnd(40, "0");
/** Fan-out note path for an annotated commit (`ab/cdef…`). */
const notePathFor = (commit: string): string => `${commit.slice(0, 2)}/${commit.slice(2)}`;

interface NotesConfig {
  /** Note-history commits, most-recent first. */
  history?: string[];
  /** History commit → note paths changed in it. */
  pathsByHistory?: Record<string, string[]>;
  /** `"<historyCommit>:<path>"` → note blob content. */
  contentByShow?: Record<string, string>;
  notesListOutput?: string;
  logThrows?: boolean;
  notesListThrows?: boolean;
}

function makeExec(cfg: NotesConfig = {}): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const history = cfg.history ?? [];
  const paths = cfg.pathsByHistory ?? {};
  const content = cfg.contentByShow ?? {};

  const exec: GitExec = async (_cmd: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "log") {
      if (cfg.logThrows) throw new Error("no such ref");
      const idx = args.indexOf("--max-count");
      const max = idx >= 0 ? Number(args[idx + 1]) : history.length;
      return { stdout: history.slice(0, max).join("\n"), stderr: "" };
    }
    if (args[0] === "diff-tree") {
      const historyCommit = args[args.length - 1] ?? "";
      return { stdout: (paths[historyCommit] ?? []).join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const key = args[1] ?? "";
      const value = content[key];
      if (value === undefined) throw new Error(`missing note content: ${key}`);
      return { stdout: value, stderr: "" };
    }
    if (args[0] === "notes" && args[2] === "list") {
      if (cfg.notesListThrows) throw new Error("no such ref");
      return { stdout: cfg.notesListOutput ?? "", stderr: "" };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  return { exec, calls };
}

/** Build a config where each history commit has exactly one note carrying `marker` content. */
function oneNotePerHistory(entries: { history: string; marker: string }[]): NotesConfig {
  const pathsByHistory: Record<string, string[]> = {};
  const contentByShow: Record<string, string> = {};
  for (const { history, marker } of entries) {
    const path = notePathFor(annotated(history));
    pathsByHistory[history] = [path];
    contentByShow[`${history}:${path}`] = marker;
  }
  return { history: entries.map((e) => e.history), pathsByHistory, contentByShow };
}

describe("readRecentUserNotes", () => {
  it("respects the N bound when more notes exist", async () => {
    const cfg = oneNotePerHistory(
      ["a1", "b2", "c3", "d4", "e5"].map((h) => ({ history: h, marker: `note-${h}` })),
    );
    const { exec, calls } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 3);

    expect(notes).toHaveLength(3);
    const log = calls.find((args) => args[0] === "log");
    expect(log?.[log.indexOf("--max-count") + 1]).toBe("3");
  });

  it("reads what exists when fewer than N notes are available", async () => {
    const cfg = oneNotePerHistory([
      { history: "a1", marker: "note-a1" },
      { history: "b2", marker: "note-b2" },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 5);

    expect(notes).toHaveLength(2);
  });

  it("returns notes in recency order, most-recent first", async () => {
    const cfg = oneNotePerHistory([
      { history: "a1", marker: "RECENT" },
      { history: "b2", marker: "MIDDLE" },
      { history: "c3", marker: "OLDEST" },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew");

    expect(notes.map((n) => n.content)).toEqual(["RECENT", "MIDDLE", "OLDEST"]);
  });

  it("yields an empty sequence for an empty ref", async () => {
    const { exec } = makeExec({ history: [] });

    expect(await readRecentUserNotes(exec, "andrew")).toEqual([]);
  });

  it("skips changed paths that are not notes", async () => {
    const notePath = notePathFor(annotated("a1"));
    const cfg: NotesConfig = {
      history: ["h1"],
      pathsByHistory: { h1: ["README.md", notePath] },
      contentByShow: { [`h1:${notePath}`]: "the-note" },
    };
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew");

    expect(notes.map((n) => n.content)).toEqual(["the-note"]);
  });
});

describe("listAnnotatedNoteCommits", () => {
  it("parses git notes list output into annotated commit shas", async () => {
    const firstBlob = annotated("11");
    const secondBlob = annotated("22");
    const firstAnnotatedCommit = annotated("a1");
    const secondAnnotatedCommit = annotated("b2");
    const { exec, calls } = makeExec({
      notesListOutput: [
        `${firstBlob} ${firstAnnotatedCommit}`,
        "",
        ` ${secondBlob} ${secondAnnotatedCommit} `,
      ].join("\n"),
    });

    const commits = await listAnnotatedNoteCommits(exec, "refs/notes/arc/user/andrew");

    expect(commits).toEqual([firstAnnotatedCommit, secondAnnotatedCommit]);
    expect(calls).toContainEqual(["notes", "--ref=refs/notes/arc/user/andrew", "list"]);
  });

  it("returns an empty set when the ref is empty or missing", async () => {
    const empty = makeExec({ notesListOutput: "" });
    const missing = makeExec({ notesListThrows: true });

    await expect(listAnnotatedNoteCommits(empty.exec, "refs/notes/arc/user/andrew")).resolves.toEqual([]);
    await expect(listAnnotatedNoteCommits(missing.exec, "refs/notes/arc/user/andrew")).resolves.toEqual([]);
  });
});
