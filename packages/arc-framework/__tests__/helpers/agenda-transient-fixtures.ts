/** Transient agenda fixtures derive checkout roles from validated authority records. */
import { TransientIdentityRecordSchema, projectLocusIdentity } from "../../src/lib/errand/identity-record.js";
import type { TransientIdentitySnapshot } from "../../src/lib/errand/identity-snapshot.js";
import { parseOccupancyMarker, type OccupancyMarker } from "../../src/lib/locus/occupancy-marker.js";
import { projectDerivedCheckoutRow } from "../../src/lib/locus/derived-roster.js";
import { baseFrame, frameWithRow, selectedRow } from "./agenda-fixtures.js";
import { createSignalAgendaFixture } from "./agenda-signal-fixtures.js";
import { worktreeSync, type SessionInitProbeOverrides } from "./session-init-fixtures.js";

type Kind = "errand" | "partial-errand" | "groom" | "housekeep";

/** Project the exact marker-selected role, retaining ordinary transient corroboration. */
export function transientRow(kind: Kind, partialGroom = false) {
  const partial = kind === "partial-errand" || partialGroom;
  const slug = kind === "groom" ? "groom-demo" : "selected";
  const branch = partial ? "main" : `chore/${slug}`;
  const common = { version: 3, slug, claimId: "c".repeat(32), createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z" };
  const record = kind === "partial-errand" ? null : TransientIdentityRecordSchema.parse(kind === "groom"
    ? { ...common, kind: "groom", anchorStub: "demo", members: ["demo"], openedBaseHead: "a".repeat(40),
      protection: partial ? "partial" : "full", branch: partial ? null : branch, state: "open", changeRequest: null }
    : kind === "housekeep" ? { ...common, kind: "errand", purpose: "housekeep-routing", branch, state: "open", savedHead: null, changeRequest: null }
      : { ...common, kind: "errand", purpose: "errand", intent: "Selected concern", branch, origin: "description", originEntry: null,
        state: "open", savedHead: null, changeRequest: null });
  const identity = record === null ? null : projectLocusIdentity(record);
  const identities: TransientIdentitySnapshot = identity === null ? { kind: "absent" } : { kind: "complete", tip: "a".repeat(40),
    records: new Map(record === null ? [] : [[slug, record]]), objects: new Map(), projections: new Map([[slug, identity]]), diagnostics: [] };
  const createdFor: OccupancyMarker["createdFor"] = kind === "partial-errand" ? { kind, slug, claimId: null }
    : { kind, slug, claimId: common.claimId };
  const marker = parseOccupancyMarker(JSON.stringify({ spawnedByArc: !partial, provisioning: "ready", createdFor }));
  if (marker.kind !== "valid") throw new Error(marker.message);
  const original = selectedRow(baseFrame());
  return projectDerivedCheckoutRow({ checkout: { ...original.checkout, path: partial ? "/repo" : "/repo/transient",
    primary: partial, branch },
    marker: { kind: "present", generation: `sha256:${"d".repeat(64)}`, marker: marker.marker },
    activeMeta: { kind: "absent" }, completed: { status: "available", records: new Map() }, identities,
    primarySafety: { kind: "complete", clean: true, onBase: partial },
  });
}

/** Compose and validate the whole session envelope over a real projected transient row. */
export async function createTransientAgendaFixture(kind: Kind, probes: SessionInitProbeOverrides = {}, partialGroom = false) {
  const row = transientRow(kind, partialGroom);
  const fixture = await createSignalAgendaFixture(undefined, {
    derivedLocusState: async () => frameWithRow(row),
    worktree: async () => worktreeSync({ branch: row.checkout.branch }),
    worktreeIdentity: async () => row.checkout.primary ? { kind: "primary" } : { kind: "linked", path: row.checkout.path },
    ...probes,
  }, false);
  fixture.input.entry.cwd = row.checkout.path;
  return { ...fixture, row };
}
