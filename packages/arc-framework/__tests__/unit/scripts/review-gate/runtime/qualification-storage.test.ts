import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createQualificationCheckpoint } from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import {
  FileQualificationCheckpointStore,
  FileQualificationRawStore,
} from "../../../../../src/scripts/review-gate/runtime/qualification-storage.js";
import { qualificationScope } from "./qualification-fixtures.js";

describe("private qualification storage", () => {
  it("round-trips checkpoints and writes raw evidence with private modes", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-qualification-"));
    const checkpoints = new FileQualificationCheckpointStore(root);
    const raw = new FileQualificationRawStore(root);
    const checkpoint = createQualificationCheckpoint(qualificationScope());
    expect(await checkpoints.load()).toBeNull();
    await checkpoints.save(checkpoint);
    await expect(checkpoints.load()).resolves.toEqual(checkpoint);
    await expect(raw.write("pending-first", { state: "pending" })).resolves.toMatch(/^[a-f0-9]{64}$/u);
    expect((await stat(join(root, "checkpoint.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, "raw", "pending-first.json"))).mode & 0o777).toBe(0o600);
  });

  it("rejects credential-shaped raw records and malformed checkpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-qualification-"));
    const raw = new FileQualificationRawStore(root);
    await expect(raw.write("pending-first", { token: "credential" })).rejects.toThrow(/credential-shaped/u);
    await expect(raw.write("pending-first", { value: `ghr_${"a".repeat(36)}` })).rejects.toThrow(/credential-shaped/u);
    await expect(raw.write("pending-first", { value: `github_pat_${"a".repeat(36)}` })).rejects.toThrow(/credential-shaped/u);
    await writeFile(join(root, "checkpoint.json"), "not-json", "utf8");
    await expect(new FileQualificationCheckpointStore(root).load()).rejects.toThrow(/checkpoint-read-failed/u);
    expect(await readFile(join(root, "checkpoint.json"), "utf8")).toBe("not-json");
  });
});
