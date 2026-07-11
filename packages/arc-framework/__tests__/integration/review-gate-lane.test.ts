import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { resolveAutoLane } from "../../src/scripts/review-gate/policy/self-hosting/lane.js";
import {
  cleanupTempDir,
  createTempRepo,
  dirname,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  mkdir,
  writeFile,
} from "../helpers/integration.js";

describe("ref-backed review lane", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function write(repo: string, path: string, content: string): Promise<void> {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), content);
  }

  async function commit(repo: string, message: string): Promise<string> {
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    return makeCommit(repo, message);
  }

  it("reads flat, nested, added, deleted, whitespace, and newline groups from exact refs", async () => {
    const repo = await createTempRepo("review-gate-lane-");
    tempDirs.push(repo);
    await write(repo, ".arc/active/meta-flat.md", renderMetaFile("flat", { Owner: "andrew" }));
    await write(repo, ".arc/active/tasks-flat.md", "flat\n");
    await write(repo, ".arc/backlog/planned/old/meta-old.md", renderMetaFile("old", { Owner: "andrew" }));
    await write(repo, ".arc/backlog/planned/old/notes-old.md", "old\n");
    const base = await commit(repo, "base groups");

    await write(repo, ".arc/active/tasks-flat.md", "changed\n");
    await execFileAsync("git", ["rm", ".arc/backlog/planned/old/notes-old.md", ".arc/backlog/planned/old/meta-old.md"], { cwd: repo });
    const oddSlug = "odd name\nline";
    await write(
      repo,
      `.arc/backlog/planned/new group/meta-${oddSlug}.md`,
      renderMetaFile(oddSlug, { Owner: "andrew" }),
    );
    await write(repo, `.arc/backlog/planned/new group/draft-${oddSlug}.md`, "new\n");
    const head = await commit(repo, "mixed group changes");

    await expect(resolveAutoLane({
      exec: makeGitExec(repo),
      diffBaseSha: base,
      headSha: head,
      authorLogin: "andrewRCr",
      authorMap: { andrewRCr: "andrew" },
      changes: [
        { status: "modified", path: ".arc/active/tasks-flat.md" },
        { status: "deleted", path: ".arc/backlog/planned/old/notes-old.md" },
        { status: "deleted", path: ".arc/backlog/planned/old/meta-old.md" },
        { status: "added", path: `.arc/backlog/planned/new group/meta-${oddSlug}.md` },
        { status: "added", path: `.arc/backlog/planned/new group/draft-${oddSlug}.md` },
      ],
    })).resolves.toEqual({ lane: "auto", reasons: ["author-owned-artifacts"] });
  });

  it("fails reviewed for cross-group moves and unreadable refs", async () => {
    const repo = await createTempRepo("review-gate-lane-");
    tempDirs.push(repo);
    await write(repo, ".arc/active/meta-old.md", renderMetaFile("old", { Owner: "andrew" }));
    await write(repo, ".arc/active/tasks-old.md", "old\n");
    const base = await commit(repo, "base");
    const head = base;
    const input = {
      exec: makeGitExec(repo),
      diffBaseSha: base,
      headSha: head,
      authorLogin: "andrewRCr",
      authorMap: { andrewRCr: "andrew" },
    };

    await expect(resolveAutoLane({
      ...input,
      changes: [{ status: "renamed", previousPath: ".arc/active/tasks-old.md", path: ".arc/active/tasks-new.md" }],
    })).resolves.toEqual({ lane: "reviewed", reasons: ["ambiguous-move"] });
    await expect(resolveAutoLane({
      ...input,
      headSha: "f".repeat(40),
      changes: [{ status: "modified", path: ".arc/active/tasks-old.md" }],
    })).resolves.toEqual({ lane: "reviewed", reasons: ["missing-or-invalid-meta"] });
  });
});
