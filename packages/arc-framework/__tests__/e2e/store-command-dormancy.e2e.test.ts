/** Registered store verbs refuse safely until their capability flips. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc, runArcNoTty } from "./helpers.js";
import { InboxResultSchema } from "../../src/lib/inbox/types.js";
import { RouteResultSchema } from "../../src/lib/inbox/route.js";
import { ErrandQueueResultSchema } from "../../src/lib/inbox/queue.js";
import { HandoffWriteResultSchema } from "../../src/lib/handoff/write-schema.js";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { cohortCloseStep, cohortRemoveStep, errandQueueStep, handoffWriteStep, inboxListStep, routeStep } from "../../src/lib/store/pre-flip-steps.js";

describe("dormant store command registrations", () => {
  let root: string;
  beforeEach(async () => {
    root = await createTempRepo();
    expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
  });
  afterEach(async () => { await cleanupTempDir(root); });
  it.each([
    { args: ["inbox", "personal", "--json"], serving: inboxListStep("personal"), schema: InboxResultSchema },
    { args: ["inbox", "personal", "--target", "example", "--json"], serving: inboxListStep("personal", "example"), schema: InboxResultSchema },
    { args: ["inbox", "project", "--json"], serving: inboxListStep("project"), schema: InboxResultSchema },
    { args: ["inbox", "example", "--json"], serving: inboxListStep("example"), schema: InboxResultSchema },
    { args: ["route", "--to", "project"], serving: routeStep(), schema: RouteResultSchema },
    { args: ["route", "12345678", "--from", "personal", "--expected-version", "v1:1234567890abcdef", "--to", "project"], serving: routeStep(), schema: RouteResultSchema },
    { args: ["locus", "release"], serving: "arc park", schema: undefined },
    { args: ["locus", "release", "example"], serving: "arc teardown", schema: undefined },
    { args: ["errand", "queue", "--json"], serving: errandQueueStep("read"), schema: ErrandQueueResultSchema },
    { args: ["errand", "queue", "set", "-"], serving: errandQueueStep("set"), schema: ErrandQueueResultSchema },
    { args: ["handoff", "write", "-"], serving: handoffWriteStep(), schema: HandoffWriteResultSchema },
    { args: ["cohort", "close", "example"], serving: cohortCloseStep(), schema: undefined },
    { args: ["cohort", "close", "example", "--json"], serving: cohortCloseStep(), schema: undefined },
    { args: ["cohort", "remove", "example"], serving: cohortRemoveStep(), schema: undefined },
    { args: ["cohort", "remove", "example", "--json"], serving: cohortRemoveStep(), schema: undefined },
  ])("refuses $args, naming its pre-flip step", async ({ args, serving, schema }) => {
    useInRepoStore();
    const result = await runArcNoTty(["--no-input", ...args], root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("unsupported");
    expect(result.stdout + result.stderr).toContain(serving);
    if (schema !== undefined) expect(schema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    if (args[0] === "handoff" || (args[0] === "cohort" && args.includes("--json"))) expect(JSON.parse(result.stdout)).toMatchObject({
      status: "refused", refusal: { code: "unsupported", class: "terminal" },
    });
  });
  it("keeps locus inspection invocable without a subcommand", async () => {
    const result = await runArc(["locus", "--json"], root);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "locus", ok: true });
  });
});
