/** Withdrawal conflict values retain the archive fault blocking their completed placement. */

import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const auxiliaryQuarter = ArchiveQuarterSchema.parse("2026-q3"), ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
const archive = `refs/arc/archive/${auxiliaryQuarter}`, provenance = { verb: "archive", lifecycleAction: "archive" };
const document = (text: string) => `# Entries\n\n## Inbound\n\n### **Concern**\n\n- _Id:_ \`11111111\`\n\n${text}\n`;

const cases = (["default", "separate"] as const).flatMap(layout =>
  (["misplaced", "missing-root", "missing-nested"] as const).map(damage => ({ layout, damage })));

it.each(cases)("holds withdrawal on $damage ancestor evidence and retries restoration ($layout)", async ({ layout, damage }) => {
  const h = await refSyncFixture(layout), scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
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
    ? { path: metadataPath, content: JSON.stringify(damage === "misplaced"
      ? { ...metadata, primary: { ...metadata.primary, placement: { kind: "active" } } } : metadata, null, 2) } : entry), { gitDir: h.a.gitDir });
  const nested = (await h.a.git(["rev-parse", `${damaged.tip}:01_auxiliary`])).stdout.trim();
  const history = `refs/arc/history/work/${auxiliary.reference.owner.uid}`;
  expect(nested).not.toBe((await h.a.git(["rev-parse", `${history}^{tree}`])).stdout.trim());
  const oid = damage === "missing-nested" ? nested : damaged.tree;
  const bytes = damage === "misplaced" ? undefined : (await h.a.ports.rawExec([...scope, "cat-file", "tree", oid])).stdout;
  const empty = await plantRef(h.a.root, archive, [], { parents: [damaged.tip], message: "Keep completed history without a current folder", gitDir: h.a.gitDir });
  expect((await h.a.git(["remote", "get-url", h.remoteName])).stdout).toBe(h.origin);
  await h.a.git(["push", "--force", h.remoteName, `${archive}:${archive}`]);
  // Accept the rewrite in tracking too, so no captured tip supplies a healthy placement witness.
  const tracking = `refs/arc-remotes/${h.remoteName}/archive/${auxiliaryQuarter}`;
  const seen = `refs/arc/tmp/seen/${h.remoteName}/archive/${auxiliaryQuarter}`;
  await h.a.git(["fetch", "--atomic", "--no-tags", h.remoteName, `+${archive}:${tracking}`, `+${archive}:${seen}`]);
  expect((await h.a.git(["rev-parse", tracking])).stdout.trim()).toBe(empty.tip);
  expect((await h.a.git(["rev-parse", seen])).stdout.trim()).toBe(empty.tip);
  const before = (await h.a.git(["rev-parse", history])).stdout.trim();
  await h.a.git(["config", "fetch.unpackLimit", "100000"]);
  let removed = false;
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (damage !== "misplaced" && !removed && args.includes("fetch") && options?.input?.includes("refs/arc/")) {
      removed = true;
      await removeLooseObject(h.a.root, oid, h.a.gitDir);
    }
    return result;
  } });
  const held = success(await store.pull());
  if (damage !== "misplaced") {
    expect(removed).toBe(true);
    await expect(h.a.git(["cat-file", "-e", oid])).rejects.toMatchObject({ exitCode: 1 });
  }
  expect(held.pulls.every(pull => pull.status !== "failed")).toBe(true);
  expect(held.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt",
    condition: expect.stringContaining(damage === "misplaced" ? "placement is active, not completed" : archive),
    remedy: { text: damage === "misplaced" ? expect.stringContaining("cannot change an ancestor") : expect.stringMatching(/restore|fetch/iu) },
  }));
  expect(held.pulls.flatMap(pull => pull.notices).some(notice => notice.kind === "end-withdrawn")).toBe(false);
  expect((await h.a.git(["rev-parse", history])).stdout.trim()).toBe(before);
  if (bytes) {
    const restored = await h.a.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  } else await plantRef(h.a.root, archive, [], { parents: [empty.tip, original], message: "Link original placement evidence", gitDir: h.a.gitDir });
  const retried = success(await store.pull());
  expect(retried.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: subject.reference.owner }));
  expect(retried.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.a.git(["show", `${history}:inbound-auxiliary.md`])).stdout).toContain("Independent later edit.");
});
