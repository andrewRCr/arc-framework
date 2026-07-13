import { describe, expect, it } from "vitest";

import type { InstallationTokenQualification } from "../../../../../src/scripts/review-gate/hosts/github/token-qualification.js";
import { runTokenQualification } from "../../../../../src/scripts/review-gate/runtime/token-qualification.js";

const authority: InstallationTokenQualification = {
  appId: "4268856",
  installationId: "145772297",
  repositoryId: "100",
  repositoryCount: 1,
  permissions: { checks: "write" as const, metadata: "read" as const, pullRequests: "write" as const, statuses: "read" as const },
  deniedCapabilities: ["administration:write", "contents:write", "merge"],
  denialProbes: { administrationRead: "denied", contentsRead: "denied" },
};

describe("forced-format token qualification", () => {
  it("passes arbitrary token bytes opaquely to the same consumer and emits no credential", async () => {
    const consumed: string[] = [];
    const result = await runTokenQualification({
      mint: async (format) => ({ token: `unexpected token bytes ${format}`, observedFormat: format }),
      consume: async (token) => {
        consumed.push(token);
        return authority;
      },
    });
    expect(consumed).toEqual(["unexpected token bytes stateless", "unexpected token bytes classic"]);
    expect(result).toMatchObject({ status: "qualified", probes: [
      { requestedFormat: "stateless", authority },
      { requestedFormat: "classic", authority },
    ] });
    expect(JSON.stringify(result)).not.toContain("unexpected token bytes");
  });

  it("sanitizes mint, format, and consumer failures", async () => {
    await expect(runTokenQualification({
      mint: async () => { throw new Error("credential-secret"); },
      consume: async () => authority,
    })).rejects.toThrow("token-qualification:stateless-probe-failed");
    await expect(runTokenQualification({
      mint: async (format) => ({ token: "credential-secret", observedFormat: format }),
      consume: async () => { throw new Error("credential-secret"); },
    })).rejects.not.toThrow(/credential-secret/u);
  });
});
