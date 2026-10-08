import { describe, expect, it } from "vitest";

describe("viewer import boundary", () => {
  it("keeps compatibility exports pointed at the relocated lib symbols", async () => {
    const publicTypes = await import("../../../src/commands/view/types.js");
    const publicFormat = await import("../../../src/commands/view/format.js");
    expect(publicTypes.VIEW_KINDS).toContain("tasks");
    expect(publicFormat.prepareViewDocument).toBeTypeOf("function");
    expect(publicFormat.formatArtifactHeader("spec", "feature", new Date(2026, 0, 2, 9, 5)))
      .toBe("spec · feature · rendered 09:05");
  });
});
