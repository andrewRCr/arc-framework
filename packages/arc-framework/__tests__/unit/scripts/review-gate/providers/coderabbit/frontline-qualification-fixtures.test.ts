import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const fixtureUrl = new URL(
  "../../../../../fixtures/coderabbit-frontline/observations.json",
  import.meta.url,
);

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
    expect(fixture.qualification).toEqual({ bounded: true, structuredContractInferred: false });
    expect(fixture.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ shape: "empty-uncommitted" }),
      expect.objectContaining({ shape: "clean-scoped-directory" }),
      expect.objectContaining({ shape: "findings", observed: false }),
    ]));
    expect(fixture.syntheticInjectedCommandCases.map((item) => item.shape)).toEqual([
      "rate-limit",
      "malformed",
      "stale-head",
      "refusal",
      "process-failure",
    ]);
    expect(raw).not.toMatch(/(?:api[_-]?key|authorization|bearer|token)["':=\s]+[A-Za-z0-9_-]{8,}/iu);
  });
});
