/**
 * Unit tests for the active-WU resolver consumed by the release commit
 * and push handlers.
 *
 * Composes `readActiveMetaCandidates` from the active-meta reader;
 * accepts any `**State:**` value and refuses only on no-candidate or
 * multi-candidate ambiguity. Both refusal shapes map to refusal code 10
 * (`no-active-wu`); the multi-candidate path carries a disambiguation
 * hint that surfaces in the refusal message.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveActiveWu } from "../../../src/lib/release/wu-resolution.js";

interface Fixture {
  root: string;
  activeDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-wu-resolution-"));
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  return { root, activeDir };
}

function statusBody(state: string): string {
  return [
    "# Metadata: Sample",
    "",
    `- **State:** ${state}`,
    "- **Branch:** technical/sample",
    "- **Task List:** `tasks-sample.md`",
    "",
  ].join("\n");
}

async function writeMetaCandidate(
  activeDir: string,
  name: string,
  state: string,
): Promise<void> {
  await writeFile(join(activeDir, `meta-${name}.md`), statusBody(state));
}

describe("resolveActiveWu — single full-layout candidate", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("resolves with name parsed from the meta-*.md filename at the flat root", async () => {
    await writeMetaCandidate(fixture.activeDir, "foo", "Active");

    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result).toEqual({
      status: "resolved",
      path: ".arc/active/meta-foo.md",
      category: "",
      name: "foo",
    });
  });

  it.each([
    ["Planning"],
    ["Active"],
    ["Integrating"],
    ["Shipped"],
    ["Paused (2026-04-12)"],
  ])("resolves regardless of **State:** value (%s)", async (state) => {
    await writeMetaCandidate(fixture.activeDir, "bar", state);

    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result).toMatchObject({ status: "resolved", name: "bar" });
  });
});

describe("resolveActiveWu — refusal on ambiguity", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("refuses when .arc/active/ exists but holds no candidates", async () => {
    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.hint).toBeUndefined();
    }
  });

  it("refuses when .arc/active/ does not exist at all", async () => {
    await rm(fixture.activeDir, { recursive: true, force: true });

    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result.status).toBe("refused");
  });

  it("refuses with a disambiguation hint when multiple candidates resolve", async () => {
    await writeMetaCandidate(fixture.activeDir, "foo", "Active");
    await writeMetaCandidate(fixture.activeDir, "bar", "Planning");

    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.hint).toBeDefined();
      expect(result.hint).toMatch(/disambiguat/i);
    }
  });
});

describe("resolveActiveWu — lite layout", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("resolves the single status.md with empty category and name", async () => {
    await writeFile(join(fixture.activeDir, "status.md"), statusBody("Active"));

    const result = await resolveActiveWu({ cwd: fixture.root });

    expect(result).toEqual({
      status: "resolved",
      path: ".arc/active/status.md",
      category: "",
      name: "",
    });
  });
});
