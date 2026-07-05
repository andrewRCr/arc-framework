import { describe, expect, it } from "vitest";

import { renderWorktreeEntryRecipe } from "../../../src/lib/harness/worktree-entry.js";

describe("renderWorktreeEntryRecipe", () => {
  it("leads with the fresh-session path and demotes live relocate to an escape hatch", () => {
    const recipe = renderWorktreeEntryRecipe({ worktreePath: "/repos/arc-framework.plan-widget" });

    expect(recipe).toContain("post-create provisioning and registered harness-dir copy have run");
    expect(recipe).toContain(
      "Primary — start a fresh session in `/repos/arc-framework.plan-widget` with your harness of choice, " +
        "then invoke `arc-session`",
    );
    expect(recipe).toContain("boots rich off the seeded handoff");
    expect(recipe).toContain("Escape hatch");
    expect(recipe).toContain("Claude Code's `EnterWorktree`");
  });

  it("emits no per-harness launch command", () => {
    const recipe = renderWorktreeEntryRecipe({ worktreePath: "/repos/arc framework.plan-widget" });

    expect(recipe).not.toContain("codex --cd");
    // The path is shown as plain data (raw), not shell-escaped for a command.
    expect(recipe).toContain("`/repos/arc framework.plan-widget`");
  });
});
