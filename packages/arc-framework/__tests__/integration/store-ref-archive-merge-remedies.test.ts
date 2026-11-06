/** Archive merge diagnostics distinguish immutable bases from current tips. */

import { expect, it } from "vitest";
import { plantRef } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const archive = "refs/arc/archive/2026-q4";
const localRef = "refs/fixture/archive-local";
const misplaced = [
  { path: "01_alpha/metadata-12345678-1234-4234-8234-123456789abc.json", content: JSON.stringify({
    formatVersion: 1, slug: "alpha", formats: {}, primary: { role: "work-item/meta", placement: { kind: "active" } },
  }) },
  { path: "01_alpha/meta-alpha.md", content: "# Alpha\n" },
];

it.each(["base", "local", "incoming"] as const)("keeps the %s archive merge side's placement remedy", async side => {
  const h = await refSyncFixture();
  // An archive-only graph has no item histories that could diagnose a quarter before reconciliation.
  const base = await plantRef(h.a.root, "refs/fixture/archive-base", side === "base" ? misplaced : [], { message: "Archive base" });
  const local = await plantRef(h.a.root, localRef, side === "local" ? misplaced : [], { parents: [base.tip], message: "Local archive" });
  const incoming = await plantRef(h.a.root, archive, side === "incoming" ? misplaced : [], { parents: [base.tip], message: "Incoming archive" });
  await h.a.git(["push", h.remoteName, `${localRef}:${localRef}`, `${archive}:${archive}`]);
  await h.b.git(["fetch", "--no-tags", "--refmap=", h.origin, `${localRef}:${archive}`]);
  const result = success(await h.b.store.pull());
  expect(result.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({
    kind: "namespace-corrupt", ref: archive,
    condition: expect.stringContaining("placement is active, not completed"),
    remedy: { text: side === "base" ? expect.stringContaining("cannot change an ancestor") : expect.stringContaining("completed placement") },
  }));
  expect((await h.b.git(["rev-parse", archive])).stdout.trim()).toBe(local.tip);
  if (side === "base") return;
  if (side === "local") await plantRef(h.b.root, archive, [], { parents: [local.tip], message: "Repair local archive" });
  else {
    await plantRef(h.a.root, archive, [], { parents: [incoming.tip], message: "Repair incoming archive" });
    await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
  }
  expect(success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect((await h.b.git(["ls-tree", "-r", "--name-only", archive])).stdout).toBe("");
});
