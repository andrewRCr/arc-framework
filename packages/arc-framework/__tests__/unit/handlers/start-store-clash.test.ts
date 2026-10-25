/** A former operand cannot bypass a clash on its selected holder's current name. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleStoreStart } from "../../../src/handlers/start-store.js";
import { StartCommandInputSchema } from "../../../src/handlers/start.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { resolveProcessInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { recordKey } from "../../helpers/store/model.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
const previousExit = process.exitCode;
let output = "";
beforeEach(() => {
  vi.resetAllMocks(); process.exitCode = undefined; output = "";
  const capture = (chunk: unknown) => { output += String(chunk); return true; };
  vi.spyOn(process.stdout, "write").mockImplementation(capture);
  vi.spyOn(process.stderr, "write").mockImplementation(capture);
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = previousExit; });
it("refuses a former operand's current-name clash before started-work dispatch", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "active" });
  const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "example" })),
    "# Cohort: example\n\n**Purpose:** Coordinate work.\n");
  const stored = h.store.state.records.get(recordKey(primary.reference));
  if (stored === undefined) throw new Error("Missing fixture primary");
  stored.formerSlugs.push("former");
  const before = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  const io = { ...createUserIOContext(), exec: scriptGitExec([]).exec };
  const executor = buildExecutorContext({ cwd: "/repo", io, store: h.store, identity: "test-user", teamMode: false, internalTemplateDir: "/templates",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  let admitted = false;
  await handleStoreStart(StartCommandInputSchema.parse({ name: "former", here: true }), {
    cwd: "/repo", identity: "test-user", io, executor,
    interaction: resolveProcessInteractionContext({ noInput: true, machineReadable: false, yes: "absent" }),
    admitColdStart: async () => { admitted = true; },
  });
  expect(admitted).toBe(false); expect(process.exitCode).toBe(1);
  expect(output).toContain("work unit `example`"); expect(output).toContain("cohort `example`");
  if (primary.reference.owner.type === "person" || group.reference.owner.type === "person") throw new Error("Expected generation identities");
  expect(output).toContain(primary.reference.owner.uid); expect(output).toContain(group.reference.owner.uid);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(before);
  expect(lifecycleSuccess(await h.store.read({ reference: group.reference }))).toEqual(group);
});
