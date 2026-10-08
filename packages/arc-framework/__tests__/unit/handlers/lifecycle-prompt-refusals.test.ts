/** Lifecycle missing-input reports follow the declared question syntax. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStub } from "../../../src/handlers/lifecycle.js";
import { resolveInteractionContext } from "../../../src/lib/command-input/interaction-context.js";

const boundary = vi.hoisted(() => ({ errors: [] as string[], select: vi.fn() }));
vi.mock("@clack/prompts", () => ({ intro: vi.fn(), outro: vi.fn(), select: boundary.select,
  isCancel: (value: unknown) => typeof value === "symbol", log: { error: (message: string) => { boundary.errors.push(message); }, info: vi.fn() },
  note: vi.fn(), spinner: () => ({ start: vi.fn(), stop: vi.fn() }) }));
const context = resolveInteractionContext({ noInput: true, machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" });
beforeEach(() => { vi.resetAllMocks(); boundary.errors.length = 0; process.exitCode = undefined; });
afterEach(() => { process.exitCode = undefined; });

describe("stub declared prompt refusals", () => {
  it("collects both required question syntaxes into one report", async () => {
    await handleStub("example", {}, context);
    expect(boundary.errors).toEqual(["Missing required input: --commitment <tier>, --priority <priority>"]);
    expect(process.exitCode).toBe(1);
  });
  it("keeps an explicit commitment while reporting the remaining question", async () => {
    await handleStub("example", { commitment: "planned" }, context);
    expect(boundary.errors).toEqual(["Missing required input: --priority <priority>"]);
    expect(process.exitCode).toBe(1);
  });
});
