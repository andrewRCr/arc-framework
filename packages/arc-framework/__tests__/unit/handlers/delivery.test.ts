/** Output-boundary coverage for delivery command input refusals. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DeliveryPlanAbandonOptions,
} from "../../../src/handlers/delivery.js";

const mocks = vi.hoisted(() => ({
  readConfigSettings: vi.fn(),
  resolveActiveWu: vi.fn(),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mocks.readConfigSettings(...args),
}));
vi.mock("../../../src/lib/release/wu-resolution.js", () => ({
  resolveActiveWu: (...args: unknown[]) => mocks.resolveActiveWu(...args),
}));
vi.mock("../../../src/handlers/shared.js", () => ({
  requireArcProjectRoot: () => "/repo",
}));

const {
  handleDeliveryCompose,
  handleDeliveryPlanAbandon,
  handleDeliveryPlanFromBranch,
} = await import("../../../src/handlers/delivery.js");

let stdout = "";
let stderr = "";
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  stdout = "";
  stderr = "";
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  mocks.resolveActiveWu.mockResolvedValue({
    status: "resolved",
    name: "demo",
    path: ".arc/active/meta-demo.md",
  });
  mocks.readConfigSettings.mockResolvedValue({
    settings: { "branch.base": "" },
    warnings: [],
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe("delivery handler JSON boundaries", () => {
  it("preserves machine output when abandon input is invalid", async () => {
    const invalid = { json: true, unexpected: true } as DeliveryPlanAbandonOptions;

    await handleDeliveryPlanAbandon(invalid);

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      command: "delivery plan abandon",
      status: "refused",
      reason: "invalid-command-input",
    });
    expect(process.exitCode).toBe(1);
  });

  it("refuses a missing configured base before branch input reads", async () => {
    await handleDeliveryPlanFromBranch({ designInventory: "design-inventory.json", json: true });

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      command: "delivery plan from-branch",
      status: "refused",
      reason: "base-branch-unresolved",
    });
    expect(stderr).toBe("");
    expect(process.exitCode).toBe(1);
  });

  it("refuses malformed landed-prefix evidence before repository resolution", async () => {
    await handleDeliveryCompose({ landedPrefix: "not-json", json: true });

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      command: "delivery compose",
      status: "refused",
      reason: "invalid-command-input",
    });
    expect(mocks.resolveActiveWu).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
