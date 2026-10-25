/** A temporary anchored checkout bound to an existing operational work-item owner. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import type { LocusPorts } from "../../../src/lib/work-unit/locus-ports.js";

export function boundHolderLookup(record: Pick<StoreRecord, "reference">, location: () => string | null): LocusPorts["findHoldingCheckout"] {
  const subject = boundWorkUnitSubject(record);
  return async request => {
    const path = location();
    return request.kind === "owner" && request.uid === subject.uid && path !== null && path !== request.checkoutPath
      ? { kind: "held", path } : { kind: "none" };
  };
}

export function boundWorkUnitSubject(record: Pick<StoreRecord, "reference">, name: string = record.reference.owner.name): { kind: "work-unit"; name: string; uid: string } {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the checkout owner's UID");
  return { kind: "work-unit", name, uid: owner.uid };
}

export async function boundWorkUnitCheckout(record: StoreRecord): Promise<string> {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the checkout owner's UID");
  const cwd = await mkdtemp(join(tmpdir(), "bound-work-unit-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(record),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return cwd;
}
