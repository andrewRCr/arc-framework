/**
 * Unit tests for `readRecentUserNotes` — the ref-wide N-most-recent-note read
 * that backs the cross-WU merge. Distinct from annotated-commit resolution: it
 * returns an ordered sequence (most-recent first), bounded by the window.
 */

import { describe, it, expect } from "vitest";

import {
  NOTES_COMPACTION_MANIFEST_PATH,
  listAnnotatedNoteCommits,
  mergeCrossWuFile,
  notePathToCommit,
  readNoteContentAtAnnotatedCommit,
  readRecentUserNotes,
} from "../../src/lib/user-sync/index.js";
import type { GitExec } from "../../src/lib/git/index.js";

const NOW = "2026-05-25T12:00:00.000Z";
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
/** A 40-char hex commit from a short hex seed. */
const annotated = (seed: string): string => seed.padEnd(40, "0");
/** A 64-char hex commit from a short hex seed. */
const annotatedSha256 = (seed: string): string => seed.padEnd(64, "0");
/** Fan-out note path for an annotated commit (`ab/cdef…`). */
const notePathFor = (commit: string): string => `${commit.slice(0, 2)}/${commit.slice(2)}`;

interface NotesConfig {
  /** Note-history commits, most-recent first. */
  history?: string[];
  /** History commit → commit timestamp. Defaults to `NOW`. */
  historyDates?: Record<string, string>;
  /** History commit → note paths changed in it. */
  pathsByHistory?: Record<string, string[]>;
  /** `"<historyCommit>:<path>"` → note blob content. */
  contentByShow?: Record<string, string>;
  /** Annotated commit → note blob content. */
  contentByAnnotatedCommit?: Record<string, string>;
  notesListOutput?: string;
  logThrows?: boolean;
  notesListThrows?: boolean;
}

