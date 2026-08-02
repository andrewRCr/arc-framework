/** Real-runtime recovery of durable Errand close checkout locks. */

import { access, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  transactTransientIdentities,
  type ErrandRecordIO,
  type TransientIdentityRecord,
} from "../../src/lib/errand/index.js";
import { readCloseIdentityAtRuntime } from "../../src/lib/errand/close-runtime.js";
import { createPlatformProcessInspector } from "../../src/lib/locus/platform-inspectors.js";
import {
  cleanupTempDir,
  createTempRepo,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";

const IDENTITY = "andrew";
const CLAIM_ID = "c".repeat(32);

function record(): TransientIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "errand",
    slug: "done",
    claimId: CLAIM_ID,
    purpose: "errand",
    origin: "description",
    originEntry: null,
    intent: "done",
    branch: "chore/done",
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  });
}

describe("Errand close HEAD-lock recovery", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("recovers a dead exact-generation holder while the Errand identity remains", async () => {
    const exec = makeGitExec(dir);
    const execInput = makeGitExecInput(dir);
    const io: ErrandRecordIO = { exec, execInput, identity: IDENTITY };
    await transactTransientIdentities(io, {
      remote: null,
      message: "add done",
      transform: () => ({
        kind: "applied",
        records: new Map([["done", record()]]),
        value: null,
      }),
    });
    const checkoutPath = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
    const gitHeadPath = (await exec("git", ["rev-parse", "--git-path", "HEAD"])).stdout.trim();
    const lockPath = `${isAbsolute(gitHeadPath) ? gitHeadPath : resolve(checkoutPath, gitHeadPath)}.lock`;
    await writeFile(lockPath, `${JSON.stringify({
      version: 1,
      kind: "arc-errand-close-head-lock",
      slug: "done",
      claimId: CLAIM_ID,
      checkoutPath,
      holder: {
        pid: 2_147_483_647,
        startToken: "dead-holder-generation",
        inspector: createPlatformProcessInspector().kind,
      },
    })}\n`, "utf8");

    await expect(readCloseIdentityAtRuntime({
      slug: "done",
      identity: IDENTITY,
      exec,
      execInput,
    })).resolves.toMatchObject({ kind: "ready", record: { claimId: CLAIM_ID } });
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
