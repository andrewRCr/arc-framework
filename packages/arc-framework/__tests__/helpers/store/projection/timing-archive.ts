/** Prepare a settled cold archive in linear fixture work, using native records and the production rendering codec. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PreparedRepositoryTemplate } from "../../prepared-repository.js";
import type { Store } from "../../../../src/lib/store/index.js";
import type { ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { resolveArcPath } from "../../../../src/lib/layout/index.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { readProjectionIndex, commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { readProjectionInventory } from "../../../../src/lib/store/projection/inventory.js";
import { createProjectionReadMemo } from "../../../../src/lib/store/projection/record-source.js";
import { createProjectionProtectionEvidence } from "../../../../src/lib/store/projection/protection-evidence.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { projectionEntryForRecord } from "../../../../src/lib/store/projection/materialization-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { WorkUnitReadPlacementSchema } from "../../../../src/lib/store/placement.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { success } from "../suite-tools.js";

export async function expandSettledTimingArchive(checkout: string, template: PreparedRepositoryTemplate,
  store: Store, ports: ProjectionEnginePorts): Promise<void> {
  await ports.exec("git", ["fetch", "--no-tags", template.root, "+refs/arc/*:refs/arc/*"], { cwd: checkout });
  const location = await locateProjection(checkout, ports);
  const result = await withProjectionLock(location, async session => {
    const disk = await readProjectionIndex(location, true, { groups: "all" });
    if (disk.kind !== "index") throw new Error("Archive expansion needs a materialized baseline");
    const version = success(await store.version()), identity = SlugSchema.parse("andrew");
    const inventory = await readProjectionInventory(store, identity, version);
    if (inventory.diagnostics.length > 0) throw new Error("Archive expansion inventory is incomplete");
    const key = (reference: import("../../../../src/lib/store/index.js").RecordReference) => JSON.stringify(reference);
    const records = new Map(inventory.records.map(record => [key(record.reference), record]));
    const entries = { ...disk.index.entries };
    for (const [path, entry] of Object.entries(entries)) {
      if (entry.kind !== "record") throw new Error("The timing baseline must contain only settled records");
      const record = records.get(key(entry.reference));
      if (record === undefined || gitBlobId(record.content, "sha1") !== entry.base.blob) throw new Error("Archive expansion changed baseline content");
      entries[path] = { ...entry, base: { ...entry.base, version: record.version } };
    }
    const source = createProjectionReadMemo(inventory.source);
    const evidence = createProjectionProtectionEvidence({ source, checkout, exec: ports.exec });
    const renderer = createRecordRenderer({ store, protection: createProjectionProtection({ store, checkout, identity, exec: ports.exec, evidence }) });
    const folders = new Set<string>();
    for (const record of inventory.records) {
      if (record.placement?.kind !== "completed") continue;
      const placement = WorkUnitReadPlacementSchema.parse(record.placement), slug = record.reference.owner.name;
      if (placement.kind !== "completed") throw new Error("The archive timing record is live");
      const path = record.reference.kind === "work-item/meta" ? resolveArcPath({ kind: "work-unit-artifact", slug, placement, artifact: "meta" })
        : record.reference.kind === "work-item/companion" && typeof record.reference.key === "string"
          ? resolveArcPath({ kind: "work-unit-companion", slug, placement, key: record.reference.key }) : null;
      if (path === null) throw new Error("Unsupported native archive timing record");
      const entry = projectionEntryForRecord(record, path, "sha1");
      const rendered = success(await renderer({ record, content: record.content, stamped: true }));
      const bytes = renderStampedFile({ content: rendered.content, stamp: entry.base.blob, notices: rendered.notices });
      const absolute = join(checkout, path), folder = dirname(absolute);
      if (!folders.has(folder)) { await mkdir(folder, { recursive: true }); folders.add(folder); }
      await chmod(absolute, 0o644).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
      await writeFile(absolute, bytes);
      if (rendered.protected) await chmod(absolute, 0o444);
      entries[path] = { ...entry, pending: false, stat: await readStat(absolute), written: gitBlobId(bytes, "sha1"),
        protected: rendered.protected ?? false, markers: rendered.state.markers, notices: rendered.state.notices, unshown: rendered.state.unshown };
    }
    await commitProjectionIndex({ location, checkout, index: { ...disk.index, state: version, entries }, checkpoint: session.step });
  });
  if (result.status !== "done") throw new Error(`Archive fixture lease ${result.status}`);
}
