/** Observable source selectivity of development build identities. */
import { describe, expect, it } from "vitest";
import { createBuildEvidence, identifyBuildInputs, parseBuildEvidence } from "../../src/lib/build-evidence.js";

describe("selective build identities", () => {
  const graphs = { cli: ["src/cli.ts", "src/shared.ts"],
    controls: ["tsup.config.ts"], schema: ["src/schema.ts", "src/shared.ts"] };
  const baseline = { "src/cli.ts": "cli", "src/shared.ts": "shared", "src/schema.ts": "schema",
    "tsup.config.ts": "config", "src/unused.ts": "unused", "tsconfig.json": "tsconfig", "base.json": "base" };

  it("invalidates only test reuse for ordinary schema-only content", () => {
    const before = identifyBuildInputs(graphs, baseline, "controls");
    const after = identifyBuildInputs(graphs, { ...baseline, "src/schema.ts": "changed" }, "controls");
    expect(after.runtime).toBe(before.runtime);
    expect(after.runtimeSchema).not.toBe(before.runtimeSchema);
  });

  it.each(["src/shared.ts", "tsup.config.ts"])("retains %s in both identities", (key) => {
    const before = identifyBuildInputs(graphs, baseline, "controls");
    const after = identifyBuildInputs(graphs, { ...baseline, [key]: "changed" }, "controls");
    expect(after.runtime).not.toBe(before.runtime);
    expect(after.runtimeSchema).not.toBe(before.runtimeSchema);
  });

  it("ignores unrelated ordinary content and input ordering", () => {
    const before = identifyBuildInputs(graphs, baseline, "controls");
    expect(identifyBuildInputs({ ...graphs, cli: [...graphs.cli].reverse() },
      { ...baseline, "src/unused.ts": "changed" }, "controls")).toEqual(before);
  });

  const makeEvidence = (declarations = false) => createBuildEvidence({
    graphs, contents: baseline, sharedIdentity: "controls", declarations,
    configurationInputs: ["tsconfig.json", "base.json"], inventoryRoots: ["src"],
    inventory: [{ path: "src", kind: "directory" }, { path: "src/cli.ts", kind: "file" }],
  });

  it.each(["legacy", "path", "digest", "qualification"])("refuses %s evidence and accepts regenerated evidence", (kind) => {
    const evidence = makeEvidence();
    const invalid = structuredClone(evidence);
    if (kind === "legacy") Object.assign(invalid, { schemaVersion: 1 });
    if (kind === "path") invalid.graphs.cli = ["../outside.ts"];
    if (kind === "digest") invalid.identities.runtime = "invalid";
    if (kind === "qualification") Object.assign(invalid.qualification, { published: false });
    expect(parseBuildEvidence(invalid)).toBeNull();
    expect(parseBuildEvidence(makeEvidence())).not.toBeNull();
  });

  it("keeps runtime qualification separate from full declaration generation", () => {
    const fast = makeEvidence();
    const full = makeEvidence(true);
    expect(fast.identities).toEqual(full.identities);
    expect(fast.qualification.declarations).toBe(false);
    expect(full.qualification.declarations).toBe(true);
  });

  it("includes inherited configuration even when native source metadata omits it", () => {
    const first = makeEvidence();
    const changed = createBuildEvidence({ ...first, contents: { ...baseline, "base.json": "changed" },
      sharedIdentity: "controls", declarations: false });
    expect(changed.identities.runtime).not.toBe(first.identities.runtime);
    expect(changed.identities.runtimeSchema).not.toBe(first.identities.runtimeSchema);
  });
});
