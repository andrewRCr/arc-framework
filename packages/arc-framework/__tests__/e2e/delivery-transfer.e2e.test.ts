/** Built-CLI coverage for exact delivery state transfer between clones. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deliveryPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
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
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const sourceCommon = await gitCommonDir(source);
    await mkdir(join(sourceCommon, "arc", "delivery", "plans"), { recursive: true });
    await mkdir(join(sourceCommon, "arc", "delivery", "state"), { recursive: true });
    await writeFile(
      join(sourceCommon, "arc", "delivery", "plans", `${plan.planId}.json`),
      `${JSON.stringify(plan)}\n`,
    );
    await writeFile(
      join(sourceCommon, "arc", "delivery", "state", `${plan.planId}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-state-store/v1",
        planId: plan.planId,
        revision: 69,
        value: state,
      })}\n`,
    );

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
});

async function gitCommonDir(repository: string): Promise<string> {
  return resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
}

async function installActiveWorkUnit(repository: string): Promise<void> {
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-delivery-plan-record.md"), [
    "# Metadata: delivery-plan-record",
    "",
    "- **State:** Active",
    "- **Branch:** feat/delivery-plan-record",
    "- **Task List:** `tasks-delivery-plan-record.md`",
    "",
  ].join("\n"));
}
