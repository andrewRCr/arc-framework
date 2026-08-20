import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

describe("delivery terminal integration attachment", () => {
  it("keeps package/project parity and places one total attachment between merge confirmation and close", async () => {
    const [packaged, installed] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    const attachment = "Invoke the typed delivery terminal post-merge attachment exactly once";
    expect(packaged.split(attachment)).toHaveLength(2);
    expect(packaged.split("arc delivery terminal attach - --json")).toHaveLength(2);
    const merge = packaged.indexOf("arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json");
    const resume = packaged.indexOf("**Skip the merge when the PR is already merged**");
    const attach = packaged.indexOf(attachment);
    const close = packaged.indexOf("arc user close {name}", attach);
    const teardown = packaged.indexOf("arc teardown <wu-name>", close);
    for (const position of [merge, resume, attach, close, teardown]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(merge).toBeLessThan(attach);
    expect(resume).toBeLessThan(attach);
    expect(attach).toBeLessThan(close);
    expect(close).toBeLessThan(teardown);
    expect(packaged.slice(attach, close)).toContain("workUnitId: {name}");
    expect(packaged.slice(attach, close)).toMatch(/attached.*already-attached.*not-applicable.*blocked/su);
    expect(packaged.slice(attach, close)).toMatch(/no reservation.*no authorization/su);
  });
});
