/** Built-CLI coverage for the delivery authoring command group. */

import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";
import {
  ROLLING_FIELD_RUN,
  SEVEN_MEMBER_FIELD_RUN,
  adjacentFieldSeams,
  type DeliveryFieldRun,
} from "../fixtures/delivery-field-runs.js";
import { deliveryFourMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";

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
    const entryHelp = await runArc(["delivery", "entry", "inspect", "--help"], repository);
    expect(entryHelp).toMatchObject({ exitCode: 0 });
    expect(entryHelp.stdout).toContain("--input <path>");
    await writeFile(join(repository, "invalid-entry.json"), "{}\n");
    const invalidEntry = await runArc([
      "delivery", "entry", "inspect", "--input", "invalid-entry.json", "--json",
    ], repository);
    expect(invalidEntry.exitCode).toBe(1);
    expect(JSON.parse(invalidEntry.stdout)).toMatchObject({
      command: "delivery entry inspect",
      status: "refused",
      reason: "invalid-command-input",
    });
    await expect(runArc(["delivery", "plan", "from-tasks", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0, stdout: expect.stringContaining("--task-list <path>") });
    const branchHelp = await runArc(["delivery", "plan", "from-branch", "--help"], repository);
    expect(branchHelp).toMatchObject({ exitCode: 0 });
    expect(branchHelp.stdout).toContain("--base <commit-ish>");
    const composeHelp = await runArc(["delivery", "compose", "--help"], repository);
    expect(composeHelp).toMatchObject({ exitCode: 0 });
    expect(composeHelp.stdout).toContain("--landed-prefix <json>");
    const malformedPrefix = await runArc([
      "delivery", "compose", "--landed-prefix", "not-json", "--json",
    ], repository);
    expect(malformedPrefix.exitCode).toBe(1);
    expect(JSON.parse(malformedPrefix.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "invalid-command-input",
    });
    await expect(runArc(["delivery", "plan", "abandon", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
    for (const command of [
      ["eligibility", "prepare"], ["eligibility", "close"], ["materialize"], ["publish"],
      ["position"], ["land", "prepare"], ["land", "apply"], ["reconcile"], ["rewrite"], ["rematerialize"],
      ["terminal", "prepare"], ["terminal", "attach"], ["teardown"],
    ]) {
      const help = await runArc(["delivery", ...command, "--help"], repository);
      expect(help.exitCode, help.stderr).toBe(0);
      expect(help.stdout).toContain("<input>");
    }
    await writeFile(join(repository, "invalid-execution.json"), "{}\n");
    const invalidExecution = await runArc([
      "delivery", "position", "invalid-execution.json", "--json",
    ], repository);
    expect(invalidExecution.exitCode).toBe(1);
    expect(JSON.parse(invalidExecution.stdout)).toMatchObject({
      command: "delivery position",
      status: "refused",
      reason: "invalid-command-input",
    });
    const inventorySchema = await runArc([
      "delivery", "plan", "inventory", "schema", "--json",
    ], repository);
    expect(inventorySchema.exitCode, inventorySchema.stderr).toBe(0);
    expect(JSON.parse(inventorySchema.stdout)).toMatchObject({
      command: "delivery plan inventory schema",
      status: "ok",
      value: {
        id: "delivery-design-inventory-input",
        version: 1,
        schema: {
          $id: "delivery-design-inventory-input.schema.json",
          additionalProperties: false,
          required: ["artifacts"],
        },
      },
    });
  });

  it("parses every documented delivery invocation through the built CLI", async () => {
    const workflows = await Promise.all([
      readFile(resolve(import.meta.dirname, "../../arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(
        import.meta.dirname,
        "../../arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ), "utf8"),
    ]);
    const invocations = workflows.flatMap((workflow) => workflow.match(/^arc delivery .+ --json$/gmu) ?? []);
    expect(invocations.length).toBeGreaterThan(0);
    for (const invocation of invocations) {
      const args = invocation.split(" ").slice(1);
      if (invocation.startsWith("arc delivery entry inspect ")) {
        expect(invocation).toContain("--input - --json");
      } else {
        expect(invocation).not.toContain("--input");
        expect(args).toContain("-");
      }
      const result = await runArcWithStdin(args, repository, "{}\n");
      expect(result.stderr).not.toMatch(/unknown option|missing required argument/iu);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "refused",
        reason: "invalid-command-input",
      });
    }
  });

  it("selects exact native arms and degrades through the built CLI", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const nativeMembers = state.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest!.changeRequestId,
      headRef: member.ref!.replace(/^refs\/heads\//u, ""),
      headSha: member.coordinates!.head,
      baseRef: index === 0 ? "main" : state.members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
      headRepository: "owner/repo",
    }));
    const common = await gitCommonDir(repository);
    const plans = join(common, "arc", "delivery", "plans");
    const states = join(common, "arc", "delivery", "state");
    await Promise.all([mkdir(plans, { recursive: true }), mkdir(states, { recursive: true })]);
    await Promise.all([
      writeFile(join(plans, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`),
      writeFile(join(states, `${plan.planId}.json`), `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-state-store/v1",
        planId: plan.planId,
        revision: 1,
        value: state,
      })}\n`),
    ]);
    const stackResponse = JSON.stringify([{
      number: 7,
      base: { ref: nativeMembers[0]!.baseRef },
      pull_requests: nativeMembers.map((member) => ({
        number: Number(member.changeRequestId),
        head: { ref: member.headRef, sha: member.headSha },
        base: { ref: member.baseRef },
      })),
    }]);
    const flattenedStackResponse = JSON.stringify([{
      number: 7,
      base: { ref: nativeMembers[0]!.baseRef },
      pull_requests: nativeMembers.map((member) => ({
        number: Number(member.changeRequestId),
        head: { ref: member.headRef, sha: member.headSha },
        base: { ref: "main" },
      })),
    }]);
    const requestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: member.baseRef, repo: { full_name: "owner/repo" } },
    }));
    const flattenedRequestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: "main", repo: { full_name: "owner/repo" } },
    }));
    const mergeResponse = JSON.stringify({
      status: "pending",
      details: {
        uuid: "native-effect-1",
        expected_head_sha: nativeMembers.at(-1)!.headSha,
        merge_method: "merge",
        merge_action: "direct_merge",
      },
    });
    const fakeBin = join(repository, "fake-bin");
    const fakeGh = join(fakeBin, "gh");
    const counter = join(repository, "fake-gh-counter");
    await mkdir(fakeBin);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "if [ \"${ARC_FAKE_GH_MODE:-registered}\" = \"unsupported\" ]; then",
      "  echo 'HTTP 404' >&2",
      "  exit 1",
      "fi",
      "if [ \"${ARC_FAKE_GH_MODE:-registered}\" = \"degrade\" ]; then",
      "  case \"$*\" in *unstack*) printf '{}\\n'; exit 0;; esac",
      "  if [ ! -f \"$ARC_FAKE_GH_COUNTER\" ]; then",
      "    : > \"$ARC_FAKE_GH_COUNTER\"",
      `    printf '%s\\n' '${stackResponse}'`,
      "  else",
      "    printf '[]\\n'",
      "  fi",
      "  exit 0",
      "fi",
      "case \"$2\" in",
      "  repos/owner/repo/stacks)",
      `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "flattened" ]; then printf '%s\\n' '${flattenedStackResponse}'; else printf '%s\\n' '${stackResponse}'; fi`,
      "    ;;",
      ...nativeMembers.flatMap((member, index) => [
        `  repos/owner/repo/pulls/${member.changeRequestId})`,
        `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "flattened" ]; then printf '%s\\n' '${flattenedRequestResponses[index]}'; else printf '%s\\n' '${requestResponses[index]}'; fi`,
        "    ;;",
      ]),
      `  repos/owner/repo/pulls/${nativeMembers.at(-1)!.changeRequestId}/merge-async)`,
      `    printf '%s\\n' '${mergeResponse}'`,
      "    ;;",
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
    const request = {
      planId: plan.planId,
      facts: {
        target: state.target,
        members: state.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
          deliverableId, ref, changeRequest, coordinates,
        })),
        landedDeliverableIds: [],
      },
      repository: "owner/repo",
      mergeStrategy: "merge",
      mergeAction: "direct",
      explicitAtomic: false,
      members: nativeMembers,
    };

    const singleton = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify(request)}\n`,
      { env },
    );
    expect(singleton.exitCode, singleton.stderr).toBe(0);
    expect(JSON.parse(singleton.stdout)).toMatchObject({
      status: "selected",
      arm: "linked-single",
      members: nativeMembers.slice(0, 1).map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const atomic = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify({ ...request, explicitAtomic: true })}\n`,
      { env },
    );
    expect(atomic.exitCode, atomic.stderr).toBe(0);
    const atomicResult = JSON.parse(atomic.stdout) as {
      status: "selected";
      arm: "linked-atomic";
      members: { deliverableId: string; changeRequestId: string; headSha: string }[];
      recommendedActionText: string;
    };
    expect(atomicResult).toMatchObject({
      status: "selected",
      arm: "linked-atomic",
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const unsupported = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify({ ...request, explicitAtomic: true })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "unsupported" } },
    );
    expect(unsupported.exitCode, unsupported.stderr).toBe(0);
    expect(JSON.parse(unsupported.stdout)).toMatchObject({ status: "selected", arm: "unlinked" });

    const operationId = "native-operation-1";
    const prepareRequest = {
      planId: plan.planId,
      operationId,
      selection: {
        status: atomicResult.status,
        arm: atomicResult.arm,
        members: atomicResult.members,
        recommendedActionText: atomicResult.recommendedActionText,
      },
      facts: request.facts,
      repository: "owner/repo",
      baseRef: "main",
      targetRef: "refs/heads/main",
      treeRoot: repository,
    };
    const flattenedPrepare = await runArcWithStdin(
      ["delivery", "native", "land-prepare", "-", "--json"],
      repository,
      `${JSON.stringify(prepareRequest)}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "flattened" } },
    );
    expect(flattenedPrepare.exitCode, flattenedPrepare.stderr).toBe(1);
    expect(JSON.parse(flattenedPrepare.stdout)).toMatchObject({
      status: "blocked",
      reason: "member-not-ready",
    });

    const prepared = await runArcWithStdin(
      ["delivery", "native", "land-prepare", "-", "--json"],
      repository,
      `${JSON.stringify(prepareRequest)}\n`,
      { env },
    );
    expect(prepared.exitCode, prepared.stderr).toBe(0);
    expect(JSON.parse(prepared.stdout)).toMatchObject({
      status: "prepared",
      operationId,
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const submitRequest = {
      planId: plan.planId,
      operationId,
      request: {
        repository: "owner/repo",
        topChangeRequestId: nativeMembers.at(-1)!.changeRequestId,
        topHeadSha: nativeMembers.at(-1)!.headSha,
        mergeAction: "direct_merge",
        mergeMethod: "merge",
      },
      treeRoot: repository,
    };
    const flattenedSubmit = await runArcWithStdin(
      ["delivery", "native", "land-submit", "-", "--json"],
      repository,
      `${JSON.stringify(submitRequest)}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "flattened" } },
    );
    expect(flattenedSubmit.exitCode, flattenedSubmit.stderr).toBe(1);
    expect(JSON.parse(flattenedSubmit.stdout)).toMatchObject({
      status: "blocked",
      reason: "native-stack-moved",
    });

    const submitted = await runArcWithStdin(
      ["delivery", "native", "land-submit", "-", "--json"],
      repository,
      `${JSON.stringify(submitRequest)}\n`,
      { env },
    );
    expect(submitted.exitCode, submitted.stderr).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "pending",
      effectIdentity: "native-effect-1",
    });

    const degraded = await runArcWithStdin(
      ["delivery", "native", "unlink", "-", "--json"],
      repository,
      `${JSON.stringify({ repository: "owner/repo", members: nativeMembers })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "degrade", ARC_FAKE_GH_COUNTER: counter } },
    );
    expect(degraded.exitCode, degraded.stderr).toBe(0);
    expect(JSON.parse(degraded.stdout)).toMatchObject({ status: "unlinked" });
  });

  it("reaches terminal readiness and idempotent attachment through the built CLI", async () => {
    const targetHead = await git(repository, ["rev-parse", "HEAD"]);
    const targetTree = await git(repository, ["rev-parse", `${targetHead}^{tree}`]);
    await writeFile(join(repository, "terminal-contribution.txt"), "terminal contribution\n");
    await git(repository, ["add", "--", "terminal-contribution.txt"]);
    await git(repository, ["commit", "-m", "add terminal contribution"]);
    const controlHead = await git(repository, ["rev-parse", "HEAD"]);
    const controlTree = await git(repository, ["rev-parse", `${controlHead}^{tree}`]);
    await git(repository, ["remote", "add", "origin", repository]);

    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      target: {
        ref: "refs/heads/protected",
        coordinates: { head: targetHead, tree: targetTree },
      },
      members: initial.members.map((member) => ({
        deliverableId: member.deliverableId,
        ref: null,
        changeRequest: null,
        coordinates: null,
      })),
    };
    const common = await gitCommonDir(repository);
    const plans = join(common, "arc", "delivery", "plans");
    const states = join(common, "arc", "delivery", "state");
    await Promise.all([
      mkdir(plans, { recursive: true }),
      mkdir(states, { recursive: true }),
      mkdir(join(repository, ".arc", "active"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(plans, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`),
      writeFile(join(states, `${plan.planId}.json`), `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-state-store/v1",
        planId: plan.planId,
        revision: 1,
        value: state,
      })}\n`),
      writeFile(join(repository, ".arc", "active", "meta-delivery-plan-record.md"), [
        "# Metadata: delivery-plan-record",
        "",
        "- **State:** Active",
        "- **Owner:** test-user",
        "- **Branch:** main",
        "- **Task List:** `tasks-delivery-plan-record.md`",
        "",
      ].join("\n")),
    ]);

    const terminalRequest = JSON.stringify({
      number: 99,
      state: "closed",
      merged: true,
      draft: false,
      head: { ref: "main", sha: controlHead, repo: { full_name: "owner/repo" } },
      base: { ref: "protected", repo: { full_name: "owner/repo" } },
    });
    const fakeBin = join(repository, "fake-bin");
    const fakeGh = join(fakeBin, "gh");
    await mkdir(fakeBin);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "case \"$2\" in",
      "  repos/owner/repo/pulls/99)",
      `    printf '%s\\n' '${terminalRequest}'`,
      "    ;;",
      "  repos/owner/repo/git/ref/heads/protected)",
      `    if [ "\${ARC_FAKE_GH_MODE:-before}" = "after" ]; then printf '%s\\n' '{"object":{"sha":"${controlHead}"}}'; else printf '%s\\n' '{"object":{"sha":"${targetHead}"}}'; fi`,
      "    ;;",
      `  repos/owner/repo/git/commits/${targetHead})`,
      `    printf '%s\\n' '{"tree":{"sha":"${targetTree}"}}'`,
      "    ;;",
      `  repos/owner/repo/git/commits/${controlHead})`,
      `    printf '%s\\n' '{"tree":{"sha":"${controlTree}"}}'`,
      "    ;;",
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

    const prepared = await runArcWithStdin(
      ["delivery", "terminal", "prepare", "-", "--json"],
      repository,
      `${JSON.stringify({
        repository: "owner/repo",
        remote: "origin",
        controlRef: "refs/heads/main",
        controlCheckoutPath: repository,
        protectedTargetRef: "refs/heads/protected",
      })}\n`,
      { env },
    );
    expect(prepared.exitCode, prepared.stderr).toBe(0);
    expect(JSON.parse(prepared.stdout)).toMatchObject({ status: "terminal-ready" });

    const attachInput = `${JSON.stringify({
      repository: "owner/repo",
      remote: "origin",
      retainedControlRef: "refs/heads/main",
      changeRequestId: "99",
    })}\n`;
    const attached = await runArcWithStdin(
      ["delivery", "terminal", "attach", "-", "--json"],
      repository,
      attachInput,
      { env: { ...env, ARC_FAKE_GH_MODE: "after" } },
    );
    expect(attached.exitCode, attached.stderr).toBe(0);
    expect(JSON.parse(attached.stdout)).toMatchObject({
      status: "attached",
      state: {
        value: {
          target: { coordinates: { head: controlHead, tree: controlTree } },
          members: expect.arrayContaining([expect.objectContaining({
            ref: "refs/heads/main",
            changeRequest: { providerId: "github", changeRequestId: "99" },
            coordinates: { base: targetHead, head: controlHead, tree: controlTree },
          })]),
        },
      },
    });

    const repeated = await runArcWithStdin(
      ["delivery", "terminal", "attach", "-", "--json"],
      repository,
      attachInput,
      { env: { ...env, ARC_FAKE_GH_MODE: "after" } },
    );
    expect(repeated.exitCode, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({ status: "already-attached" });
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

  it("inspects reviewed provisional entry without creating delivery records", async () => {
    await installTaskFixture(repository);
    await writeFile(join(repository, "delivery-entry.json"), `${JSON.stringify({
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "confirmed-reviewed",
    })}\n`);
    const common = await gitCommonDir(repository);
    const deliveryNamespace = join(common, "arc", "delivery");
    await expect(readdir(deliveryNamespace)).rejects.toMatchObject({ code: "ENOENT" });

    const inspected = await runArc([
      "delivery", "entry", "inspect", "--input", "delivery-entry.json", "--json",
    ], repository);
    expect(inspected.exitCode, inspected.stderr).toBe(0);
    expect(JSON.parse(inspected.stdout)).toMatchObject({
      command: "delivery entry inspect",
      status: "canonicalize-provisional",
      nextAction: "canonicalize-provisional",
      authoringMapId: null,
      laterEntryCostText: expect.stringContaining("later entry"),
    });
    await expect(readdir(deliveryNamespace)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts a coherent explicit task list before the meta pointer exists and refuses invalid loci", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const metaPath = join(repository, ".arc", "active", "meta-demo.md");
    const meta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, meta.replace("`tasks-demo.md`", "[none]"));

    for (const candidate of [
      resolve(repository, ".arc/active/tasks-demo.md"),
      "../tasks-demo.md",
      ".arc/active/tasks-other.md",
    ]) {
      const refused = await runArc([
        "delivery", "plan", "from-tasks",
        "--task-list", candidate,
        "--design-inventory", "design-inventory.json",
        "--json",
      ], repository);
      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout)).toMatchObject({
        command: "delivery plan from-tasks",
        status: "refused",
        reason: "task-list-path-invalid",
      });
    }
    const common = await gitCommonDir(repository);
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });

    const taskPath = join(repository, ".arc", "active", "tasks-demo.md");
    const taskList = await readFile(taskPath, "utf8");
    await writeFile(taskPath, taskList.replace("`spec-demo.md`", "`spec-other.md`"));
    const incoherent = await runArc([
      "delivery", "plan", "from-tasks",
      "--task-list", ".arc/active/tasks-demo.md",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(incoherent.exitCode).toBe(1);
    expect(JSON.parse(incoherent.stdout)).toMatchObject({
      status: "refused",
      reason: "task-list-design-incoherent",
    });
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(taskPath, taskList);
    const authored = await runArc([
      "delivery", "plan", "from-tasks",
      "--task-list", ".arc/active/tasks-demo.md",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(authored.exitCode, authored.stderr).toBe(0);
    expect(JSON.parse(authored.stdout)).toMatchObject({
      status: "ok",
      value: { taskListPath: ".arc/active/tasks-demo.md" },
    });
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
      candidateOutcome: { outcome: "accepted"; stateBinding: null } | null;
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
      candidateOutcome: { outcome: "accepted", stateBinding: null },
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
      const filledMap = await readFile(mapPath, "utf8");
      const authorSlots = filledMap.slice(
        filledMap.indexOf("<!-- arc:delivery-authoring-slots:start -->"),
        filledMap.indexOf("<!-- arc:delivery-authoring-slots:end -->"),
      );
      expect(authorSlots).not.toMatch(/"status"\s*:/u);
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
    expect(tasks).toMatch(/\| 1\s+\| Implementation\s+\| `implementation`\s+\|/u);
    expect(tasks).toMatch(/\| 1\s+\| `1\.1`\s+\| `detailed:deliverable-contract`\s+\|/u);
    const renderedPlan = tasks.slice(
      tasks.indexOf("<!-- arc:delivery-plan:start -->"),
      tasks.indexOf("<!-- arc:delivery-plan:end -->") + "<!-- arc:delivery-plan:end -->".length,
    );
    expect(renderedPlan).not.toContain("Status");

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
      candidateOutcome: null,
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
    "- **Design:** `spec-demo.md`",
    "- **Task List:** `tasks-demo.md`",
    "",
  ].join("\n"));
  await writeFile(join(repository, ".arc", "active", "tasks-demo.md"), [
    "# Task List: Demo",
    "",
    "- **Design:** `spec-demo.md`",
    "",
    "---",
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
