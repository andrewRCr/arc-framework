/** Resolved native configuration retains complete architecture policy scopes. */

import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot });

async function architectureOptions(filename: string): Promise<unknown> {
  const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, filename)) as
    { rules: Record<string, unknown> } | undefined;
  return configuration?.rules["arc/architecture-imports"];
}

describe("composed architecture configuration", () => {
  it("resolves the global package restriction for a source module", async () => {
    expect(await architectureOptions("src/lib/config/status-reader.ts")).toEqual([2, ["neverthrow"]]);
  });
  it("unions predicates across global and kernel scopes", async () => {
    expect(await architectureOptions("src/lib/kernel/result.ts")).toEqual([2, ["neverthrow", "kernel"]]);
  });

});
