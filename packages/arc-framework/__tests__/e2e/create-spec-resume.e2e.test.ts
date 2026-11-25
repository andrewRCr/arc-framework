import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta } from "../helpers/store-lifecycle-fixture.js";

it("resumes task generation with the Class approved during spec review", async () => {
  const { repo, run } = await lifecycleRepository();
  const approvedClass = "Heavy";
  await seedWorkUnit(repo, "example", {
    identity: LIFECYCLE_IDENTITY, bind: repo,
    meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "create-spec",
      design: ["draft-example.md"], workClass: "Light", nextAction: "Finish spec review" },
    records: [
      { kind: "work-item/draft", content: "# Draft: example\n" },
      { kind: "work-item/spec", content: "# Specification: example\n" },
    ],
  });

  // The spec is already saved. Follow the installed workflow's meta commands in order,
  // stopping at the first command after which a new session can enter task generation.
  const workflow = await readFile(join(repo, ".arc/system/workflows/arc/create-spec.md"), "utf8");
  const finalize = (workflow.split(/^## Finalize\b/mu)[1] ?? "").replace(/\s+/gu, " ");
  const commands = [...finalize.matchAll(/`arc (?:finalize create-spec|repoint-design spec-finalized|set-stage generate-tasks)\b[^`]*`/gu)];
  for (const [command] of commands) {
    const args = command.slice(5, -1).replace("<Class>", approvedClass).split(/\s+/u);
    const result = await run(args);
    expect(result.exitCode, result.output).toBe(0);
    const { currentWorkflow, workClass } = ParsedMetaRecordSchema.parse((await readLifecycleMeta(repo, "example")).fields);
    if (currentWorkflow !== "generate-tasks") continue;

    const resumed = await run(["status", "--session-init", "--json"]);
    expect(resumed.exitCode, resumed.output).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ derivedLocusState: { ok: true, value: {
      entering: { kind: "selected", row: { context: { stage: "generate-tasks" } } },
    } } });
    expect(workClass, `Class at task-generation resume after arc ${args.join(" ")}`).toBe(approvedClass);
    expect(commands.filter(([step]) => /repoint-design|set-stage/u.test(step))).toHaveLength(1);
    return;
  }
  throw new Error("Spec finalization never advanced to generate-tasks");
}, LIFECYCLE_TIMEOUT_MS);
