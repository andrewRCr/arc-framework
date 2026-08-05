/** Built-CLI coverage for the delivery authoring command group. */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";
import {
  ROLLING_FIELD_RUN,
  SEVEN_MEMBER_FIELD_RUN,
  adjacentFieldSeams,
  type DeliveryFieldRun,
} from "../fixtures/delivery-field-runs.js";

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
    await expect(runArc(["delivery", "plan", "from-tasks", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
    const branchHelp = await runArc(["delivery", "plan", "from-branch", "--help"], repository);
    expect(branchHelp).toMatchObject({ exitCode: 0 });
    expect(branchHelp.stdout).toContain("--base <commit-ish>");
    await expect(runArc(["delivery", "compose", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
    await expect(runArc(["delivery", "plan", "abandon", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
  });

  it("validates design input before writing task-derived authoring state", async () => {
    await installTaskFixture(repository);
    const missing = await runArc(["delivery", "plan", "from-tasks", "--json"], repository);
    expect(missing.exitCode).toBe(1);

    await writeFile(join(repository, "design-inventory.json"), "{ invalid json\n");
    const invalid = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(invalid.exitCode).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      command: "delivery plan from-tasks",
      status: "refused",
      reason: "invalid-design-inventory",
    });
    const common = await gitCommonDir(repository);
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("authors a branch-derived map from default and explicit coordinates", async () => {
    await installTaskFixture(repository);
    const missingDesign = await runArc([
      "delivery", "plan", "from-branch", "--json",
    ], repository);
    expect(missingDesign.exitCode).toBe(1);
    expect(JSON.parse(missingDesign.stdout)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
    await writeDesignInventory(repository);
    const base = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["checkout", "-b", "feature"]);
    await writeFile(join(repository, "contribution.txt"), "branch contribution\n");
    await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
      "# Metadata: demo",
      "",
      "- **State:** Active",
      "- **Branch:** feat/demo",
      "- **Task List:** `tasks-demo.md`",
      "- **Next Action:** Author delivery boundaries",
      "",
    ].join("\n"));
    await git(repository, ["add", "--", "contribution.txt", ".arc/active/meta-demo.md"]);
    await git(repository, ["commit", "-m", [
      "branch contribution",
      "",
      "Context: tasks-demo.md (Task 9.9.a)",
    ].join("\n")]);
    const head = await git(repository, ["rev-parse", "HEAD"]);

    const author = await runArc([
      "delivery", "plan", "from-branch",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);
    expect(JSON.parse(author.stdout)).toMatchObject({
      command: "delivery plan from-branch",
      status: "ok",
      value: { base, head },
    });
    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    const snapshotPath = join(authoring, mapName.replace(/\.md$/u, ".json"));
    const recoverySnapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      candidatePlanDigest: string | null;
      candidateProjectionDigest: string | null;
    };
    const map = await readFile(join(authoring, mapName), "utf8");
    expect(map).toContain('"entry": "from-branch"');
    expect(map).toContain('"classification": "contribution"');
    expect(map).toContain('"lifecycleArtifactTouches"');
    expect(map).toContain('".arc/active/meta-demo.md"');
    expect(map).toContain('"boundary": null');
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "wu-integration-target" },
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "branch", sourceIds: [head] }],
      },
      members: [{
        chunkKey: "branch",
        title: "Branch contribution",
        contract: "Publish the inspected branch contribution",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });
    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode, compose.stdout + compose.stderr).toBe(0);
    const composition = JSON.parse(compose.stdout) as {
      value: { advisories: unknown[] };
    };
    expect(composition).toMatchObject({
      status: "ok",
      value: {
        advisories: [
          { kind: "unresolved-task-reference", commit: head, taskId: "9.9.a" },
          { kind: "uncovered-implementation-task", taskId: "1.1" },
        ],
      },
    });
    const plans = join(common, "arc", "delivery", "plans");
    const planName = (await readdir(plans))[0];
    expect(planName).toBeDefined();
    if (planName === undefined) return;
    const initialPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planDigest: string;
      planRevision: number;
    };
    await writeFile(snapshotPath, `${JSON.stringify({
      ...recoverySnapshot,
      candidatePlanDigest: initialPlan.planDigest,
      candidateProjectionDigest: DIGEST,
    })}\n`);
    const recovered = await runArc(["delivery", "compose", "--json"], repository);
    expect(recovered.exitCode, recovered.stdout + recovered.stderr).toBe(0);
    const recovery = JSON.parse(recovered.stdout) as {
      value: { advisories: unknown[] };
    };
    expect(recovery).toMatchObject({
      status: "ok",
      value: {
        planDigest: initialPlan.planDigest,
        recoveredCleanup: true,
        advisories: [
          { kind: "unresolved-task-reference", commit: head, taskId: "9.9.a" },
          { kind: "uncovered-implementation-task", taskId: "1.1" },
        ],
      },
    });
    expect(recovery.value.advisories).toEqual(composition.value.advisories);

    const explicit = await runArc([
      "delivery", "plan", "from-branch",
      "--design-inventory", "design-inventory.json",
      "--base", base,
      "--head", head,
      "--json",
    ], repository);
    expect(explicit.exitCode, explicit.stdout + explicit.stderr).toBe(0);
    expect(JSON.parse(explicit.stdout)).toMatchObject({
      status: "ok",
      value: { base, head },
    });
    const successorMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(successorMap).toBeDefined();
    if (successorMap === undefined) return;
    const successorSnapshot = JSON.parse(
      await readFile(join(authoring, successorMap.replace(/\.md$/u, ".json")), "utf8"),
    ) as { planId: string; expectedCurrentPlanDigest: string | null };
    expect(successorSnapshot).toMatchObject({
      planId: initialPlan.planId,
      expectedCurrentPlanDigest: initialPlan.planDigest,
    });
    await fillSlots(join(authoring, successorMap), {
      projection: { kind: "wu-integration-target" },
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "branch", sourceIds: [head] }],
      },
      members: [{
        chunkKey: "branch",
        title: "Branch contribution",
        contract: "Publish the inspected branch contribution",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });
    const revise = await runArc(["delivery", "compose", "--json"], repository);
    expect(revise.exitCode, revise.stdout + revise.stderr).toBe(0);
    const revisedPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planRevision: number;
    };
    expect(revisedPlan).toMatchObject({
      planId: initialPlan.planId,
      planRevision: initialPlan.planRevision + 1,
    });
  });

  it.each([SEVEN_MEMBER_FIELD_RUN, ROLLING_FIELD_RUN])(
    "reconstructs the recorded $workUnitId plan shape from landed evidence through the built CLI",
    async (run) => {
      await installTaskFixture(repository);
      await writeDesignInventory(repository);
      await git(repository, ["checkout", "-b", "field-reconstruction"]);
      const contributionIds: string[] = [];
      for (const [index, member] of run.members.entries()) {
        if (run.workUnitId === SEVEN_MEMBER_FIELD_RUN.workUnitId
          && index === run.members.length - 1) {
          await git(repository, ["checkout", "main"]);
          await writeFile(join(repository, "ambient-base-advance.txt"), "base advance\n");
          await git(repository, ["add", "--", "ambient-base-advance.txt"]);
          await git(repository, ["commit", "-m", "advance reconstructed base"]);
          await git(repository, ["checkout", "field-reconstruction"]);
          await git(repository, ["merge", "--no-ff", "main", "-m", "absorb reconstructed base"]);
        }
        const evidencePath = `field-${String(index + 1).padStart(2, "0")}-${member.chunkKey}.txt`;
        await writeFile(join(repository, evidencePath), [
          `pull request: ${member.pullRequest}`,
          `merge: ${member.mergeCommit}`,
          `base: ${member.base}`,
          `head: ${member.head}`,
          "",
        ].join("\n"));
        await git(repository, ["add", "--", evidencePath]);
        await git(repository, ["commit", "-m", `reconstruct ${member.chunkKey}`]);
        contributionIds.push(await git(repository, ["rev-parse", "HEAD"]));
      }

      const author = await runArc([
        "delivery", "plan", "from-branch",
        "--design-inventory", "design-inventory.json",
        "--base", "main",
        "--head", "HEAD",
        "--json",
      ], repository);
      expect(author.exitCode, author.stdout + author.stderr).toBe(0);
      const common = await gitCommonDir(repository);
      const authoring = join(common, "arc", "delivery", "authoring");
      const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
      expect(mapName).toBeDefined();
      if (mapName === undefined) return;
      const mapPath = join(authoring, mapName);
      const map = await readFile(mapPath, "utf8");
      if (run.workUnitId === SEVEN_MEMBER_FIELD_RUN.workUnitId) {
        expect(map).toContain('"classification": "ambient-base-absorb"');
      }
      await fillSlots(mapPath, fieldSlots(run, contributionIds));
      const compose = await runArc(["delivery", "compose", "--json"], repository);
      expect(compose.exitCode, compose.stdout + compose.stderr).toBe(0);

      const planName = (await readdir(join(common, "arc", "delivery", "plans")))[0];
      expect(planName).toBeDefined();
      if (planName === undefined) return;
      const plan = JSON.parse(await readFile(join(common, "arc", "delivery", "plans", planName), "utf8")) as {
        members: { chunkKey: string; deliverableId: string; taskIds: string[] }[];
        seams: { seamKey: string; ownerDeliverableId: string }[];
      };
      expect(plan.members.map((member) => member.chunkKey))
        .toEqual(run.members.map((member) => member.chunkKey));
      expect(plan.members.every((member) => member.taskIds.length === 0)).toBe(true);
      for (const [index, seam] of adjacentFieldSeams(run).entries()) {
        expect(plan.seams.find((candidate) => candidate.seamKey === seam.seamKey)?.ownerDeliverableId)
          .toBe(plan.members[index + 1]?.deliverableId);
      }
    },
  );

  it("authors, fills, composes, publishes, and renders a task-derived plan", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);
    expect(JSON.parse(author.stdout)).toMatchObject({
      command: "delivery plan from-tasks",
      status: "ok",
    });

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "wu-integration-target" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode, compose.stdout + compose.stderr).toBe(0);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "ok",
      value: { planDigest: expect.stringMatching(/^sha256:/u) },
    });
    expect(await readdir(join(common, "arc", "delivery", "plans")))
      .toHaveLength(1);
    await expect(readdir(authoring)).resolves.toEqual([]);
    const tasks = await readFile(join(repository, ".arc", "active", "tasks-demo.md"), "utf8");
    expect(tasks).toContain("<!-- arc:delivery-plan:start -->");
    expect(tasks).toContain("| 1 | Implementation | `implementation` | `1.1`");

    const plans = join(common, "arc", "delivery", "plans");
    const planName = (await readdir(plans))[0];
    expect(planName).toBeDefined();
    if (planName === undefined) return;
    const initialPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planDigest: string;
      planRevision: number;
    };
    const successor = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(successor.exitCode, successor.stdout + successor.stderr).toBe(0);
    const successorMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(successorMap).toBeDefined();
    if (successorMap === undefined) return;
    const successorSnapshot = JSON.parse(
      await readFile(join(authoring, successorMap.replace(/\.md$/u, ".json")), "utf8"),
    ) as { planId: string; expectedCurrentPlanDigest: string | null };
    expect(successorSnapshot).toMatchObject({
      planId: initialPlan.planId,
      expectedCurrentPlanDigest: initialPlan.planDigest,
    });
    await fillSlots(join(authoring, successorMap), {
      projection: { kind: "wu-integration-target" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });
    const revise = await runArc(["delivery", "compose", "--json"], repository);
    expect(revise.exitCode, revise.stdout + revise.stderr).toBe(0);
    const revisedPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planRevision: number;
    };
    expect(revisedPlan).toMatchObject({
      planId: initialPlan.planId,
      planRevision: initialPlan.planRevision + 1,
    });
  });

  it("refuses composition when the task inventory changed after authoring", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "wu-integration-target" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });
    const authoringFiles = (await readdir(authoring)).sort();
    const taskListPath = join(repository, ".arc", "active", "tasks-demo.md");
    const changedTasks = (await readFile(taskListPath, "utf8"))
      .replace("Implement the delivery contract.", "Implement the revised delivery contract.");
    await writeFile(taskListPath, changedTasks);

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "task-inventory-drift",
    });
    await expect(readdir(authoring)).resolves.toEqual(authoringFiles);
    await expect(readdir(join(common, "arc", "delivery", "plans"))).resolves.toEqual([]);
    expect(await readFile(taskListPath, "utf8")).toBe(changedTasks);
    expect(changedTasks).not.toContain("<!-- arc:delivery-plan:start -->");
  });

  it("refuses phase-aligned composition when task phase membership changed", async () => {
    await installTaskFixture(repository, true);
    await writeDesignInventory(repository);
    const taskListPath = join(repository, ".arc", "active", "tasks-demo.md");
    const onePhaseTasks = await readFile(taskListPath, "utf8");
    const phaseHeading = [
      "## **Phase beta:** Companion",
      "",
    ].join("\n");
    const twoPhaseTasks = onePhaseTasks.replace(
      "### `[ ]` **1.2 Implement the companion**",
      `${phaseHeading}### \`[ ]\` **1.2 Implement the companion**`,
    );
    await writeFile(taskListPath, twoPhaseTasks);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "wu-integration-target" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }, {
        chunkKey: "companion",
        title: "Companion",
        contract: "Publish the companion contract",
        designElementIds: [],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    });
    const authoringFiles = (await readdir(authoring)).sort();
    await writeFile(taskListPath, onePhaseTasks);

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "task-phase-drift",
    });
    await expect(readdir(authoring)).resolves.toEqual(authoringFiles);
    await expect(readdir(join(common, "arc", "delivery", "plans"))).resolves.toEqual([]);
    expect(await readFile(taskListPath, "utf8")).toBe(onePhaseTasks);
    expect(onePhaseTasks).not.toContain("<!-- arc:delivery-plan:start -->");
  });

  it("refuses uncovered implementation and verification membership at composition", async () => {
    await installTaskFixture(repository, true);
    await writeDesignInventory(repository);
    const author = async () => runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect((await author()).exitCode).toBe(0);
    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const firstMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(firstMap).toBeDefined();
    if (firstMap === undefined) return;
    const baseSlots = {
      projection: { kind: "wu-integration-target" },
      members: [{
        chunkKey: "partial",
        title: "Partial member",
        contract: "Publish part of the implementation",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "integration-only",
      }],
      seams: [],
    } as const;
    await fillSlots(join(authoring, firstMap), {
      ...baseSlots,
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "partial", sourceIds: ["1.1"] }],
      },
    });
    const uncovered = await runArc(["delivery", "compose", "--json"], repository);
    expect(uncovered.exitCode).toBe(1);
    expect(JSON.parse(uncovered.stdout)).toMatchObject({
      status: "refused",
      reason: "contribution-step-uncovered",
    });

    expect((await runArc(["delivery", "plan", "abandon", "--json"], repository)).exitCode).toBe(0);
    expect((await author()).exitCode).toBe(0);
    const secondMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(secondMap).toBeDefined();
    if (secondMap === undefined) return;
    await fillSlots(join(authoring, secondMap), {
      ...baseSlots,
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "partial", sourceIds: ["2.1"] }],
      },
    });
    const verification = await runArc(["delivery", "compose", "--json"], repository);
    expect(verification.exitCode).toBe(1);
    expect(JSON.parse(verification.stdout)).toMatchObject({
      status: "refused",
      reason: "verification-task-ineligible",
    });
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
      candidateProjectionDigest: null,
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

