import { describe, expect, it } from "vitest";

import { renderWorktreeEntryRecipe } from "../../../src/lib/harness/worktree-entry.js";

describe("renderWorktreeEntryRecipe", () => {
  it("renders the common worktree-entry invariant and known harness recipes", () => {
    const recipe = renderWorktreeEntryRecipe({ worktreePath: "/repos/arc-framework.plan-widget" });

    expect(recipe).toContain("post-create provisioning and registered harness-dir copy have run");
    expect(recipe).toContain("Claude Code: use `EnterWorktree`");
    expect(recipe).toContain(
      "Codex CLI: open a fresh terminal or end this session, then run `codex --cd /repos/arc-framework.plan-widget`",
    );
    expect(recipe).toContain("and invoke `$arc-session`");
    expect(recipe).toContain("Other harnesses: start the harness from this worktree root");
  });

  it("quotes paths with whitespace for the Codex command", () => {
    const recipe = renderWorktreeEntryRecipe({ worktreePath: "/repos/arc framework.plan-widget" });

    expect(recipe).toContain(
      "Codex CLI: open a fresh terminal or end this session, then run `codex --cd '/repos/arc framework.plan-widget'`",
    );
  });
});
