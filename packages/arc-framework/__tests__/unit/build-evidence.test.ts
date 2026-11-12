/** Observable source selectivity of development build identities. */
import { describe, expect, it } from "vitest";
import { createBuildEvidence, identifyBuildInputs, parseBuildEvidence } from "../../src/lib/build-evidence.js";

describe("selective build identities", () => {
  const graphs = { cli: ["src/cli.ts", "src/shared.ts"],
    controls: ["tsup.config.ts"] };
  const baseline = { "src/cli.ts": "cli", "src/shared.ts": "shared",
    "tsup.config.ts": "config", "src/unused.ts": "unused", "tsconfig.json": "tsconfig", "base.json": "base" };

  it.each(["src/cli.ts", "src/shared.ts", "tsup.config.ts"])("retains %s in the runtime identity", (key) => {
    const before = identifyBuildInputs(graphs, baseline, "controls");
    const after = identifyBuildInputs(graphs, { ...baseline, [key]: "changed" }, "controls");
    expect(after.runtime).not.toBe(before.runtime);
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

  it("records one current input identity and rejects the previous format", () => {
    const evidence = makeEvidence();
    expect(evidence.schemaVersion).toBe(3);
    expect(Object.keys(evidence.identities)).toEqual(["runtime"]);
    expect(Object.keys(evidence.graphs).sort()).toEqual(["cli", "controls"]);
    expect(evidence.qualification).toEqual({ published: true, declarations: false });
    expect(parseBuildEvidence({ ...evidence, schemaVersion: 2 })).toBeNull();
  });

  it.each(["legacy", "path", "digest", "qualification"])("refuses %s evidence and accepts regenerated evidence", (kind) => {
    const evidence = makeEvidence();
    const invalid = structuredClone(evidence);
    if (kind === "legacy") Object.assign(invalid, { schemaVersion: 2 });
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
  });
});
