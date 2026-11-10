/** Later accepted entry edits survive an open conflict's rendering and subsequent saves. */
import { afterEach, expect, it } from "vitest";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { refreshWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { renderRecordContent } from "../../../../src/lib/store/projection/record-render.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

it("keeps newer entry text through a notice, independent save, and explicit resolution", async () => {
  const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n";
  const f = await createStoredConflictFixture({ kind: "personal/inbox", base,
    current: base.replace("base first", "stored first"), incoming: base.replace("base first", "incoming first") });
  fixtures.push(f);
  const newer = f.record.content.replace("stored first", "newer accepted first");
  success(await f.store.write({ action: "put", reference: f.entry.reference, expected: f.record.version,
    content: newer, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const record = success(await f.store.read({ reference: f.entry.reference }));
  const unshown = success(await renderRecordContent(f.context, { record, content: newer, stamped: false }));
  expect(unshown).toMatchObject({ content: newer, notices: [], state: { markers: null, unshown: record.conflicts } });
  const index = await refreshWriteBackFixture(f, f.index);
  const entry = index.entries[f.path];
  if (entry?.kind !== "record") throw new Error("Refreshed entry missing");
  expect(entry).toMatchObject({ markers: null, notices: record.conflicts });
  const rendered = parseStampedFile(await f.file()).content;
  expect(rendered).toBe(newer);
  await f.edit(rendered.replace("base second", "independent second"));
  const saved = await writeBackFile(f.context, index, { ...f.request, entry });
  const content = newer.replace("base second", "independent second");
  expect(success(await f.store.read({ reference: f.entry.reference }))).toMatchObject({ content, conflicts: record.conflicts });
  expect(saved.result.answer).toBe("taken-in");
  const conflict = record.conflicts[0];
  if (conflict === undefined) throw new Error("Open conflict missing");
  const resolved = await writeBackFile(f.context, saved.index, { ...f.request, entry: saved.result.entry,
    resolution: { kind: "stored", reference: conflict } });
  expect(resolved.result.answer).toBe("taken-in");
  expect(success(await f.store.read({ reference: f.entry.reference }))).toMatchObject({ content, conflicts: [] });
});
