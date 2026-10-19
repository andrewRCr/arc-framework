/** Missing-primary occupancy requires complete terminal observation before release or restart. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/schema.js";
import { writeWorktreeMarker, readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { inspectCheckoutMarker } from "../../../src/lib/locus/marker-occupancy.js";
import { runLocusRelease } from "../../../src/lib/locus/release.js";
import type { Store } from "../../../src/lib/store/contract.js";

it.each(["abandon", "decompose", "rename"] as const)("withholds creation-residue release for %s lineage, including observation failure and repair", async kind => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-terminal-admission-")), holder = join(cwd, "holder");
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(holder); await mkdir(join(cwd, ".git"));
  const h = createLifecycleHarness(), primary = await h.seedMeta("ended");
  const reference = recordReferences["lineage/transition"](primary.reference.owner);
  const lineage = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "ended", uid: primary.reference.owner.type === "work-item" ? primary.reference.owner.uid : undefined },
    kind, successors: kind === "abandon" ? [] : [{ name: "successor" }], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
  ok(await h.store.batch({ writes: [{ action: "remove", reference: primary.reference, expected: primary.version },
    { action: "put", reference, expected: null, content: writeLineageRecord(lineage) }], provenance: { verb: kind, lifecycleAction: kind } }));
  await writeWorktreeMarker(holder, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "ended" }, spawningIdentity: "test-user", createdAt: "2026-10-19T00:00:00Z" });
  let unavailable = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => unavailable && input.reference.kind === "lineage/transition"
    ? { status: "refused", refusal: { code: "refused", class: "terminal", message: "Lineage unavailable", condition: "Lineage unavailable", remedy: { text: "Restore terminal evidence" } } }
    : h.store.read(input);
  const topology = `worktree ${cwd}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0worktree ${holder}\0HEAD ${"a".repeat(40)}\0detached\0\0`;
  const exec = async (_command: string, args: string[]) => ({ stdout: args.includes("--git-common-dir") ? join(cwd, ".git") : topology });
  const release = () => runLocusRelease({ cwd, exec, store, identity: "test-user", baseBranch: "main", chdir: () => {} }, "ended");
  expect(await release()).toMatchObject({ status: "refused", reason: expect.stringContaining("Restore terminal evidence") });
  expect(await readWorktreeMarker(holder)).toMatchObject({ kind: "present" });
  unavailable = false;
  expect(await inspectCheckoutMarker({ cwd: holder, store })).toMatchObject({ kind: "occupied", missingRecord: false });
  expect(await release()).toMatchObject({ status: "refused", reason: expect.stringContaining("retained lineage") });
  expect(await readWorktreeMarker(holder)).toMatchObject({ kind: "present" });
});
