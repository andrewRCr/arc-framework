/** Real Git measurement of a member's complete target and small correction range. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readConfigSettings } from "../../src/lib/config/status-reader.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { resolveDeliveryMemberScopeSelection } from "../../src/scripts/review-gate/status-delivery-scope.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });

it("measures a small fix independently of the member's complete contribution", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-review-delivery-scope-" });
  roots.push(cwd);
  const exec = makeGitExec(cwd);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "changeset.advisory_threshold_lines: 50\nchangeset.advisory_threshold_files: 0\n");
  await git("add", "."); await git("commit", "-m", "base");
  const baseRevision = await git("rev-parse", "HEAD");
  const lines = Array.from({ length: 100 }, (_, index) => `export const value${index} = ${index};`);
  await writeFile(join(cwd, "large.ts"), `${lines.join("\n")}\n`);
  await git("add", "."); await git("commit", "-m", "contribution");
  const predecessorHeadSha = await git("rev-parse", "HEAD");
  lines[0] = "export const value0 = 100;";
  await writeFile(join(cwd, "large.ts"), `${lines.join("\n")}\n`);
  await git("commit", "-am", "fix");
  const headSha = await git("rev-parse", "HEAD");
  const context = { rawExec: createRawGitExec(cwd), settings: (await readConfigSettings(cwd)).settings,
    planId: "plan-1", sourceId: "delegated-agent",
    target: { repository: "owner/repo", pullRequest: 42, baseRevision, headSha },
    correctionScope: { schemaVersion: 1 as const, predecessorProducerId: "local-1", predecessorHeadSha,
      basisHeadSha: predecessorHeadSha, headSha,
      requiredFindings: [{ producerId: "local-1", findingId: "finding-1", locus: "large.ts:1" }] } };
  await expect(resolveDeliveryMemberScopeSelection({ ...context, coverage: "incremental" })).resolves.toBeUndefined();
  await expect(resolveDeliveryMemberScopeSelection({ ...context, coverage: "complete" })).resolves.toEqual({
    mode: "chunked", target: { repository: "owner/repo", pullRequest: 42, headSha },
  });
});
