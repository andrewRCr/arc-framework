/** Built-CLI coverage for exact delivery state transfer between clones. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deliveryPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { deriveDeliveryPlanDigest } from "../../src/lib/delivery/plan.js";
import type { DeliveryPlanV1 } from "../../src/lib/delivery/schema.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

describe("arc delivery transfer", () => {
  let source: string;
  let transferRoot: string;

  beforeEach(async () => {
    source = await createTempRepo();
    transferRoot = await mkdtemp(join(tmpdir(), "arc-delivery-transfer-"));
    const init = await runArc(["init", "--yes", "--name", "delivery-transfer-test"], source);
    expect(init.exitCode).toBe(0);
    await installActiveWorkUnit(source);
    await git(source, ["add", "-A"]);
    await git(source, ["commit", "-m", "init delivery transfer fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(source);
    await rm(transferRoot, { recursive: true, force: true });
  });

  it("exports and restores the exact plan and state revision in a fresh clone", async () => {
    const plan = laterRevisionPlan();
    const state = deliveryStateFixture(plan);
    await installDeliveryRecords(source, plan, state, 69);

    const bundlePath = join(transferRoot, "delivery-transfer.json");
    const exported = await runArc([
      "delivery", "transfer", "export", "--output", bundlePath, "--json",
    ], source);
    expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);
    expect(JSON.parse(exported.stdout)).toMatchObject({
      command: "delivery transfer export",
      status: "ok",
      value: { planId: plan.planId, stateRevision: 69 },
    });

    const destination = join(transferRoot, "clone");
    await git(source, ["clone", source, destination]);
    const imported = await runArc([
      "delivery", "transfer", "import", "--input", bundlePath, "--json",
    ], destination);
    expect(imported.exitCode, imported.stdout + imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout)).toMatchObject({
      command: "delivery transfer import",
      status: "ok",
      value: { disposition: "imported", planId: plan.planId, stateRevision: 69 },
    });

    const destinationCommon = await gitCommonDir(destination);
    await expect(readFile(
      join(destinationCommon, "arc", "delivery", "plans", `${plan.planId}.json`),
      "utf8",
    )).resolves.toBe(`${JSON.stringify(plan)}\n`);
    await expect(JSON.parse(await readFile(
      join(destinationCommon, "arc", "delivery", "state", `${plan.planId}.json`),
      "utf8",
    ))).toEqual({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision: 69,
      value: state,
    });

    const replay = await runArc([
      "delivery", "transfer", "import", "--input", bundlePath, "--json",
    ], destination);
    expect(replay.exitCode).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      status: "ok",
      value: { disposition: "already-current", stateRevision: 69 },
    });
  });

  it("restores a plan authored before the active work unit was renamed", async () => {
    const renamedWorkUnitId = "renamed-delivery-plan-record";
    await rm(join(source, ".arc", "active", "meta-delivery-plan-record.md"));
    await installActiveWorkUnit(source, renamedWorkUnitId);
    const transitions = join(source, ".arc", "system", ".internal", "transitions");
    await mkdir(transitions, { recursive: true });
    await writeFile(join(transitions, "delivery-plan-record.json"), `${JSON.stringify({
      schemaVersion: 1,
      origin: "delivery-plan-record",
      kind: "rename",
      successors: [renamedWorkUnitId],
      edges: [],
    })}\n`);
    await git(source, ["add", "-A"]);
    await git(source, ["commit", "-m", "record work unit rename"]);

    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    await installDeliveryRecords(source, plan, state, 7);
    const bundlePath = join(transferRoot, "renamed-delivery-transfer.json");
    const exported = await runArc([
      "delivery", "transfer", "export", "--output", bundlePath, "--json",
    ], source);
    expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);

    const destination = join(transferRoot, "renamed-clone");
    await git(source, ["clone", source, destination]);
    const imported = await runArc([
      "delivery", "transfer", "import", "--input", bundlePath, "--json",
    ], destination);

    expect(imported.exitCode, imported.stdout + imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout)).toMatchObject({
      status: "ok",
      value: {
        disposition: "imported",
        workUnitId: "delivery-plan-record",
        stateRevision: 7,
      },
    });
  });

  it("refuses a different plan generation for the active work unit before mutation", async () => {
    const incomingPlan = deliveryPlanFixture();
    await installDeliveryRecords(source, incomingPlan, deliveryStateFixture(incomingPlan), 9);
    const bundlePath = join(transferRoot, "conflicting-delivery-transfer.json");
    const exported = await runArc([
      "delivery", "transfer", "export", "--output", bundlePath, "--json",
    ], source);
    expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);

    const destination = join(transferRoot, "conflicting-clone");
    await git(source, ["clone", source, destination]);
    const conflictingPlan = deliveryPlanFixture("223e4567-e89b-42d3-a456-426614174000");
    await installDeliveryRecords(destination, conflictingPlan, deliveryStateFixture(conflictingPlan), 3);

    const imported = await runArc([
      "delivery", "transfer", "import", "--input", bundlePath, "--json",
    ], destination);

    expect(imported.exitCode).toBe(1);
    expect(JSON.parse(imported.stdout)).toMatchObject({
      status: "refused",
      reason: "destination-conflict",
    });
    const common = await gitCommonDir(destination);
    await expect(readFile(
      join(common, "arc", "delivery", "plans", `${incomingPlan.planId}.json`),
      "utf8",
    )).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(
      join(common, "arc", "delivery", "state", `${incomingPlan.planId}.json`),
      "utf8",
    )).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function laterRevisionPlan(): DeliveryPlanV1 {
  const first = deliveryPlanFixture();
  const successor = {
    ...first,
    planRevision: 2,
    previousPlanDigest: first.planDigest,
  };
  return {
    ...successor,
    planDigest: deriveDeliveryPlanDigest(successor),
  };
}

async function gitCommonDir(repository: string): Promise<string> {
  return resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
}

async function installDeliveryRecords(
  repository: string,
  plan: DeliveryPlanV1,
  state: ReturnType<typeof deliveryStateFixture>,
  revision: number,
): Promise<void> {
  const common = await gitCommonDir(repository);
  await mkdir(join(common, "arc", "delivery", "plans"), { recursive: true });
  await mkdir(join(common, "arc", "delivery", "state"), { recursive: true });
  await writeFile(
    join(common, "arc", "delivery", "plans", `${plan.planId}.json`),
    `${JSON.stringify(plan)}\n`,
  );
  await writeFile(
    join(common, "arc", "delivery", "state", `${plan.planId}.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision,
      value: state,
    })}\n`,
  );
}

async function installActiveWorkUnit(
  repository: string,
  workUnitId = "delivery-plan-record",
): Promise<void> {
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", `meta-${workUnitId}.md`), [
    `# Metadata: ${workUnitId}`,
    "",
    "- **State:** Active",
    `- **Branch:** feat/${workUnitId}`,
    `- **Task List:** \`tasks-${workUnitId}.md\``,
    "",
  ].join("\n"));
}
