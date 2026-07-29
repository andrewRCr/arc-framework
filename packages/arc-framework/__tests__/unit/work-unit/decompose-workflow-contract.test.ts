import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);
const projectWorkflow = readFileSync(
  new URL("../../../../../.arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);

describe("decompose workflow contract", () => {
  it("documents only the complete read-only command surface", () => {
    expect(workflow).toContain("--preflight");
    expect(workflow).not.toContain("--cut-map");
    expect(workflow).not.toContain("--finalize");
    expect(workflow).not.toContain("--continuation");
    expect(workflow).not.toContain("--discard");
    expect(workflow).not.toContain("--handoff");
  });

  it("states that preflight grants no mutation authority", () => {
    expect(workflow).toContain("read-only");
    expect(workflow).toContain("grants no mutation");
    expect(workflow).not.toContain("`workflow-interlock`");
  });

  it("stops before any authored map or repository transition", () => {
    expect(workflow).toContain("Do not author a completed map");
    expect(workflow).toContain("Do not create or modify");
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
