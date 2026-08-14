import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

describe("delivery lifecycle attachment ownership", () => {
  it("leaves planning entry with generate-tasks and integration attachments with ordinary integration", async () => {
    const [generate, integrate] = await Promise.all([
      readFile(join(ROOT, "packages/arc-framework/arc/system/workflows/arc/generate-tasks.template.md"), "utf8"),
      readFile(join(
        ROOT,
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ), "utf8"),
    ]);

    expect(generate.match(/unmarked provisional `## Delivery Plan`/gu)).toHaveLength(1);
    expect(integrate.match(/arc review chunking resolve -/gu)).toHaveLength(2);
    const phaseTwo = integrate.indexOf("## Phase 2");
    expect(phaseTwo).toBeGreaterThan(0);
    for (const match of integrate.matchAll(/arc review chunking resolve -/gu)) {
      expect(match.index).toBeLessThan(phaseTwo);
    }

    const attachment = "Invoke the typed delivery terminal post-merge attachment exactly once";
    const attachmentIndex = integrate.indexOf(attachment);
    expect(integrate.match(new RegExp(attachment, "gu"))).toHaveLength(1);
    expect(attachmentIndex).toBeGreaterThan(phaseTwo);
    expect(attachmentIndex).toBeLessThan(integrate.indexOf("arc user close", attachmentIndex));
  });
});
