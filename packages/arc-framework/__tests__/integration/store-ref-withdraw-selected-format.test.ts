/** Whole-record withdrawal choices keep their stored format through surrounding reconciliation. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry, FormatVersionSchema, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { ConflictRecordSchema } from "../../src/lib/store/conflict.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "archive", lifecycleAction: "archive" };
const declared = createKindRegistry(PRODUCTION_REGISTRATIONS);
const registry = { ...declared, "work-item/inbound": { ...declared["work-item/inbound"], formatVersion: FormatVersionSchema.parse(3) } };
const formatKey = JSON.stringify({ kind: "work-item/inbound" });

function document(text: string): string {
  return `# Entries\n\n## ${ENTRY_CONFIGS["work-item/inbound"].sections[0]}\n\n### **Concern**\n\n- _Id:_ \`11111111\`\n\n${text}\n`;
}

async function plantBefore(side: RefSyncFixture["a"], reference: RecordReference, content: string) {
  const home = expandStoredPath(reference, { registry }), entries = await capturedEntries(side, home.ref);
  const parent = (await side.git(["rev-parse", home.ref])).stdout.trim();
  const metadata = JSON.parse((await side.git(["show", `${parent}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
  metadata.formats[formatKey] = 2;
  await plantRef(side.root, home.ref, entries.map(entry => entry.path === home.path ? { path: entry.path, content }
    : entry.path === home.metadataPath ? { path: entry.path, content: JSON.stringify(metadata) } : entry),
  { parents: [parent], message: `External capture\n\nArc-Actor: ${side.carry().actor}\n`, gitDir: side.gitDir });
}

describe.each(["default", "separate"] as const)("withdrawal selected formats in %s", layout => {
  it.each(["unchanged", "independent current"] as const)("keeps the selected whole document's own format with %s local state", async state => {
    const h = await refSyncFixture(layout);
    const a = createRefStore({ ...h.a.ports, registry }), b = createRefStore({ ...h.b.ports, registry });
    const start = async (name: string) => {
      const written = success(await a.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
        content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      return success(await a.read({ reference: written.reference }));
    };
    const primary = await start("format-ended"), auxiliary = await start("format-retained");
    const reference = RecordReferenceSchema.parse({ kind: "work-item/inbound", owner: auxiliary.reference.owner });
    success(await a.write({ action: "put", reference, expected: null, content: document("Common."), provenance }));
    success(await a.push()); success(await b.pull());
    const malformed = document("Before.") + "\n" + document("Repeated managed ID.").split("\n\n").slice(2).join("\n\n");
    await plantBefore(h.a, reference, malformed);
    const before = success(await a.read({ reference }));
    const home = expandStoredPath(reference, { registry });
    const beforeBlob = (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    expect(before.formatVersion).toBe(2);
    const local = success(await a.read({ reference: primary.reference }));
    success(await a.batch({ writes: [
      { action: "put", reference: local.reference, expected: local.version, content: local.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
      { action: "put", reference, expected: before.version, content: document("Unpublished end.") },
    ], provenance }));
    expect(success(await a.read({ reference })).formatVersion).toBe(3);
    if (state === "independent current") {
      const written = success(await a.read({ reference }));
      success(await a.write({ action: "put", reference, expected: written.version, content: document("Later local state."),
        provenance: { verb: "save", lifecycleAction: "capture" } }));
    }
    const selected = state === "unchanged" ? before : success(await a.read({ reference }));
    const selectedBlob = state === "unchanged" ? beforeBlob : (await h.a.git(["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const remote = success(await b.read({ reference: primary.reference })), remoteEntry = success(await b.read({ reference }));
    success(await b.batch({ writes: [
      { action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } },
      { action: "put", reference, expected: remoteEntry.version, content: document("Published end.") },
    ], provenance }));
    success(await b.push());
    const notices = success(await a.pull()).pulls.flatMap(pull => pull.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    const withdrawn = (await h.a.git(["log", "-1", "--format=%H", "--grep=Arc-Withdrawn-End:", home.ref])).stdout.trim();
    expect(withdrawn).toMatch(/^[0-9a-f]{40,64}$/u);
    expect((await h.a.git(["rev-parse", `${withdrawn}:${home.path}`])).stdout.trim()).toBe(selectedBlob);
    const metadata = JSON.parse((await h.a.git(["show", `${withdrawn}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
    expect(metadata.formats[formatKey]).toBe(selected.formatVersion);
    const history = success(await a.history({ reference }));
    expect(history).toContainEqual(expect.objectContaining({ content: selected.content, version: selected.version,
      provenance: expect.objectContaining({ lifecycleAction: state === "unchanged" ? "withdraw-end" : "capture" }) }));
    const current = success(await a.read({ reference }));
    const conflicts = await Promise.all(current.conflicts.map(async reference =>
      ConflictRecordSchema.parse(JSON.parse(success(await a.read({ reference })).content))));
    expect(conflicts).toContainEqual(expect.objectContaining({ location: { kind: "record" },
      current: expect.objectContaining({ value: expect.objectContaining({ content: malformed, formatVersion: 2, version: before.version }) }) }));
  }, 90_000);
});
