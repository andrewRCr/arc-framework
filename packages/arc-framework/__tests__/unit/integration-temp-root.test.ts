import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { selectIntegrationTempRoot } from "../helpers/integration-temp-root.js";

describe("integration temp root", () => {
  let candidate: string;

  beforeEach(() => {
    candidate = mkdtempSync(join(tmpdir(), "arc-integration-temp-root-test-"));
  });

  afterEach(() => {
    rmSync(candidate, { recursive: true, force: true });
  });

  it("uses a writable Linux root only when its executable probe succeeds", () => {
    const executed: string[] = [];
    const selected = selectIntegrationTempRoot(candidate, "linux", (probe) => {
      executed.push(probe);
      expect(readFileSync(probe, "utf8")).toBe("#!/bin/sh\nexit 0\n");
      expect(statSync(probe).mode & 0o111).not.toBe(0);
    });

    expect(selected).toBe(realpathSync(candidate));
    expect(executed).toHaveLength(1);
    expect(readdirSync(candidate)).toEqual([]);
  });

  it("falls back and cleans up when a writable root refuses execution", () => {
    const selected = selectIntegrationTempRoot(candidate, "linux", () => {
      throw Object.assign(new Error("execution denied"), { code: "EACCES" });
    });

    expect(selected).toBeUndefined();
    expect(readdirSync(candidate)).toEqual([]);
  });

  it("does not probe a non-Linux host or an unavailable root", () => {
    const execute = () => { throw new Error("unexpected execution"); };
    expect(selectIntegrationTempRoot(candidate, "darwin", execute)).toBeUndefined();
    expect(selectIntegrationTempRoot(join(candidate, "missing"), "linux", execute)).toBeUndefined();
    expect(readdirSync(candidate)).toEqual([]);
  });
});
