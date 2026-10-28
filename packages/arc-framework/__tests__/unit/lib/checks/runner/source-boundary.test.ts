/** Raw path rechecks and ownership cleanup at the injected Git boundary. */
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { acquireSourceBoundary, type SourceBoundary } from "../../../../../src/lib/checks/runner/source-boundary.js";
import { scriptGitExec, scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";

it("refuses a changed raw path listing and removes its own index while retaining caller resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-source-boundary-unit-"));
  const index = join(root, "index");
  await writeFile(index, "original index");
  const tree = "a".repeat(40);
  const head = "b".repeat(40);
  const indexes = new Set<string>();
  const git = scriptGitExec([
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: index }] },
    { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["add", "-A"], responses: [({ options }) => {
      if (options?.indexFile !== undefined) indexes.add(options.indexFile);
      return { stdout: "" };
    }] },
    { match: ["write-tree"], responses: [{ stdout: tree }] },
  ]).exec;
  const gitRaw = scriptRawGitExec([{ match: ["ls-tree", "-r", "--name-only", "-z", tree], responses: [
    { stdout: Buffer.from("first.txt\0") }, { stdout: Buffer.from("different.txt\0") },
  ] }]).exec;
  let unexpected: SourceBoundary | undefined;
  try {
    await expect(acquireSourceBoundary({ git, gitRaw }, root, { scope: { kind: "all" }, tree,
      source: { kind: "worktree", head: { status: "known", commit: head } } })
      .then(boundary => { unexpected = boundary; return boundary; })).rejects.toThrow(/paths.*changed.*retry/iu);
    for (const path of indexes) await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(index, "utf8")).toBe("original index");
  } finally { await unexpected?.remove(); await rm(root, { recursive: true, force: true }); }
});
