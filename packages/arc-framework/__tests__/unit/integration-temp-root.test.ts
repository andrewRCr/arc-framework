import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync,
  utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import {
  INTEGRATION_RUN_ROOT_PREFIX, STALE_INTEGRATION_RUN_ROOT_MS, integrationRunRootPath, prepareIntegrationRunRoot,
  selectIntegrationTempRoot, sweepStaleIntegrationRunRoots,
} from "../helpers/integration-temp-root.js";

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

describe("integration run root", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "arc-run-root-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Create a directory under the root whose modification time is `ageMs` before `now`. */
  function aged(name: string, now: number, ageMs: number): string {
    const path = join(root, name);
    mkdirSync(path);
    writeFileSync(join(path, "left-behind"), "");
    const at = (now - ageMs) / 1000;
    utimesSync(path, at, at);
    return path;
  }

  it("names a distinct directory under the root without creating it", () => {
    const first = integrationRunRootPath(root);
    const second = integrationRunRootPath(root);

    expect(dirname(first)).toBe(root);
    expect(basename(first).startsWith(INTEGRATION_RUN_ROOT_PREFIX)).toBe(true);
    expect(second).not.toBe(first);
    expect(readdirSync(root)).toEqual([]);
  });

  it("creates the run directory and removes it with everything written under it", () => {
    const runRoot = integrationRunRootPath(root);
    const teardown = prepareIntegrationRunRoot(runRoot);
    mkdirSync(join(runRoot, "tsx-1000"));
    writeFileSync(join(runRoot, "tsx-1000", "cache-entry"), "compiled");

    teardown();
    teardown();

    expect(existsSync(runRoot)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it("removes run directories past the stale age and keeps fresh ones, its own, and unrelated entries", () => {
    const now = Date.now();
    const stale = aged(`${INTEGRATION_RUN_ROOT_PREFIX}1-stale`, now, STALE_INTEGRATION_RUN_ROOT_MS + 60_000);
    const fresh = aged(`${INTEGRATION_RUN_ROOT_PREFIX}2-fresh`, now, STALE_INTEGRATION_RUN_ROOT_MS - 60_000);
    const own = aged(`${INTEGRATION_RUN_ROOT_PREFIX}3-own`, now, STALE_INTEGRATION_RUN_ROOT_MS + 60_000);
    const unrelated = aged("arc-other-fixture", now, STALE_INTEGRATION_RUN_ROOT_MS + 60_000);
    const target = aged("symlink-target", now, STALE_INTEGRATION_RUN_ROOT_MS + 60_000);
    const link = join(root, `${INTEGRATION_RUN_ROOT_PREFIX}4-link`);
    symlinkSync(target, link);

    sweepStaleIntegrationRunRoots(root, now, basename(own));

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(own)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(join(target, "left-behind"))).toBe(true);
  });

  it("sweeps stale siblings when preparing a run, and tolerates a missing root", () => {
    const now = Date.now();
    const stale = aged(`${INTEGRATION_RUN_ROOT_PREFIX}1-stale`, now, STALE_INTEGRATION_RUN_ROOT_MS + 60_000);
    const runRoot = integrationRunRootPath(root);

    const teardown = prepareIntegrationRunRoot(runRoot, now);

    expect(existsSync(stale)).toBe(false);
    expect(statSync(runRoot).isDirectory()).toBe(true);
    teardown();
    expect(() => sweepStaleIntegrationRunRoots(join(root, "missing"), now)).not.toThrow();
  });

  it("refuses to manage a directory not named as a run directory", () => {
    writeFileSync(join(root, "kept"), "");

    expect(() => prepareIntegrationRunRoot(root)).toThrow(/Refusing to manage/);
    expect(readdirSync(root)).toEqual(["kept"]);
  });
});
