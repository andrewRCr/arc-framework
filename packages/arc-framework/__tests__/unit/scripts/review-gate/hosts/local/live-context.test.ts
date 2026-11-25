import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";

const mocks = vi.hoisted(() => ({
  readActiveMetaCandidates: vi.fn(),
  resolveIdentity: vi.fn(),
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
  resolveIdentity: mocks.resolveIdentity,
}));

const { readLocalReviewLiveContext } = await import(
  "../../../../../../src/scripts/review-gate/hosts/local/live-context.js"
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveIdentity.mockResolvedValue("andrew");
  mocks.readActiveMetaCandidates.mockResolvedValue({
    layout: "full",
    candidates: [],
    warnings: [],
  });
  mocks.readTransientInFlightIndexes.mockResolvedValue({
    complete: true,
    degraded: null,
    indexes: { records: [] },
  });
});

describe("readLocalReviewLiveContext", () => {
  it("pins the identity read to the supplied repository root", async () => {
    mocks.resolveIdentity.mockImplementation(async ({ exec }: { exec: GitExec }) =>
      (await exec("git", ["config", "--get", "user.name"])).stdout.trim());
    const exec: GitExec = async (_command, args, options) => ({ stdout: args[0] === "config"
      ? options?.cwd === "/repo/root" ? "andrew" : "wrong-checkout" : "chore/example\n" });
    await expect(readLocalReviewLiveContext({ exec, cwd: "/repo/root" })).resolves.toMatchObject({
      context: { activeIdentity: "andrew" },
    });
  });

  it("carries the exact transient claim into local review context", async () => {
    mocks.readTransientInFlightIndexes.mockResolvedValueOnce({
      complete: true,
      degraded: null,
      indexes: {
        records: [{
          kind: "errand",
          slug: "example",
          branch: "chore/example",
          claimId: "claim-1",
          state: "open",
        }],
      },
    });
    const exec: GitExec = vi.fn(async () => ({ stdout: "chore/example\n" }));

    await expect(readLocalReviewLiveContext({ exec, cwd: "/repo/root" })).resolves.toMatchObject({
      context: { errand: { identity: "example", claimId: "claim-1" } },
    });
  });

  it("refuses ambiguous branch claims before preparing local review", async () => {
    mocks.readTransientInFlightIndexes.mockResolvedValueOnce({
      complete: true,
      degraded: null,
      indexes: {
        records: ["claim-1", "claim-2"].map((claimId) => ({
          kind: "errand",
          slug: "example",
          branch: "chore/example",
          claimId,
          state: "open",
        })),
      },
    });
    const exec: GitExec = vi.fn(async () => ({ stdout: "chore/example\n" }));

    await expect(readLocalReviewLiveContext({ exec, cwd: "/repo/root" }))
      .rejects.toThrow(/Multiple transient identities/u);
  });
});
