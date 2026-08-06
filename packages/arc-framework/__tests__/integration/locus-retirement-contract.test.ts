/** Mechanical closure for the retired durable locus authority surface. */

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(packageRoot, "src");

const retiredModules = [
  "lib/locus/entry-boundary.ts",
  "lib/locus/evidence.ts",
  "lib/locus/lock.ts",
  "lib/locus/mutation-anchor.ts",
  "lib/locus/mutation.ts",
  "lib/locus/path-identity.ts",
  "lib/locus/platform-inspectors.ts",
  "lib/locus/process-exec.ts",
  "lib/locus/process-inspector.ts",
  "lib/locus/reader.ts",
  "lib/locus/reconciliation.ts",
  "lib/locus/record-store.ts",
  "lib/locus/resolve-driver.ts",
  "lib/locus/root.ts",
  "lib/locus/roster.ts",
  "lib/locus/schema/mutation.ts",
  "lib/locus/schema/record.ts",
  "lib/locus/schema/state.ts",
  "lib/locus/selected-generation.ts",
  "lib/locus/state.ts",
  "lib/locus/stop-tier.ts",
  "lib/locus/trusted-row.ts",
] as const;

describe("retired locus authority closure", () => {
  it("keeps every durable-record and process-liveness module deleted", async () => {
    for (const relativePath of retiredModules) {
      await expect(access(resolve(sourceRoot, relativePath))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("keeps locus read-only and Errand close free of retired bypass options", async () => {
    const [cli, locusHandler, locusCommand, errandHandler, commandPolicies] = await Promise.all([
      readFile(resolve(sourceRoot, "cli.ts"), "utf8"),
      readFile(resolve(sourceRoot, "handlers/locus.ts"), "utf8"),
      readFile(resolve(sourceRoot, "commands/locus.ts"), "utf8"),
      readFile(resolve(sourceRoot, "handlers/errand.ts"), "utf8"),
      readFile(resolve(sourceRoot, "command-input-infrastructure-policies.ts"), "utf8"),
    ]);

    expect(locusHandler).toContain("locusCommandInputRegistrations = []");
    expect(locusHandler).not.toMatch(/handleLocus(?:Attach|Release|Resolve)/u);
    expect(locusCommand).not.toMatch(/mutation|recordId|leaseId|sessionHomePath/u);
    for (const surface of [cli, errandHandler, commandPolicies]) {
      expect(surface).not.toMatch(/confirm-no-live-session|attach-session|locus\.(?:attach|release|resolve)/u);
    }
    const locusRegistration = cli.slice(cli.indexOf("// --- Locus ---"), cli.indexOf("// --- Recover ---"));
    expect(locusRegistration).not.toMatch(/command\("(?:attach|release|resolve)"\)/u);
    expect(errandHandler).not.toMatch(/close[^\n]*--force|force[^\n]*errand-close/u);
  });

  it("exports only surviving identity and scalar locus schemas", async () => {
    const schemaIndex = await readFile(resolve(sourceRoot, "lib/locus/schema/index.ts"), "utf8");

    expect(schemaIndex).toContain('export * from "./identity.js";');
    expect(schemaIndex).toContain('export * from "./limits.js";');
    expect(schemaIndex).not.toMatch(/mutation|record|state/u);
  });
});
