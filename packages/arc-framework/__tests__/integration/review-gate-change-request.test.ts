import { afterEach, describe, expect, it } from "vitest";

import { computeChangeSetId } from "../../src/scripts/review-gate/core/identity.js";
import { GitHubRestClient } from "../../src/scripts/review-gate/hosts/github/api/rest.js";
import { encodeHostRef, resolveChangeRequest, type GitHubChangeRequestDeps } from "../../src/scripts/review-gate/hosts/github/change-request.js";
import { fetchFake, response, type FetchStep } from "../unit/scripts/review-gate/hosts/github/api/fetch-fake.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  writeFile,
} from "../helpers/integration.js";

const NEUTRAL_KEYS = [
  "baseRef", "baseSha", "changeRequestId", "changeSetId", "diffBaseSha", "headSha", "hostRef",
  "repositoryId", "schemaVersion",
];

describe("GitHub change-request composition", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function forkRepo(): Promise<{ dir: string; c0: string; h1: string }> {
    const dir = await createTempRepo("review-gate-cr-");
    tempDirs.push(dir);
    await writeFile(join(dir, "base.txt"), "base\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const c0 = await makeCommit(dir, "c0 base");
    await execFileAsync("git", ["checkout", "-b", "pr-head"], { cwd: dir });
    await writeFile(join(dir, "feature.txt"), "feature\n");
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    const h1 = await makeCommit(dir, "h1 feature");
    await execFileAsync("git", ["checkout", "main"], { cwd: dir });
    await execFileAsync("git", ["update-ref", "refs/pull/5/head", h1], { cwd: dir });
    return { dir, c0, h1 };
  }

  function prPayload(headSha: string, baseSha: string): unknown {
    return {
      node_id: "PR_node",
      number: 5,
      draft: false,
      mergeable: true,
      base: { ref: "main", sha: baseSha, repo: { id: 100, node_id: "R_base" } },
      head: { ref: "pr-head", sha: headSha, repo: { id: 100, node_id: "R_base" } },
      user: { id: 7, node_id: "U_author", login: "andrewRCr", type: "User" },
    };
  }

  function deps(dir: string, steps: FetchStep[]): GitHubChangeRequestDeps {
    const fake = fetchFake(steps);
    return { rest: new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 }), exec: makeGitExec(dir), baseRemote: "." };
  }

  it("composes a core-shaped change request with no GitHub payload leakage", async () => {
    const { dir, c0, h1 } = await forkRepo();
    const hostRef = encodeHostRef({ owner: "o", repo: "r", number: 5 });
    const result = await resolveChangeRequest(deps(dir, [response(200, JSON.stringify(prPayload(h1, c0)))]), hostRef);
    if (result.kind !== "resolved") throw new Error(`expected resolved, got ${result.kind}`);
    expect(result.changeRequest).toEqual({
      schemaVersion: 1,
      repositoryId: "100",
      changeRequestId: "PR_node",
      hostRef,
      baseRef: "main",
      baseSha: c0,
      diffBaseSha: c0,
      headSha: h1,
      changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: c0, headSha: h1 }),
    });
    // The exact neutral key set is the guarantee that no GitHub payload field crossed the port.
    expect(Object.keys(result.changeRequest).sort()).toEqual(NEUTRAL_KEYS);
    expect(result.changeRequest).not.toHaveProperty("node_id");
    expect(result.changeRequest).not.toHaveProperty("mergeable");
    expect(result.context).toEqual({
      changedPaths: [{ status: "added", path: "feature.txt" }],
      author: { identity: "7", nodeId: "U_author", login: "andrewRCr", kind: "user" },
      isDraft: false,
      isCrossRepository: false,
      mergeability: "mergeable",
    });
  });

  it("is idempotent when re-querying unchanged canonical state", async () => {
    const { dir, c0, h1 } = await forkRepo();
    const hostRef = encodeHostRef({ owner: "o", repo: "r", number: 5 });
    const payload = JSON.stringify(prPayload(h1, c0));
    const twice = deps(dir, [response(200, payload), response(200, payload)]);
    const first = await resolveChangeRequest(twice, hostRef);
    const second = await resolveChangeRequest(twice, hostRef);
    expect(first).toEqual(second);
  });

  it("returns invalid-ref for a malformed hostRef without any host query", async () => {
    const { dir } = await forkRepo();
    expect(await resolveChangeRequest(deps(dir, []), "gitlab:o/r/mr/1")).toEqual({ kind: "invalid-ref" });
  });

  it("returns sensitive when the coverage head does not match the PR head", async () => {
    const { dir, c0 } = await forkRepo();
    const wrongHead = "c".repeat(40);
    const hostRef = encodeHostRef({ owner: "o", repo: "r", number: 5 });
    expect(await resolveChangeRequest(deps(dir, [response(200, JSON.stringify(prPayload(wrongHead, c0)))]), hostRef)).toEqual({
      kind: "sensitive",
      reason: "head-mismatch",
    });
  });

  it("returns unavailable when the pull request cannot be read", async () => {
    const { dir } = await forkRepo();
    const hostRef = encodeHostRef({ owner: "o", repo: "r", number: 5 });
    expect(await resolveChangeRequest(deps(dir, [response(404, "{\"message\":\"Not Found\"}")]), hostRef)).toEqual({
      kind: "unavailable",
      reason: "http-404",
    });
  });
});
