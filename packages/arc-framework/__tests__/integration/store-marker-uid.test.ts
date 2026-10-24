/** Registered locus and session readers carry the marker's bound work-unit generation. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

it.each(["locus", "session-init"] as const)("%s carries bound marker UIDs and leaves unbound subjects UID-free", async command => {
  for (const bound of [false, true]) {
    const f = await repairCliFixture(), h = createLifecycleHarness();
    await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
    const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" });
    if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected a minted work-unit identity");
    const uid = primary.reference.owner.uid;
    await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeMarker(f.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z",
      createdFor: { kind: "work-unit", name: "example", ...(bound ? { uid } : {}) } });
    const result = await repairCli(f, command === "locus" ? ["locus", "--json"] : ["status", "--session-init", "--json"], { store: h.store });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const subject = { kind: "work-unit", key: "example", ...(bound ? { uid } : {}) };
    const frame = { entering: { kind: "selected", row: { kind: "work-unit", subject } }, active: { subject },
      roster: expect.arrayContaining([expect.objectContaining({ kind: "work-unit", subject })]),
      primaryAvailability: { kind: "occupied", subject } };
    expect(result.result).toMatchObject(command === "locus" ? { mode: "locus", ok: true, ...frame }
      : { derivedLocusState: { ok: true, value: frame } });
    if (!bound) {
      const prefix = command === "locus" ? "" : "derivedLocusState.value.";
      for (const path of ["entering.row.subject.uid", "active.subject.uid", "primaryAvailability.subject.uid", "roster.0.subject.uid"]) {
        expect(result.result).not.toHaveProperty(`${prefix}${path}`);
      }
    }
  }
}, 60_000);
