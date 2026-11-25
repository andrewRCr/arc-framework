/** The reusable window source has real upstreams, a local mirror, and personal state eligible for saving. */
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { makeUserIO } from "../helpers/integration.js";
import { runUserSave } from "../../src/commands/user.js";

it("starts clean before designation, with a one-commit flip and an eligible notes save", async () => {
  const h = await windowFixture();
  const git = (...args: string[]) => h.git("git", args);
  expect((await git("status", "--porcelain")).stdout.trim()).toBe("");
  await expect(git("config", "--get-regexp", "^remote\\..*\\.arc-state$")).rejects.toMatchObject({ exitCode: 1 });
  const main = (await git("rev-parse", "main")).stdout.trim();
  expect((await git("rev-list", "--count", `main..${h.flip.branch}`)).stdout.trim()).toBe("1");
  expect((await git("rev-parse", "main@{upstream}")).stdout.trim()).toBe(main);
  expect((await git("rev-parse", `${h.flip.branch}@{upstream}`)).stdout.trim()).toBe(h.flip.head);
  expect((await h.remote("git", ["rev-parse", "refs/heads/main"])).stdout.trim()).toBe(main);
  expect((await h.remote("git", ["rev-parse", `refs/heads/${h.flip.branch}`])).stdout.trim()).toBe(h.flip.head);
  expect(JSON.parse(await readFile(h.listingPath, "utf8"))).toEqual(h.pullRequests);
  expect(h.pullRequests.flip).toMatchObject({ number: h.flip.pullRequest, headBranch: h.flip.branch, autoMergeArmed: false });
  const saved = await runUserSave({ cwd: h.root, io: makeUserIO(h.root), identity: "andrew", currentWuName: "alpha" });
  expect(saved.fileCount).toBeGreaterThan(0);
  const note = await git("notes", "--ref=refs/notes/arc/user/andrew", "show", "HEAD");
  expect(JSON.parse(note.stdout)).toMatchObject({ files: { "WORKING-MEMORY.md": "# Working Memory\n\n## Memories\n" } });
}, 30_000);
