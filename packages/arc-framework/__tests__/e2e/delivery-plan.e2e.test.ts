/** Built-CLI coverage for the delivery authoring command group. */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

const DIGEST = `sha256:${"1".repeat(64)}`;

describe("arc delivery", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "delivery-test"], repository);
    expect(init.exitCode).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it("registers compose and plan abandon from the built entry point", async () => {
    await expect(runArc(["delivery", "compose", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
    await expect(runArc(["delivery", "plan", "abandon", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
  });

  it("emits a typed integrity refusal and abandons the pair idempotently", async () => {
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
      "# Metadata: demo",
      "",
      "- **State:** Active",
      "- **Branch:** feat/demo",
      "",
    ].join("\n"));
    const common = resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
    const authoring = join(common, "arc", "delivery", "authoring");
    await mkdir(authoring, { recursive: true });
    await writeFile(join(authoring, "authoring-map.json"), `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-authoring/v1",
      mapId: "authoring-map",
      originalWorkUnitId: "demo",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      expectedCurrentPlanDigest: null,
      candidatePlanDigest: null,
      design: { artifacts: [{ artifactId: "spec.md", revisionDigest: DIGEST }], elements: [] },
      tasks: {
        inventoryDigest: DIGEST,
        implementation: [{ taskId: "1.1", semanticDigest: DIGEST }],
        verificationTaskId: "2.1",
      },
      source: {
        entry: "from-tasks",
        inputs: { taskListPath: "tasks.md" },
        facts: {},
        identitySequence: ["task:1.1"],
      },
      identityOrder: {
        designArtifactIds: ["spec.md"],
        designElementIds: [],
        taskIds: ["1.1", "2.1"],
        sourceIds: ["task:1.1"],
      },
    })}\n`);
    await writeFile(join(authoring, "authoring-map.md"), "# malformed map\n");

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "delivery compose",
      status: "refused",
      reason: "map-malformed",
    });

    const first = await runArc(["delivery", "plan", "abandon", "--json"], repository);
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ status: "ok", value: { removed: true } });
    const second = await runArc(["delivery", "plan", "abandon", "--json"], repository);
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ status: "ok", value: { removed: false } });
  });
});
