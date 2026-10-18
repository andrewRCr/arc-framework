/** Registered store verbs refuse safely until their capability flips. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc, runArcNoTty } from "./helpers.js";
import { InboxResultSchema } from "../../src/lib/inbox/types.js";
import { RouteResultSchema } from "../../src/lib/inbox/route.js";
import { ErrandQueueResultSchema } from "../../src/lib/inbox/queue.js";
import { HandoffWriteResultSchema } from "../../src/lib/handoff/write-schema.js";

describe("dormant store command registrations", () => {
  let root: string;
  beforeEach(async () => {
    root = await createTempRepo();
    expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
  });
  afterEach(async () => { await cleanupTempDir(root); });
  it.each([
    { args: ["inbox", "personal", "--json"], serving: "arc user inbox-list --target", schema: InboxResultSchema },
    { args: ["route", "--to", "project"], serving: "Binding: carrying out outcomes", schema: RouteResultSchema },
    { args: ["route", "12345678", "--from", "personal", "--expected-version", "v1:1234567890abcdef", "--to", "project"], serving: "Binding: carrying out outcomes", schema: RouteResultSchema },
    { args: ["locus", "release"], serving: "arc park", schema: undefined },
    { args: ["locus", "release", "example"], serving: "arc teardown", schema: undefined },
    { args: ["errand", "queue", "--json"], serving: "arc user inbox-mark-execute-bound", schema: ErrandQueueResultSchema },
    { args: ["errand", "queue", "set", "-"], serving: "arc user inbox-mark-execute-bound", schema: ErrandQueueResultSchema },
    { args: ["handoff", "write", "-"], serving: "SESSION-NOTES", schema: HandoffWriteResultSchema },
  ])("refuses $args with its serving path", async ({ args, serving, schema }) => {
    const result = await runArcNoTty(["--no-input", ...args], root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("unsupported");
    expect(result.stdout + result.stderr).toContain(serving);
    if (schema !== undefined) expect(schema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    if (args[0] === "handoff") expect(JSON.parse(result.stdout)).toMatchObject({
      status: "refused", refusal: { code: "unsupported", class: "terminal" },
    });
  });
  it("keeps locus inspection invocable without a subcommand", async () => {
    const result = await runArc(["locus", "--json"], root);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "locus", ok: true });
  });
});
