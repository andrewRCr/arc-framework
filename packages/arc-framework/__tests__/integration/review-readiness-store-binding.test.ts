/** Both merge-lock composition roots bind lifecycle readiness to current stored records. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { defaultMergeLockPort, handleReviewReadiness } from "../../src/handlers/review.js";
import { MergeLockTransitionRequestSchema, releaseMergeLock } from "../../src/scripts/review-gate/merge-lock.js";
import { createIntegrationMergeDependencies } from "../../src/scripts/integration/merge-composition.js";
import { IntegrationMergeTargetSchema } from "../../src/scripts/integration/merge.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";

async function lockFixture(root: "command" | "integration", cadence: "manual" | "with-integration", project = true) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, branch = "topic/opaque";
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `branch.base: main\nmerge.lock: draft\narchive.cadence: ${cadence}\n`);
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure readiness fixture"], { cwd });
  await exec("git", ["switch", "-c", branch], { cwd });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  const manual = cadence === "manual";
  if (project) await h.reference.seedProject(projectId);
  const content = makeMetaFixture("example", { state: manual ? "Integrating" : "Shipped", branch: null,
    currentWorkflow: manual ? "integrate-work-unit" : null });
  const record = await h.reference.seed(recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
    `${content}\n## Completion Notes\n\nThe exact implementation is ready.\n`, manual ? { kind: "active" }
      : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
  let locked = true;
  const runner: HostedProcessRunner = { run: async args => {
    if (args[0] === "repo") return { stdout: JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } }), stderr: "" };
    if (args[0] === "api") return { stdout: JSON.stringify({ number: 42, state: "open", draft: locked,
      head: { ref: branch, sha: head }, base: { repo: { full_name: "owner/repo" } } }), stderr: "" };
    if (args[0] === "pr" && args[1] === "ready") { locked = false; return { stdout: "", stderr: "" }; }
    throw new Error(`Unexpected host call: ${args.join(" ")}`);
  } };
  const invocation = { ...h.native, workItem: record.reference.owner };
  const target = IntegrationMergeTargetSchema.parse({ repository: "owner/repo", pullRequest: 42,
    baseRef: "main", headRef: branch, headSha: head });
  const dependencies = createIntegrationMergeDependencies({ ...invocation, workUnit: "example", hostedRunner: runner });
  const port = defaultMergeLockPort(cwd, exec, runner, invocation);
  const request = MergeLockTransitionRequestSchema.parse({ schemaVersion: 1, treeRoot: cwd,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head },
    vehicle: { kind: "work-unit", slug: "example", archiveCadence: cadence } });
  const release = async () => {
    locked = true;
    return root === "command" ? releaseMergeLock(request, port) : dependencies.releaseLock(target);
  };
  return { h, cwd, branch, head, content, record, invocation, request, release };
}

it.each([
  ["command", "manual"], ["command", "with-integration"],
  ["integration", "manual"], ["integration", "with-integration"],
] as const)("%s lock reads stored readiness under %s cadence and retries after notes repair", async (root, cadence) => {
  const { h, cwd, branch, head, content, invocation, request, release, ...fixture } = await lockFixture(root, cadence);
  let record = fixture.record;
  if (root === "command") {
    let output = "";
    await handleReviewReadiness("request.json", { resolveRoot: () => cwd,
      readText: async () => JSON.stringify({ ...request, pullRequest: {
        repository: "owner/repo", number: 42, state: "open", headBranch: branch, headSha: head,
      } }), write: text => { output += text; }, setExitCode: () => undefined }, undefined, invocation);
    expect(JSON.parse(output)).toMatchObject({ state: "ready" });
  }
  expect(await release()).toMatchObject({ state: "released" });
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(record, { content }), provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
  expect(await release()).toMatchObject({ state: "blocked", payload: { reason: "readiness-failed" },
    diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing-completion-notes" })]) });
  record = lifecycleSuccess(await h.reference.store.read({ reference: record.reference }));
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(record, {
    content: `${content}\n## Completion Notes\n\nThe repaired notes are ready.\n`,
  }), provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
  expect(await release()).toMatchObject({ state: "released" });
}, 30_000);

it.each(["command", "integration"] as const)("%s lock names a missing project ID and releases once the clone holds it",
  async root => {
    const { h, release } = await lockFixture(root, "manual", false);
    expect(await release()).toMatchObject({ state: "blocked", payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "project-identity-unavailable",
        message: expect.stringContaining("Restore the project's unique, valid identity record") })]) });
    await h.reference.seedProject(projectId);
    expect(await release()).toMatchObject({ state: "released" });
  }, 30_000);
