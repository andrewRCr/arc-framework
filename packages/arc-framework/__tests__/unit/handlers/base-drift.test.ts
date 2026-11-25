/** Local base-drift handler locus degradation behavior. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCurrentBaseDriftAdapters: vi.fn((...args: unknown[]) => {
    void args;
    return {};
  }),
  readConfigSettings: vi.fn(),
  readIdentityPointers: vi.fn(),
  runBaseDrift: vi.fn(async (...args: unknown[]) => {
    void args;
    return { verdict: "clean" };
  }),
  runDerivedLocusStateProbe: vi.fn(),
}));

vi.mock("../../../src/lib/base-drift/current-adapters.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/base-drift/current-adapters.js")>(),
  createCurrentBaseDriftAdapters: (...args: unknown[]) => mocks.createCurrentBaseDriftAdapters(...args),
}));
vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mocks.readConfigSettings(...args),
}));
vi.mock("../../../src/lib/git/base-distance.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/git/base-distance.js")>(),
  runBaseDrift: (...args: unknown[]) => mocks.runBaseDrift(...args),
}));
vi.mock("../../../src/handlers/identity-pointers.js", () => ({
  readIdentityPointers: (...args: unknown[]) => mocks.readIdentityPointers(...args),
}));
vi.mock("../../../src/handlers/derived-locus-state-probe.js", () => ({
  runDerivedLocusStateProbe: (...args: unknown[]) => mocks.runDerivedLocusStateProbe(...args),
}));
vi.mock("../../../src/handlers/shared.js", () => ({
  requireArcProjectRoot: () => "/repo",
}));

const { handleBaseDrift } = await import("../../../src/handlers/base.js");
const { nativeListingRefusal } = await import("../../fixtures/native-refusal.js");

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  mocks.readConfigSettings.mockResolvedValue({ settings: { "branch.base": "main" }, warnings: [] });
  mocks.readIdentityPointers.mockResolvedValue({ identity: "andrew", role: "maintainer" });
  mocks.runBaseDrift.mockResolvedValue({ verdict: "clean" });
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

function workUnitRow(kind: "work-unit" | "retired", key: string) {
  return {
    kind,
    checkout: { path: "/repo" },
    subject: { kind: "work-unit", key },
  };
}

describe("base drift handler", () => {
  it("degrades an invalid configured identity to an unbound authoritative result", async () => {
    mocks.readIdentityPointers.mockRejectedValue(
      Object.assign(new Error("Invalid configured identity"), { code: "identity.invalid" }),
    );

    await handleBaseDrift({ json: true });

    expect(stdoutSpy).toHaveBeenCalledWith(`${JSON.stringify({ verdict: "clean" })}\n`);
  });

  it("retains work-unit path treatment for a retired checkout", async () => {
    const row = workUnitRow("retired", "example");
    mocks.runDerivedLocusStateProbe.mockResolvedValue({
      roster: [row],
      entering: { kind: "selected", row },
    });

    await handleBaseDrift({ json: true });

    expect(mocks.createCurrentBaseDriftAdapters).toHaveBeenCalledWith(expect.any(Function), {
      workUnit: "example",
      projectionPaths: new Set([
        ".arc/system/.internal/candidates/example.json",
        ".arc/system/.internal/candidates/example.boundary.json",
      ]),
    });
  });

  it("degrades an invalid work-unit key to unbound path treatment", async () => {
    const row = workUnitRow("work-unit", "not/a/slug");
    mocks.runDerivedLocusStateProbe.mockResolvedValue({
      roster: [row],
      entering: { kind: "selected", row },
    });

    await expect(handleBaseDrift({ json: true })).resolves.toBeUndefined();

    expect(mocks.createCurrentBaseDriftAdapters).toHaveBeenCalledWith(expect.any(Function), {});
    expect(mocks.runBaseDrift).toHaveBeenCalledOnce();
  });

  it("reports a native refusal of the locus read as unavailable drift, and drifts with path treatment once repaired", async () => {
    const refusal = nativeListingRefusal();
    const row = workUnitRow("work-unit", "example");
    mocks.runDerivedLocusStateProbe.mockRejectedValueOnce(refusal)
      .mockResolvedValueOnce({ roster: [row], entering: { kind: "selected", row } });
    const emitted = async () => {
      stdoutSpy.mockClear();
      await handleBaseDrift({ json: true });
      return JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0])) as unknown;
    };
    try {
      expect(await emitted()).toMatchObject({ verdict: "unavailable", unavailableReason: "locus-unavailable",
        detail: expect.stringContaining(refusal.message), continuation: { kind: "terminal-explanation",
          terminalExplanation: "Repair the reported work-unit state, then rerun arc base drift." } });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
    }
    expect(await emitted()).toEqual({ verdict: "clean" });
    expect(mocks.createCurrentBaseDriftAdapters).toHaveBeenCalledWith(expect.any(Function),
      expect.objectContaining({ workUnit: "example" }));
  });
});
