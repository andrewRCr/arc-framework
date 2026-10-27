import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

describe.each(["default", "separate"] as const)("ended keeper observation in %s", layout => {
  it.each(["push", "read"] as const)("retains a newer leased fetch's keeper after old %s end proof", async role => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("ended-keeper"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-keeper" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a stored owner");
    const ref = `refs/arc/work/${owner.uid}`, tracking = `refs/arc-remotes/${h.remoteName}/work/${owner.uid}`;
    const seen = `refs/arc/tmp/seen/${h.remoteName}/work/${owner.uid}`, key = `refs/arc/tmp/seen/${h.remoteName}`;
    success(await h.a.store.push()); success(await h.b.store.pull());
    const original = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
    const rows = (await h.remote("git", ["ls-tree", "-r", "--format=%(objectname) %(path)", ref])).stdout.trim().split("\n");
    const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    await h.b.git(["config", `remote.${h.remoteName}.arc-state`, role]);
    let armed = true, newer = "";
    const observer = createRefStore({ ...h.b.ports, lock: async (name, wait) => {
      const release = await h.b.ports.lock(name, wait);
      return async () => {
        await release();
        if (name !== key || !armed) return;
        armed = false;
        const siblingRelease = await h.b.ports.lock(key);
        try {
          newer = (await plantRef(h.origin, ref, entries, { gitDir: h.origin, parents: [original], message: "Later returned live observation" })).tip;
          const spec = `+refs/arc/work/*:refs/arc-remotes/${h.remoteName}/work/*`;
          await h.b.git(["fetch", "--refmap=", "--", h.origin, spec]);
          await h.b.git(["update-ref", seen, newer]);
          await h.remote("git", ["update-ref", "-d", ref]);
          await h.b.git(["fetch", "--prune", "--refmap=", "--", h.origin, spec]);
          expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
        } finally { await siblingRelease(); }
      };
    } });
    success(await observer.pull());
    expect(newer).toMatch(/^[0-9a-f]{40}$/u);
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(newer);
    const divergent = await plantRef(h.origin, ref, entries, { gitDir: h.origin, message: "Unrelated returned live history" });
    const notices = success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices);
    expect(notices).toContainEqual(expect.objectContaining({
      kind: "history-diverged", ref, local: newer, remote: divergent.tip,
    }));
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(newer);
    const notice = notices.find(row => row.kind === "history-diverged");
    if (notice?.kind !== "history-diverged") throw new Error("Expected a rewrite repair");
    for (const line of notice.remedy.text.slice(notice.remedy.text.indexOf("Take theirs")).split("\n").slice(1)) {
      if (!line.startsWith("'git'")) break;
      const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
      await h.b.exec("git", argv.slice(1), { cwd: h.b.root });
    }
    expect(success(await h.b.store.pull()).pulls.flatMap(pull => pull.notices).some(row => row.kind === "history-diverged")).toBe(false);
    expect((await h.b.git(["rev-parse", tracking])).stdout.trim()).toBe(divergent.tip);
  });
});
