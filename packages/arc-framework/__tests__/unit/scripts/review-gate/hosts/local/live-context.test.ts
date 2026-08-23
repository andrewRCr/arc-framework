import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";

const mocks = vi.hoisted(() => ({
  readActiveMetaCandidates: vi.fn(),
  readConfiguredIdentity: vi.fn(),
  readTransientInFlightIndexes: vi.fn(),
}));

vi.mock("../../../../../../src/lib/active/meta-reader.js", () => ({
  parseMetaRecord: vi.fn(),
  readActiveMetaCandidates: mocks.readActiveMetaCandidates,
  toMetaRecord: vi.fn(),
}));
vi.mock("../../../../../../src/lib/errand/record.js", () => ({
  projectTransientInFlightRead: (read: unknown) => read,
  readTransientInFlightIndexes: mocks.readTransientInFlightIndexes,
}));
vi.mock("../../../../../../src/lib/git/identity.js", () => ({
  readConfiguredIdentity: mocks.readConfiguredIdentity,
}));

const { readLocalReviewLiveContext } = await import(
  "../../../../../../src/scripts/review-gate/hosts/local/live-context.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readConfiguredIdentity.mockResolvedValue("andrew");
  mocks.readActiveMetaCandidates.mockResolvedValue({
    layout: "full",
    candidates: [],
    warnings: [],
  });
  mocks.readTransientInFlightIndexes.mockResolvedValue({
    indexes: { slugByBranch: new Map() },
  });
});

describe("readLocalReviewLiveContext", () => {
  it("pins the identity read to the supplied repository root", async () => {
    const exec: GitExec = vi.fn(async () => ({ stdout: "chore/example\n" }));

    await readLocalReviewLiveContext({ exec, cwd: "/repo/root" });

    expect(mocks.readConfiguredIdentity).toHaveBeenCalledWith(exec, "/repo/root");
  });
});
