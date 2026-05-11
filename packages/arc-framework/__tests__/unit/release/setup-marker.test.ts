/**
 * Unit tests for release-wrapper setup marker storage.
 *
 * Covers the per-identity marker path, default empty reads, runtime schema
 * validation, and read / upsert / remove persistence behavior for the
 * `.arc/user/{identity}/.internal/release-setup.json` sidecar.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ensureMarkerParent,
  isHarnessEntry,
  isMarkerSchemaV1,
  readMarker,
  removeHarness,
  resolveMarkerPath,
  upsertHarness,
} from "../../../src/lib/release/setup-marker.js";

interface Fixture {
  root: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-setup-marker-"));
  return { root };
}

describe("resolveMarkerPath", () => {
  it("returns `.arc/user/{identity}/.internal/release-setup.json` under cwd", () => {
    const path = resolveMarkerPath({ cwd: "/repo", identity: "alice" });

    expect(path).toBe("/repo/.arc/user/alice/.internal/release-setup.json");
  });
});

describe("ensureMarkerParent", () => {
  let fixture: Fixture;

  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("creates `.arc/user/{identity}/.internal/` when missing", async () => {
    await ensureMarkerParent({ cwd: fixture.root, identity: "alice" });

    const parent = join(fixture.root, ".arc", "user", "alice", ".internal");
    const info = await stat(parent);
    expect(info.isDirectory()).toBe(true);
  });
});

describe("readMarker", () => {
  let fixture: Fixture;

  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("returns an empty marker when the file is missing", async () => {
    await expect(
      readMarker({ cwd: fixture.root, identity: "alice" }),
    ).resolves.toEqual({
      ok: true,
      marker: { schemaVersion: 1, harnesses: [] },
    });
  });

  it("returns an empty marker when identity is null", async () => {
    await expect(
      readMarker({ cwd: fixture.root, identity: null }),
    ).resolves.toEqual({
      ok: true,
      marker: { schemaVersion: 1, harnesses: [] },
    });
  });

  it("returns a parsed marker when the file is valid", async () => {
    const marker = {
      schemaVersion: 1,
      harnesses: [
        {
          name: "claude-code",
          mode: "default-prompt",
          installedAt: "2026-05-09T19:52:48Z",
        },
      ],
    };
    await ensureMarkerParent({ cwd: fixture.root, identity: "alice" });
    await writeFile(
      resolveMarkerPath({ cwd: fixture.root, identity: "alice" }),
      JSON.stringify(marker),
      "utf8",
    );

    await expect(
      readMarker({ cwd: fixture.root, identity: "alice" }),
    ).resolves.toEqual({ ok: true, marker });
  });

  it("returns a typed error when JSON is malformed", async () => {
    await ensureMarkerParent({ cwd: fixture.root, identity: "alice" });
    await writeFile(
      resolveMarkerPath({ cwd: fixture.root, identity: "alice" }),
      "{not-json",
      "utf8",
    );

    const result = await readMarker({ cwd: fixture.root, identity: "alice" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("malformed-json");
    }
  });

  it("returns a typed error with the actual version on schema-version mismatch", async () => {
    await ensureMarkerParent({ cwd: fixture.root, identity: "alice" });
    await writeFile(
      resolveMarkerPath({ cwd: fixture.root, identity: "alice" }),
      JSON.stringify({ schemaVersion: 2, harnesses: [] }),
      "utf8",
    );

    const result = await readMarker({ cwd: fixture.root, identity: "alice" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-mismatch");
      expect(result.error.actualVersion).toBe(2);
    }
  });
});

describe("marker schema guards", () => {
  it("accepts a valid harness entry", () => {
    expect(isHarnessEntry({
      name: "codex",
      mode: "bypass",
      installedAt: "2026-05-09T19:52:48Z",
    })).toBe(true);
  });

  it("rejects an unknown harness mode", () => {
    expect(isHarnessEntry({
      name: "codex",
      mode: "future-mode",
      installedAt: "2026-05-09T19:52:48Z",
    })).toBe(false);
  });

  it("accepts a schema-v1 marker with harness entries", () => {
    expect(isMarkerSchemaV1({
      schemaVersion: 1,
      harnesses: [
        { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
      ],
    })).toBe(true);
  });
});

describe("upsertHarness", () => {
  let fixture: Fixture;

  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("appends a new entry when no harness with that name exists", async () => {
    const result = await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
    );

    expect(result).toEqual({
      ok: true,
      marker: {
        schemaVersion: 1,
        harnesses: [
          { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
        ],
      },
    });
  });

  it("replaces an existing entry by name and preserves siblings", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
    );
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:49Z" },
    );

    const result = await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "claude-code", mode: "bypass", installedAt: "2026-05-09T20:00:00Z" },
    );

    expect(result).toEqual({
      ok: true,
      marker: {
        schemaVersion: 1,
        harnesses: [
          { name: "claude-code", mode: "bypass", installedAt: "2026-05-09T20:00:00Z" },
          { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:49Z" },
        ],
      },
    });
  });

  it("creates the marker parent directory on first write", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
    );

    const path = resolveMarkerPath({ cwd: fixture.root, identity: "alice" });
    const content = await readFile(path, "utf8");
    expect(JSON.parse(content)).toEqual({
      schemaVersion: 1,
      harnesses: [
        { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
      ],
    });
  });

  it("does not leave temp files behind after the atomic write", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
    );

    const parent = join(fixture.root, ".arc", "user", "alice", ".internal");
    expect(await readdir(parent)).toEqual(["release-setup.json"]);
  });
});

describe("removeHarness", () => {
  let fixture: Fixture;

  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("removes an entry by name and preserves siblings", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-09T19:52:48Z" },
    );
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "bypass", installedAt: "2026-05-09T19:52:49Z" },
    );

    const result = await removeHarness({ cwd: fixture.root, identity: "alice" }, "claude-code");

    expect(result).toEqual({
      ok: true,
      marker: {
        schemaVersion: 1,
        harnesses: [
          { name: "codex", mode: "bypass", installedAt: "2026-05-09T19:52:49Z" },
        ],
      },
    });
  });

  it("succeeds as a no-op when the harness name is already absent", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "bypass", installedAt: "2026-05-09T19:52:49Z" },
    );

    const result = await removeHarness({ cwd: fixture.root, identity: "alice" }, "claude-code");

    expect(result).toEqual({
      ok: true,
      marker: {
        schemaVersion: 1,
        harnesses: [
          { name: "codex", mode: "bypass", installedAt: "2026-05-09T19:52:49Z" },
        ],
      },
    });
  });

  it("preserves an empty schema-v1 marker after removing the last entry", async () => {
    await upsertHarness(
      { cwd: fixture.root, identity: "alice" },
      { name: "codex", mode: "bypass", installedAt: "2026-05-09T19:52:49Z" },
    );

    const result = await removeHarness({ cwd: fixture.root, identity: "alice" }, "codex");

    expect(result).toEqual({
      ok: true,
      marker: { schemaVersion: 1, harnesses: [] },
    });

    const content = await readFile(
      resolveMarkerPath({ cwd: fixture.root, identity: "alice" }),
      "utf8",
    );
    expect(JSON.parse(content)).toEqual({ schemaVersion: 1, harnesses: [] });
  });
});
