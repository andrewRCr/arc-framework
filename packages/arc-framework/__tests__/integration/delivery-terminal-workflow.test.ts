import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

describe("delivery terminal integration handoff", () => {
  it("keeps package/project parity and one checkpoint interlock before merge and cleanup", async () => {
    const [packaged, installed] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    expect(packaged).toMatch(/methods:[\s\S]*- validate-criteria/u);
    expect(packaged).not.toContain("arc delivery terminal attach");
    expect(packaged.split("arc integrate checkpoint {name} --json")).toHaveLength(2);
    expect(packaged.split("> `integration-interlock`: Stop after the ready evidence")).toHaveLength(2);
    const checkpoint = packaged.indexOf("arc integrate checkpoint {name} --json");
    const interlock = packaged.indexOf("> `integration-interlock`: Stop after the ready evidence", checkpoint);
    const merge = packaged.indexOf("arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json");
    const resume = packaged.indexOf("**Skip the merge when the PR is already merged**");
    const close = packaged.indexOf("arc user close {name}", merge);
    const teardown = packaged.indexOf("arc teardown <wu-name>", close);
    for (const position of [checkpoint, interlock, merge, resume, close, teardown]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(checkpoint).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(merge);
    expect(merge).toBeLessThan(close);
    expect(resume).toBeLessThan(close);
    expect(close).toBeLessThan(teardown);
    const terminalRemedy = packaged.indexOf("`retarget` or `reopen-and-retarget`");
    const remedyInvocation = packaged.indexOf("remedy.argv", terminalRemedy);
    const verification = packaged.indexOf("`verify-terminal-member`", checkpoint);
    const criteriaFirepoint = packaged.indexOf("[`validate-criteria`][validate-criteria]", verification);
    const baseMerge = packaged.indexOf("arc base merge --expected-base", checkpoint);
    for (const position of [terminalRemedy, remedyInvocation, verification, criteriaFirepoint]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(terminalRemedy).toBeLessThan(remedyInvocation);
    expect(verification).toBeLessThan(criteriaFirepoint);
    expect(criteriaFirepoint).toBeLessThan(baseMerge);
  });
});
