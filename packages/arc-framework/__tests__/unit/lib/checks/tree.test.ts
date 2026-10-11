/** Check snapshot cleanup at the injectable Git boundary. */
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { stagedWorktreeTree } from "../../../../src/lib/checks/tree.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

it("removes the temporary index after Git fails while preserving the real index", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-check-index-cleanup-"));
  const index = join(cwd, "index");
  await writeFile(index, "original index bytes");
  let temporaryIndex: string | undefined;
  const { exec } = scriptGitExec([
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: index }] },
    { match: ["add", "-A"], responses: [async ({ options }) => {
      temporaryIndex = options?.indexFile;
      expect(await readFile(temporaryIndex!, "utf8")).toBe("original index bytes");
      return { failure: { exitCode: 1, stderr: "staging failed" } };
    }] },
  ]);
  try {
    await expect(stagedWorktreeTree(exec, cwd)).rejects.toThrow();
    expect(await readFile(index, "utf8")).toBe("original index bytes");
    expect(temporaryIndex).toBeDefined();
    await expect(access(dirname(temporaryIndex!))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
