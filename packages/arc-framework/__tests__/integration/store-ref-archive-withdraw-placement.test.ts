/** Withdrawal conflict values retain the archive fault blocking their completed placement. */

import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const auxiliaryQuarter = ArchiveQuarterSchema.parse("2026-q3"), ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
const archive = `refs/arc/archive/${auxiliaryQuarter}`, provenance = { verb: "archive", lifecycleAction: "archive" };
const document = (text: string) => `# Entries\n\n## Inbound\n\n### **Concern**\n\n- _Id:_ \`11111111\`\n\n${text}\n`;

it("holds withdrawal on an owned ancestor placement fault and retries with restored evidence", async () => {
  const h = await refSyncFixture();
  const start = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  const subject = await start("subject"), auxiliary = await start("auxiliary");
  const beforeAuxiliary = success(await h.a.store.read({ reference: auxiliary.reference }));
  success(await h.a.store.write({ action: "put", reference: beforeAuxiliary.reference, expected: beforeAuxiliary.version,
    content: beforeAuxiliary.content, placement: { kind: "completed", quarter: auxiliaryQuarter }, provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const original = (await h.a.git(["rev-parse", archive])).stdout.trim();
  const primary = success(await h.a.store.read({ reference: subject.reference }));
  const reference = RecordReferenceSchema.parse({ kind: "work-item/inbound", owner: auxiliary.reference.owner });
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
    { action: "put", reference, expected: null, content: document("End contribution.") },
  ], provenance }));
  const created = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: created.version,
    content: document("Independent later edit."), provenance: { verb: "save", lifecycleAction: "save" } }));
  const peer = success(await h.b.store.read({ reference: subject.reference }));
  success(await h.b.store.write({ action: "put", reference: peer.reference, expected: peer.version, content: peer.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance }));
  success(await h.b.store.push());
  if (!("uid" in auxiliary.reference.owner)) throw new Error("Expected auxiliary UID");
  const metadataPath = `01_auxiliary/metadata-${auxiliary.reference.owner.uid}.json`;
  const entries = await capturedEntries(h.a, archive);
  const metadata = JSON.parse((await h.a.git(["show", `${archive}:${metadataPath}`])).stdout);
  // No healthy ancestor may supply the missing original placement. The current quarter remains structurally valid.
  const damaged = await plantRef(h.a.root, archive, entries.map(entry => entry.path === metadataPath
    ? { path: metadataPath, content: JSON.stringify({ ...metadata, primary: { ...metadata.primary, placement: { kind: "active" } } }) } : entry));
  const empty = await plantRef(h.a.root, archive, [], { parents: [damaged.tip], message: "Keep completed history without a current folder" });
  expect((await h.a.git(["remote", "get-url", h.remoteName])).stdout).toBe(h.origin);
  await h.a.git(["push", "--force", h.remoteName, `${archive}:${archive}`]);
  const history = `refs/arc/history/work/${auxiliary.reference.owner.uid}`;
  const before = (await h.a.git(["rev-parse", history])).stdout.trim();
  const held = success(await h.a.store.pull());
  expect(held.pulls.every(pull => pull.status !== "failed")).toBe(true);
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt",
    condition: expect.stringContaining("placement is active, not completed"),
    remedy: { text: expect.stringContaining("cannot change an ancestor") },
  }));
  expect(held.pulls.flatMap(pull => pull.notices).some(notice => notice.kind === "end-withdrawn")).toBe(false);
  expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(before);
  await plantRef(h.a.root, archive, [], { parents: [empty.tip, original], message: "Link original placement evidence" });
  const retried = success(await h.a.store.pull());
  expect(retried.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: subject.reference.owner }));
  expect(retried.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.a.git(["show", `${history}:inbound-auxiliary.md`])).stdout).toContain("Independent later edit.");
});
