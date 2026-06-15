import { describe, it, expect } from "vitest";

import {
  userWorkspace,
  type UserWorkspaceContext,
} from "../../../../src/lib/work-unit/side-effects/user-workspace.js";
import type {
  UserCloseOptions,
  UserIOContext,
  UserOpenOptions,
} from "../../../../src/commands/user/types.js";

/** A sentinel I/O context — forwarded to the open seam, never dereferenced here. */
const IO = {} as UserIOContext;

interface CtxState {
  opens: UserOpenOptions[];
  closes: UserCloseOptions[];
}

function buildCtx(): { ctx: UserWorkspaceContext; state: CtxState } {
  const state: CtxState = { opens: [], closes: [] };
  const ctx: UserWorkspaceContext = {
    open: async (options) => {
      state.opens.push(options);
    },
    close: async (options) => {
      state.closes.push(options);
    },
  };
  return { ctx, state };
}

describe("userWorkspace", () => {
  it("opens the per-WU workspace via the non-interactive open function", async () => {
    const { ctx, state } = buildCtx();

    const result = await userWorkspace(ctx, {
      action: "open",
      cwd: "/repo",
      identity: "andrew",
      wuName: "demo-wu",
      io: IO,
      internalTemplateDir: "/tpl",
    });

    expect(result).toEqual({ ran: true });
    expect(state.opens).toEqual([
      { cwd: "/repo", io: IO, identity: "andrew", wuName: "demo-wu", internalTemplateDir: "/tpl" },
    ]);
    expect(state.closes).toEqual([]);
  });

  it("closes the per-WU workspace via the non-interactive close function", async () => {
    const { ctx, state } = buildCtx();

    const result = await userWorkspace(ctx, {
      action: "close",
      cwd: "/repo",
      identity: "andrew",
      wuName: "demo-wu",
    });

    expect(result).toEqual({ ran: true });
    expect(state.closes).toEqual([{ cwd: "/repo", identity: "andrew", wuName: "demo-wu" }]);
    expect(state.opens).toEqual([]);
  });

  it("skips when identity is absent (the workspace is identity-scoped)", async () => {
    const { ctx, state } = buildCtx();

    const result = await userWorkspace(ctx, {
      action: "close",
      cwd: "/repo",
      identity: null,
      wuName: "demo-wu",
    });

    expect(result).toEqual({ ran: false });
    expect(state.opens).toEqual([]);
    expect(state.closes).toEqual([]);
  });
});
