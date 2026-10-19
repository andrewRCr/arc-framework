/** Real CLI import retires transient refs only after preserving their records. */
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { runArcNoTty } from "./helpers.js";
import { join } from "node:path";

describe.each(["default", "separate"] as const)("CLI Errand import in %s", (layout) => {
  it("re-homes authority, retires the licensed refs, and can run again", async () => {
    const h = await importFixture(layout);
    const record = TransientIdentityRecordSchema.parse({ version: 3, slug: "example", claimId: "1".repeat(32),
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", kind: "errand", purpose: "errand",
      intent: "Preserve this source", branch: "chore/example", origin: "description", originEntry: null,
      state: "open", savedHead: null, changeRequest: null });
    const ref = "refs/arc/user/andrew/errands";
    const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "andrew" };
    const blob = await hashBlob(io.execInput, serializeTransientIdentityRecord(record));
    await writeTreeCommit(io, new Map([[record.slug, blob]]), "Seed transient", [], null);
    await h.git("git", ["push", "origin", `${ref}:${ref}`]);
    const result = await runArcNoTty(["store", "migrate", "--import", "--json"], h.root);
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", ref, "refs/arc/tmp/migrate/import/"])).stdout).toBe("");
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const tips = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.split("\n").filter(Boolean);
    const imported = await Promise.all(tips.map(async (tip) => (await h.git("git", [...scope, "ls-tree", "--name-only", tip])).stdout));
    expect(imported.some((tree) => /^errand-[0-9a-f-]{36}\.json$/mu.test(tree))).toBe(true);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", ref])).stdout).toBe(layout === "default" ? "" : ref);
    const retry = await runArcNoTty(["store", "migrate", "--import", "--json"], h.root);
    expect(retry.exitCode, JSON.stringify(retry)).toBe(0);
    expect((await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.split("\n").filter(Boolean)).toEqual(tips);
  });
});