function makeExec(cfg: NotesConfig = {}): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const history = cfg.history ?? [];
  const historyDates = cfg.historyDates ?? {};
  const paths = cfg.pathsByHistory ?? {};
  const content = cfg.contentByShow ?? {};
  const annotatedContent = cfg.contentByAnnotatedCommit ?? {};

  const exec: GitExec = async (_cmd: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "log") {
      if (cfg.logThrows) throw new Error("no such ref");
      const sinceArg = args.find((arg) => arg.startsWith("--since="));
      const since = sinceArg ? Date.parse(sinceArg.slice("--since=".length)) : Number.NEGATIVE_INFINITY;
      return {
        stdout: history
          .filter((commit) => Date.parse(historyDates[commit] ?? NOW) >= since)
          .map((commit) => `${commit}\0${historyDates[commit] ?? NOW}`)
          .join("\n"),
        stderr: "",
      };
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
    if (args[0] === "notes" && args[2] === "show") {
      const commit = args[3] ?? "";
      const value = annotatedContent[commit];
      if (value === undefined) throw new Error(`missing annotated note content: ${commit}`);
      return { stdout: value, stderr: "" };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  return { exec, calls };
}

/** Build a config where each history commit has exactly one note carrying `marker` content. */
function oneNotePerHistory(entries: { history: string; marker: string; date?: string }[]): NotesConfig {
  const pathsByHistory: Record<string, string[]> = {};
  const contentByShow: Record<string, string> = {};
  const historyDates: Record<string, string> = {};
  for (const { history, marker } of entries) {
    const path = notePathFor(annotated(history));
    pathsByHistory[history] = [path];
    contentByShow[`${history}:${path}`] = marker;
    if (entries.find((entry) => entry.history === history)?.date) {
      historyDates[history] = entries.find((entry) => entry.history === history)?.date ?? NOW;
    }
  }
  return { history: entries.map((e) => e.history), historyDates, pathsByHistory, contentByShow };
}

describe("readRecentUserNotes", () => {
  it("respects the N bound when more notes exist", async () => {
    const cfg = oneNotePerHistory(
      ["a1", "b2", "c3", "d4", "e5"].map((h) => ({ history: h, marker: `note-${h}` })),
    );
    const { exec, calls } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 3, NOW);

    expect(notes).toHaveLength(3);
    const log = calls.find((args) => args[0] === "log");
    expect(log).not.toContain("--max-count");
    expect(log?.some((arg) => arg.startsWith("--since="))).toBe(true);
  });

  it("reads what exists when fewer than N notes are available", async () => {
    const cfg = oneNotePerHistory([
      { history: "a1", marker: "note-a1" },
      { history: "b2", marker: "note-b2" },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 5, NOW);

    expect(notes).toHaveLength(2);
  });

  it("returns notes in recency order, most-recent first", async () => {
    const cfg = oneNotePerHistory([
      { history: "a1", marker: "RECENT" },
      { history: "b2", marker: "MIDDLE" },
      { history: "c3", marker: "OLDEST" },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", undefined, NOW);

    expect(notes.map((n) => n.content)).toEqual(["RECENT", "MIDDLE", "OLDEST"]);
  });

  it("yields an empty sequence for an empty ref", async () => {
    const { exec } = makeExec({ history: [] });

    expect(await readRecentUserNotes(exec, "andrew", undefined, NOW)).toEqual([]);
  });

  it("skips changed paths that are not notes", async () => {
    const notePath = notePathFor(annotated("a1"));
    const cfg: NotesConfig = {
      history: ["h1"],
      pathsByHistory: { h1: ["README.md", notePath] },
      contentByShow: { [`h1:${notePath}`]: "the-note" },
    };
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", undefined, NOW);

    expect(notes.map((n) => n.content)).toEqual(["the-note"]);
  });

  it("excludes notes older than the tombstone TTL bound regardless of count", async () => {
    const cfg = oneNotePerHistory([
      { history: "a1", marker: "recent", date: daysAgo(1) },
      { history: "b2", marker: "expired", date: daysAgo(8) },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 10, NOW);

    expect(notes.map((n) => n.content)).toEqual(["recent"]);
  });

  it("drops sparse pre-deletion notes with their expired tombstone", async () => {
    const wmFile = (...entries: string[]): string =>
      `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
    const wmEntry = (header: string): string => `**${header}:**\n_Remove when: x._\n\nBody.`;
    const wmTomb = (header: string, removedAt: string): string =>
      `## Removed: **${header}:**\n\n- _Section:_ Memories\n- _Removed:_ ${removedAt}`;
    const cfg = oneNotePerHistory([
      { history: "a1", marker: wmFile(wmEntry("Recent")), date: daysAgo(1) },
      { history: "b2", marker: `${wmFile()}\n${wmTomb("Dropped", daysAgo(8))}\n`, date: daysAgo(8) },
      { history: "c3", marker: wmFile(wmEntry("Dropped")), date: daysAgo(9) },
    ]);
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 10, NOW);
    const merged = mergeCrossWuFile("WORKING-MEMORY.md", notes, NOW);

    expect(merged.content).toContain("**Recent:**");
    expect(merged.content).not.toContain("**Dropped:**");
    expect(merged.content).not.toContain("## Removed: **Dropped:**");
  });

  it("does not let merge commits shrink the effective note window", async () => {
    const noteA = notePathFor(annotated("a1"));
    const noteB = notePathFor(annotated("b2"));
    const cfg: NotesConfig = {
      history: ["merge", "a1", "b2"],
      pathsByHistory: {
        merge: [],
        a1: [noteA],
        b2: [noteB],
      },
      contentByShow: {
        [`a1:${noteA}`]: "note-a",
        [`b2:${noteB}`]: "note-b",
      },
    };
    const { exec } = makeExec(cfg);

    const notes = await readRecentUserNotes(exec, "andrew", 2, NOW);

    expect(notes.map((n) => n.content)).toEqual(["note-a", "note-b"]);
  });
});

describe("listAnnotatedNoteCommits", () => {
  it("does not surface the compaction manifest path as an annotated note", async () => {
    const commit = annotated("a1");
    const { exec } = makeExec({
      notesListOutput: [
        `${annotated("b2")} ${commit}`,
        `${annotated("c3")} ${NOTES_COMPACTION_MANIFEST_PATH}`,
      ].join("\n"),
    });

    await expect(listAnnotatedNoteCommits(exec, "refs/notes/arc/user/andrew")).resolves.toEqual([commit]);
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

  it("accepts SHA-256 annotated commit ids", async () => {
    const blob = annotatedSha256("11");
    const annotatedCommit = annotatedSha256("a1");
    const { exec } = makeExec({
      notesListOutput: `${blob} ${annotatedCommit}`,
    });

    await expect(listAnnotatedNoteCommits(exec, "refs/notes/arc/user/andrew"))
      .resolves.toEqual([annotatedCommit]);
  });

  it("returns an empty set when the ref is empty or missing", async () => {
    const empty = makeExec({ notesListOutput: "" });
    const missing = makeExec({ notesListThrows: true });

    await expect(listAnnotatedNoteCommits(empty.exec, "refs/notes/arc/user/andrew")).resolves.toEqual([]);
    await expect(listAnnotatedNoteCommits(missing.exec, "refs/notes/arc/user/andrew")).resolves.toEqual([]);
  });
});

describe("notePathToCommit", () => {
  it("parses SHA-1 and SHA-256 fan-out note paths", () => {
    const sha1 = annotated("a1");
    const sha256 = annotatedSha256("b2");

    expect(notePathToCommit(notePathFor(sha1))).toBe(sha1);
    expect(notePathToCommit(notePathFor(sha256))).toBe(sha256);
  });
});

describe("readNoteContentAtAnnotatedCommit", () => {
  it("returns note content for an annotated commit that carries a note", async () => {
    const commit = annotated("a1");
    const manifest = JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "note" } });
    const { exec, calls } = makeExec({
      contentByAnnotatedCommit: { [commit]: manifest },
    });

    const content = await readNoteContentAtAnnotatedCommit(
      exec,
      "refs/notes/arc/user/andrew",
      commit,
    );

    expect(content).toBe(manifest);
    expect(calls).toContainEqual(["notes", "--ref=refs/notes/arc/user/andrew", "show", commit]);
  });

  it("returns null when an annotated commit carries no readable note", async () => {
    await expect(
      readNoteContentAtAnnotatedCommit(
        makeExec().exec,
        "refs/notes/arc/user/andrew",
        annotated("c3"),
      ),
    ).resolves.toBeNull();
  });
});
