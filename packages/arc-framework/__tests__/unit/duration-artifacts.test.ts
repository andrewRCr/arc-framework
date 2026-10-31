/** Handed duration files survive restoration and writer artifacts merge by complete membership. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepareDurationInputs, mergeDurationArtifacts } from "../helpers/duration-artifacts.js";

it("preserves a restored tier and creates empty inputs for missing tiers", () => {
  const root = mkdtempSync(join(tmpdir(), "duration-input-"));
  try {
    const unit = '{"version":"4.1.8","results":[]}';
    writeFileSync(join(root, "unit.json"), unit);
    prepareDurationInputs(root);
    expect(readFileSync(join(root, "unit.json"), "utf8")).toBe(unit);
    expect(readFileSync(join(root, "integration.json"), "utf8")).toBe("");
    expect(readFileSync(join(root, "e2e.json"), "utf8")).toBe("");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("discovers hashed native result paths in tier-labelled shard artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "duration-merge-"));
  try {
    for (const [shard, path] of [[1, "a.test.ts"], [2, "b.test.ts"]] as const) {
      const directory = join(root, "download", `duration-results-unit-${shard}`, "hash");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "results.json"), JSON.stringify({ version: "4.1.8", results: [
        [`unit:${path}`, { duration: 4, failed: false }],
      ] }));
    }
    const output = join(root, "output");
    mergeDurationArtifacts(join(root, "download"), output);
    expect(JSON.parse(readFileSync(join(output, "unit.json"), "utf8"))).toEqual({ version: "4.1.8", results: [
      ["unit:a.test.ts", { duration: 4, failed: false }], ["unit:b.test.ts", { duration: 4, failed: false }],
    ] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("merges the store shards' results into the integration tier beside its shards", () => {
  const root = mkdtempSync(join(tmpdir(), "duration-merge-"));
  try {
    for (const [artifact, path] of [["duration-results-integration-1", "a.test.ts"],
      ["duration-results-integration-store-2", "store-ref-a.test.ts"]] as const) {
      const directory = join(root, "download", artifact, "hash");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "results.json"), JSON.stringify({ version: "4.1.8", results: [
        [`integration:${path}`, { duration: 4, failed: false }],
      ] }));
    }
    const output = join(root, "output");
    mergeDurationArtifacts(join(root, "download"), output);
    expect(JSON.parse(readFileSync(join(output, "integration.json"), "utf8")).results.map(([key]: [string]) => key))
      .toEqual(["integration:a.test.ts", "integration:store-ref-a.test.ts"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("updates a handed input from partial writers instead of replacing it", () => {
  const root = mkdtempSync(join(tmpdir(), "duration-merge-"));
  try {
    const directory = join(root, "download", "duration-results-integration-store-1", "hash");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "results.json"), JSON.stringify({ version: "4.1.8", results: [
      ["integration:store-ref-a.test.ts", { duration: 30000, failed: false }],
    ] }));
    const base = join(root, "base");
    mkdirSync(base);
    const unit = '{"version":"4.1.8","results":[["unit:a.test.ts",{"duration":4,"failed":false}]]}';
    writeFileSync(join(base, "unit.json"), unit);
    writeFileSync(join(base, "e2e.json"), "");
    writeFileSync(join(base, "integration.json"), JSON.stringify({ version: "4.1.8", results: [
      ["integration:a.test.ts", { duration: 900, failed: false }],
    ] }));
    const output = join(root, "output");
    mergeDurationArtifacts(join(root, "download"), output, base);
    expect(readFileSync(join(output, "unit.json"), "utf8")).toBe(unit);
    expect(readFileSync(join(output, "e2e.json"), "utf8")).toBe("");
    expect(JSON.parse(readFileSync(join(output, "integration.json"), "utf8")).results.map(([key]: [string]) => key))
      .toEqual(["integration:a.test.ts", "integration:store-ref-a.test.ts"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
