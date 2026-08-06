/**
 * Exact wire-compatibility coverage for the session envelope family.
 *
 * These tests invoke the built CLI against deterministic repositories, prove
 * the transport is one compact JSON value plus a trailing newline, and then
 * compare normalized bytes without sorting keys or rebuilding the payload.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocusAbsolutePathSchema } from "../../src/lib/locus/schema/limits.js";
import {
  normalizeSessionEnvelope,
  prepareSessionEnvelopeFixture,
  PRIMARY_TOKEN,
  REMOTE_TOKEN,
  WORKTREE_PARENT_TOKEN,
  WORKTREE_TOKEN,
  type SessionEnvelopeFixture,
} from "../helpers/session-envelope-compat.js";
import { runArcNoTty } from "./helpers.js";

const GOLDEN_DIR = join(import.meta.dirname, "..", "fixtures", "session-envelope");
const UPDATE_GOLDENS = process.env.UPDATE_SESSION_ENVELOPE_GOLDENS === "1";

async function expectGolden(name: string, value: unknown): Promise<void> {
  const content = `${JSON.stringify(value)}\n`;
  const path = join(GOLDEN_DIR, name);
  if (UPDATE_GOLDENS) {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(path, content);
  }
  expect(content).toBe(await readFile(path, "utf8"));
}

async function capture(
  fixture: SessionEnvelopeFixture,
  args: string[],
): Promise<Record<string, unknown>> {
  const result = await runArcNoTty(args, fixture.cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  expect(result.stdout).toBe(`${JSON.stringify(parsed)}\n`);
  return normalizeSessionEnvelope(parsed, fixture.normalization) as Record<string, unknown>;
}

describe("session envelope normalization contract", () => {
  let fixture: SessionEnvelopeFixture | undefined;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
  });

  it("keeps every placeholder parseable as the absolute path it stands in for", () => {
    for (const token of [
      PRIMARY_TOKEN,
      WORKTREE_PARENT_TOKEN,
      WORKTREE_TOKEN,
      REMOTE_TOKEN,
    ]) {
      expect(LocusAbsolutePathSchema.safeParse(token).success, token).toBe(true);
    }
  });

  it("orders every fixture root deterministically against the primary", async () => {
    fixture = await prepareSessionEnvelopeFixture("branch-gone");
    const primary = fixture.primary;
    const siblings = fixture.normalization.roots
      .map(([path]) => path)
      .filter((path) => path !== primary);

    expect(siblings.length).toBeGreaterThan(0);
    for (const path of siblings) {
      expect(path.startsWith(primary), path).toBe(true);
    }
  });

  it("keeps randomized SHA-256 generations stable and parseable", () => {
    const normalized = normalizeSessionEnvelope(
      {
        first: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        repeated: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        second: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      { roots: [] },
    );

    expect(normalized).toEqual({
      first: `sha256:${"1".padStart(64, "0")}`,
      repeated: `sha256:${"1".padStart(64, "0")}`,
      second: `sha256:${"2".padStart(64, "0")}`,
    });
  });
});

describe("session envelope wire compatibility", () => {
  let fixture: SessionEnvelopeFixture | undefined;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
  });

  it("locks the primary Orient/materialization assembly arm", async () => {
    fixture = await prepareSessionEnvelopeFixture("orient");
    const normalized = await capture(
      fixture,
      ["status", "--session-init", "--write-compaction-seed", "--json"],
    );
    expect(normalized).toHaveProperty("roster");
    expect(normalized).toHaveProperty("materializableWorkUnits");
    expect(normalized).toHaveProperty("inFlightComposition");
    expect(normalized).toHaveProperty("compactionSeedWrite");
    await expectGolden("session-init-orient.json", normalized);
  });

  it("locks the linked active-resume arm with cohort and cursor insertions", async () => {
    fixture = await prepareSessionEnvelopeFixture("active-resume");
    const normalized = await capture(fixture, ["status", "--session-init", "--json"]);
    expect(normalized).toHaveProperty("cohortDocPath");
    expect(normalized).toHaveProperty("taskCursor");
    expect(normalized).not.toHaveProperty("roster");
    await expectGolden("session-init-active-resume.json", normalized);
  });

  it("locks the linked branchless current-husk arm", async () => {
    fixture = await prepareSessionEnvelopeFixture("current-husk");
    const normalized = await capture(fixture, ["status", "--session-init", "--json"]);
    expect(normalized).toHaveProperty("currentHusk");
    await expectGolden("session-init-current-husk.json", normalized);
  });

  it("locks the branch-gone recovery arm", async () => {
    fixture = await prepareSessionEnvelopeFixture("branch-gone");
    const normalized = await capture(fixture, ["status", "--session-init", "--json"]);
    expect(normalized).toHaveProperty("roster");
    expect(normalized).toHaveProperty("recovery");
    await expectGolden("session-init-branch-gone.json", normalized);
  });

  it("locks the real probe-error branch and identity-scoped omissions", async () => {
    fixture = await prepareSessionEnvelopeFixture("identity-missing");
    const normalized = await capture(fixture, ["status", "--session-init", "--json"]);
    expect(normalized.user).toEqual({
      ok: false,
      error: {
        kind: "identity-missing",
        message: "User probe skipped: `arc.identity` is not configured in git config.",
      },
    });
    for (const key of [
      "retiredSubdirs",
      "errandSweep",
      "inboxState",
      "partialPushMarker",
      "compactionAdvisory",
    ]) {
      expect(normalized).not.toHaveProperty(key);
    }
    await expectGolden("session-init-identity-missing.json", normalized);
  });
});

describe("recovery-audit wire compatibility", () => {
  let fixture: SessionEnvelopeFixture | undefined;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
  });

  async function writeSeed(current: SessionEnvelopeFixture): Promise<void> {
    const result = await runArcNoTty(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      current.cwd,
    );
    expect(result.exitCode, result.stderr).toBe(0);
  }

  it("locks the complete record-less-checkout report", async () => {
    fixture = await prepareSessionEnvelopeFixture("active-resume");
    await writeSeed(fixture);
    const normalized = await capture(fixture, ["recover", "audit", "--json"]);
    expect(normalized.verdict).toMatchObject({
      status: "stop",
      ready: false,
      stopReasons: expect.arrayContaining([
        expect.objectContaining({ kind: "load-set-drift" }),
        expect.objectContaining({ kind: "task-cursor-unresolved" }),
      ]),
    });
    await expectGolden("recovery-audit-ready.json", normalized);
  });

  it("locks the complete post-seed dirty-path-drift report", async () => {
    fixture = await prepareSessionEnvelopeFixture("active-resume");
    await writeSeed(fixture);
    await writeFile(join(fixture.cwd, "dirty-after-seed.txt"), "drift\n");
    const normalized = await capture(fixture, ["recover", "audit", "--json"]);
    expect(normalized.verdict).toMatchObject({
      status: "stop",
      ready: false,
      stopReasons: expect.arrayContaining([
        expect.objectContaining({ kind: "load-set-drift" }),
        expect.objectContaining({ kind: "dirty-path-drift" }),
        expect.objectContaining({ kind: "task-cursor-unresolved" }),
      ]),
    });
    await expectGolden("recovery-audit-dirty-path-drift.json", normalized);
  });

  it("keeps missing and invalid seed stops targeted and machine-readable", async () => {
    fixture = await prepareSessionEnvelopeFixture("active-resume");
    const missing = await capture(fixture, ["recover", "audit", "--json"]);
    expect(missing).toMatchObject({
      seedPath: `${WORKTREE_TOKEN}/.arc/user/test-user/.internal/compaction-seed.json`,
      verdict: { status: "stop", ready: false, stopReasons: [{ kind: "seed-missing" }] },
    });

    const seedDir = join(fixture.cwd, ".arc", "user", "test-user", ".internal");
    await mkdir(seedDir, { recursive: true });
    await writeFile(join(seedDir, "compaction-seed.json"), "{not-json\n");
    const invalid = await capture(fixture, ["recover", "audit", "--json"]);
    expect(invalid).toMatchObject({
      verdict: { status: "stop", ready: false, stopReasons: [{ kind: "seed-invalid" }] },
    });
  });
});
