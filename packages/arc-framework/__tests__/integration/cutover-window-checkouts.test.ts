/** Checkout discovery reads the explicitly named repository and preserves native registrations and markers. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { readWindowCheckouts, type WindowCheckoutKind } from "../../src/scripts/cutover-window/checkouts.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker, type WorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { makeHuskStamp } from "../helpers/worktree-husk-fixture.js";

it("classifies real linked registrations, including adopted work-unit markers and missing folders, without writes", async () => {
  const h = await windowFixture();
  const base = { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z" };
  const unit: WorktreeMarker = { ...base, createdFor: { kind: "work-unit", name: "alpha" } };
  const claim = { kind: "errand" as const, slug: "example", claimId: "a".repeat(32) };
  const cases: { name: string; kind: WindowCheckoutKind; marker?: WorktreeMarker }[] = [
    { name: "unit", kind: "marked", marker: unit },
    { name: "adopted", kind: "marked", marker: { ...unit, spawnedByArc: false } },
    { name: "errand", kind: "marked", marker: { ...base, createdFor: claim, provisioning: "ready" } },
    { name: "unmarked", kind: "no-marker" },
    { name: "branch", kind: "branch-subject", marker: { ...base, createdFor: { kind: "branch", ref: "spike/example" } } },
    { name: "pending", kind: "pending", marker: { ...base, createdFor: claim, provisioning: "pending" } },
    { name: "husk", kind: "husk", marker: { ...unit, husk: makeHuskStamp({ sha: h.flip.head, at: base.createdAt,
      subject: { kind: "work-unit", name: "alpha" }, branch: "case/husk" }) } },
    { name: "malformed", kind: "malformed-marker" },
    { name: "missing", kind: "missing-folder" },
  ];
  const expected: { path: string; kind: WindowCheckoutKind }[] = [{ path: h.root, kind: "primary" }];
  for (const item of cases) {
    const path = join(h.root, ".arc-fixture/checkouts", item.name);
    await h.git("git", ["worktree", "add", "-b", `case/${item.name}`, path, "HEAD"]);
    if (item.marker) {
      await writeWorktreeMarker(path, item.marker);
      expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present" });
    }
    if (item.name === "malformed") {
      const markerPath = resolveWorktreeMarkerPath(path);
      await mkdir(dirname(markerPath), { recursive: true }); await writeFile(markerPath, "{");
    }
    if (item.name === "missing") await rm(path, { recursive: true });
    expected.push({ path, kind: item.kind });
  }
  const refs = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const registrations = (await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout;
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => {
    const ports = createDefaultStorePorts({ checkoutRoot: repo });
    return { operation: "check", status: "reported", findings: [], data: await readWindowCheckouts({ repo, exec: ports.exec }) };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  expect(exit, stderr.join("")).toBe(0);
  expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "reported", data: expect.arrayContaining(expected.map(item => expect.objectContaining(item))) });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
  expect((await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout).toBe(registrations);
}, 30_000);