async function gitCommonDir(repository: string): Promise<string> {
  return resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
}

async function installTaskFixture(repository: string, includeSecondTask = false): Promise<void> {
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
    "# Metadata: demo",
    "",
    "- **State:** Active",
    "- **Branch:** feat/demo",
    "- **Task List:** `tasks-demo.md`",
    "",
  ].join("\n"));
  await writeFile(join(repository, ".arc", "active", "tasks-demo.md"), [
    "# Task List: Demo",
    "",
    "## Delivery Plan",
    "",
    "Plan pending authoring.",
    "",
    "## **Phase alpha:** Implementation",
    "",
    "### `[ ]` **1.1 Implement the contract**",
    "",
    "- _Goal:_ Implement the delivery contract.",
    "",
    ...(includeSecondTask ? [
      "### `[ ]` **1.2 Implement the companion**",
      "",
      "- _Goal:_ Implement the companion behavior.",
      "",
    ] : []),
    "## **Phase verify:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
    "",
  ].join("\n"));
}

async function writeDesignInventory(repository: string): Promise<void> {
  await writeFile(join(repository, "design-inventory.json"), `${JSON.stringify({
    artifacts: [{
      artifactId: "spec-demo.md",
      revisionDigest: DIGEST,
      form: "detailed",
      elements: [{ elementId: "deliverable-contract", semanticDigest: DIGEST }],
    }],
  })}\n`);
}

async function fillSlots(path: string, slots: unknown): Promise<void> {
  const current = await readFile(path, "utf8");
  const start = "<!-- arc:delivery-authoring-slots:start -->\n```json\n";
  const end = "\n```\n<!-- arc:delivery-authoring-slots:end -->";
  const from = current.indexOf(start);
  const to = current.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  await writeFile(path, `${current.slice(0, from + start.length)}${JSON.stringify(slots, null, 2)}${
    current.slice(to)
  }`);
}

function fieldSlots(run: DeliveryFieldRun, contributionIds: readonly string[]) {
  return {
    projection: { kind: "stack-to-main" },
    boundary: {
      kind: "explicit",
      segments: run.members.map((member, index) => {
        const contributionId = contributionIds[index];
        if (contributionId === undefined) throw new Error("expected contribution evidence");
        return {
          chunkKey: member.chunkKey,
          sourceIds: [contributionId],
        };
      }),
    },
    members: run.members.map((member, index) => ({
      chunkKey: member.chunkKey,
      title: member.title,
      contract: member.contract,
      designElementIds: index === 0 ? ["detailed:deliverable-contract"] : [],
      mainlineLandability: "independently-landable",
    })),
    seams: adjacentFieldSeams(run),
  };
}
