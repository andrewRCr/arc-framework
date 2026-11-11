/** Checkout eligibility at command entry, including unclaimed checkouts and separate Git directories. */
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { checkoutHoldsProjection } from "../../../../src/lib/store/projection/ownership.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("does not inspect or change projection files in an unclaimed linked checkout", async () => {
  const h = await createEngineFixture(directories);
  await h.exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-unclaimed-"));
  directories.push(parent);
  const checkout = join(parent, "linked");
  await h.exec("git", ["worktree", "add", "-b", "linked", checkout], { cwd: h.checkout });
  await mkdir(join(checkout, ".arc/active"), { recursive: true });
  const file = join(checkout, ".arc/active/saved.md");
  await writeFile(file, "unclaimed hand edit\n");
  const ports = createProjectionEnginePorts(checkout);
  const location = await locateProjection(checkout, ports);
  expect(await startProjection({ store: h.store, checkout, ports: () => ({ ...ports,
    walkFs: { readdir: () => { throw new Error("projection walk must stay off"); } },
    linkFs: { lstat: async () => { throw new Error("projection link observation must stay off"); } },
  }) })).toEqual({ kind: "no-projection" });
  expect(await readFile(file, "utf8")).toBe("unclaimed hand edit\n");
  expect(await readdir(location.stateDir)).not.toContain("index");
});

it("recognizes a primary whose .git points to a separate Git directory", async () => {
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-separate-"));
  directories.push(parent);
  const checkout = join(parent, "checkout");
  await mkdir(checkout);
  await createExecaGitExec()("git", ["init", "--quiet", "--separate-git-dir", join(parent, "git"), checkout], { cwd: parent });
  const location = await locateProjection(checkout, createProjectionEnginePorts(checkout));
  expect(location.primary).toBe(true);
  expect(await checkoutHoldsProjection(checkout, location)).toBe(true);
});
