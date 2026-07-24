/** Session-init workflow contract for read-only current-WU reconcile surfacing. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOWS = [
  join(
    ROOT,
    "packages",
    "arc-framework",
    "arc",
    "system",
    "workflows",
    "arc",
    "session-lifecycle",
    "session-init.template.md",
  ),
  join(ROOT, ".arc", "system", "workflows", "arc", "session-lifecycle", "session-init.md"),
];

describe("session-init current-WU reconcile workflow", () => {
  it.each(WORKFLOWS)("renders only the probe-owned advisory in %s", async (path) => {
    const content = await readFile(path, "utf8");

    expect(content).toContain(
      '`currentWuReconcile.value.recommendedAction == "surface"`',
    );
    expect(content).toContain(
      "**Current WU reconcile:** {currentWuReconcile.value.recommendedPromptText}",
    );
    expect(content).toContain("do not apply tracked edits during\n  session initialization");
  });
});
