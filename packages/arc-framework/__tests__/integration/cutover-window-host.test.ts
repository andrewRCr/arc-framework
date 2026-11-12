/** Effective Git URL rewrites and all push URLs decide whether rehearsal facts are admissible. */
import { createWindowHost } from "../../src/scripts/cutover-window/native-host.js";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { readWindowHostFacts, type WindowHostPort, type WindowPullRequests }
  from "../../src/scripts/cutover-window/host.js";

const listing: WindowPullRequests = {
  open: [], flip: { number: 7, headBranch: "feat/flip", baseBranch: "main", autoMergeArmed: false },
};
const host: WindowHostPort = {
  refs: async () => { throw new Error("Unexpected host read"); },
  pullRequests: async () => { throw new Error("Unexpected host read"); },
  mergeSettings: async () => { throw new Error("Unexpected host read"); },
  discoverRepository: async () => { throw new Error("Unexpected host read"); },
};

it("refuses rewritten or additional hosted URLs, then accepts facts after each repair", async () => {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const git = (...args: string[]) => exec("git", args);
  const mirror = join(root, "mirror.git");
  await git("remote", "add", "origin", mirror);
  const read = () => readWindowHostFacts({ exec, host }, 7, { anchor: "a".repeat(40), pullRequests: listing });
  expect(await read()).toMatchObject({ hosted: false, pullRequests: listing });
  await git("config", "url.https://github.com/.insteadOf", "window-host-test:");
  await git("remote", "set-url", "origin", "window-host-test:owner/repo.git");
  await expect(read()).rejects.toMatchObject({ findings: [expect.objectContaining({
    condition: expect.stringContaining("Supplied host facts"),
  })] });
  await git("remote", "set-url", "origin", mirror);
  expect(await read()).toMatchObject({ hosted: false });
  await git("config", "--add", "remote.origin.pushurl", mirror);
  await git("config", "--add", "remote.origin.pushurl", "https://github.com/owner/repo.git");
  await expect(read()).rejects.toMatchObject({ findings: [expect.objectContaining({
    condition: expect.stringContaining("Supplied host facts"),
  })] });
  await git("config", "--unset-all", "remote.origin.pushurl");
  expect(await read()).toMatchObject({ hosted: false });
}, 15_000);


it("filters Git's actual tail matches without misclassifying branches as store or identity refs", async () => {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const git = (...args: string[]) => exec("git", args);
  const mirror = join(root, "origin.git");
  await git("init", "--bare", mirror);
  await git("remote", "add", "origin", mirror);
  await git("commit", "--allow-empty", "-m", "seed");
  const oid = (await git("rev-parse", "HEAD")).stdout.trim();
  const branch = "refs/heads/foo/refs/arc/user/z/errands";
  const identity = "refs/arc/user/andrew/errands";
  const nested = "refs/arc/user/andrew/nested/errands";
  const refs = ["refs/heads/main", branch, "refs/other/refs/heads/ghost", "refs/arc/project/registry", identity, nested];
  for (const ref of refs) await git("update-ref", ref, oid);
  await git("push", "origin", ...refs.map(ref => `${ref}:${ref}`));
  const port = createWindowHost({ exec, repo: root });
  expect(await port.refs(["refs/heads/*"])).toEqual({ "refs/heads/main": oid, [branch]: oid });
  expect(await port.refs(["refs/arc/*"])).toEqual({ "refs/arc/project/registry": oid, [identity]: oid, [nested]: oid });
  expect(await port.refs(["refs/arc/user/*/errands"])).toEqual({ [identity]: oid });
}, 15_000);
