/** Identity reads use existing authority without creating first-use state. */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readRepositoryIdentity, resolveRepositoryIdentity } from "../../../../../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../../src/lib/git-common-state.js";
import { scriptGitExec } from "../../../../../helpers/git-exec-fake.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("reads the published identity without creating first-use state", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-identity-read-")); roots.push(root);
  const exec = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: root }] }]).exec;
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  expect(await readRepositoryIdentity(publisher)).toBeNull();
  expect(await readdir(root)).toEqual([]);
  const id = await resolveRepositoryIdentity(publisher);
  const before = await publisher.snapshot({ root: "review-gate", namespace: "identity" });
  expect(await readRepositoryIdentity(publisher)).toBe(id);
  expect(await publisher.snapshot({ root: "review-gate", namespace: "identity" })).toEqual(before);
});
