import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  createFrontlineOutcomeRecord,
} from "../../src/scripts/review-gate/core/advisory-records.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  LocalFrontlineOutcomeStore,
} from "../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import {
  normalizeFrontlineOutcome,
} from "../../src/scripts/review-gate/policy/frontline-outcome.js";

const roots: string[] = [];
const oid = (value: string): string => value.repeat(40);
const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid("c"),
  headTree: oid("d"),
});
const source = {
  sourceId: "review-cli",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--plain"],
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-frontline-outcomes-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  return {
    root,
    exec,
    store: new LocalFrontlineOutcomeStore(publisher),
  };
}

function outcomeRecord(operationId = "frontline-operation", pass: 1 | 2 = 1) {
  return createFrontlineOutcomeRecord({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: target.repositoryId,
    operationId,
    sourceIdentity: source.sourceId,
    executableIdentity: {
      digest: `sha256:${"e".repeat(64)}`,
      qualifiedVersion: "reviewer/1.0.0",
    },
    outcome: normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target,
      pass,
      maxPasses: 2,
    }),
  });
}

describe("local frontline outcome store", () => {
  it("publishes once and replays the same record from a sibling worktree", async () => {
    const records = await fixture();
    const record = outcomeRecord();
    const published = await records.store.appendOutcome(record, 0);
    const sibling = new LocalFrontlineOutcomeStore(new RepositoryGitCommonStatePublisher(
      records.exec,
      join(records.root, "sibling-worktree"),
    ));

    await expect(sibling.appendOutcome(record, 0)).resolves.toEqual(published);
    await expect(sibling.readOutcome(record.operationId)).resolves.toEqual({
      version: 1,
      record,
      outcomeRef: published.outcomeRef,
    });
  });

  it("rejects a conflicting replay without overwriting the durable outcome", async () => {
    const records = await fixture();
    const record = outcomeRecord();
    const published = await records.store.appendOutcome(record, 0);
    const conflicting = outcomeRecord(record.operationId, 2);

    await expect(records.store.appendOutcome(conflicting, 1)).rejects.toThrow(/conflicting-replay/u);
    await expect(records.store.readOutcome(record.operationId)).resolves.toEqual({
      version: 1,
      record,
      outcomeRef: published.outcomeRef,
    });
  });
});
