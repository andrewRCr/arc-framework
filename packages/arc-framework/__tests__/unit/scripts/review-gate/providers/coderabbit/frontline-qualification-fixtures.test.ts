import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const fixtureUrl = new URL(
  "../../../../../fixtures/coderabbit-frontline/observations.json",
  import.meta.url,
);
const capturedReviewUrl = new URL(
  "../../../../../fixtures/coderabbit-frontline/agent-0.8.1-findings.ndjson",
  import.meta.url,
);
const credentialPattern = /(?:api[_-]?key|authorization|bearer|token)["':=\s]+[A-Za-z0-9_-]{8,}/iu;

describe("CodeRabbit frontline qualification fixtures", () => {
  it("records bounded live observations and synthetic non-success cases without credentials", async () => {
    const raw = await readFile(fixtureUrl, "utf8");
    const fixture = JSON.parse(raw) as {
      cli: { version: string; mode: string };
      qualification: { bounded: boolean; structuredContractInferred: boolean };
      observations: Array<{ shape: string; observed?: boolean }>;
      syntheticInjectedCommandCases: Array<{ shape: string }>;
    };

    expect(fixture.cli).toEqual({ name: "coderabbit", version: "0.6.5", mode: "--agent" });
    expect(fixture.qualification).toMatchObject({ bounded: true, structuredContractInferred: true });
    expect(fixture.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ shape: "empty-uncommitted" }),
      expect.objectContaining({ shape: "clean-scoped-directory" }),
      expect.objectContaining({ shape: "findings", observed: true }),
    ]));
    expect(fixture.syntheticInjectedCommandCases.map((item) => item.shape)).toEqual([
      "rate-limit",
      "malformed",
      "stale-head",
      "refusal",
      "process-failure",
    ]);
    expect(raw).not.toMatch(credentialPattern);
  });

  it("records a live agent-mode stream without credentials or local home paths", async () => {
    const raw = await readFile(capturedReviewUrl, "utf8");
    const types = raw.split("\n")
      .filter((line) => line.length > 0)
      .map((line) => (JSON.parse(line) as { type: string }).type);

    expect(types).toEqual(expect.arrayContaining(["review_context", "finding", "complete"]));
    expect(types.at(-1)).toBe("complete");
    expect(raw).not.toMatch(credentialPattern);
    expect(raw).not.toMatch(/\/home\/|\/Users\/|[A-Za-z]:\\\\Users/u);
  });
});
