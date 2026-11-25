/** Ended owners route lost historical objects to their retained ref and resume after exact restoration. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("ended history object routes in %s", layout => {
  it.each(["record-blob", "nested-tree"] as const)("restores a lost historical %s through retained history", async damage => {
    const f = await createRefFixture({}, layout), git = fixtureGit(f);
    const primary = await seed(f, f.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "nested/retained.md" });
    const original = await seed(f, reference, "Original companion.\n");
    success(await f.store.write(update(f, original, "Historical-only companion.\n")));
    const historical = success(await f.store.read({ reference })), live = expandStoredPath(reference);
    const revision = (await git("git", ["rev-parse", live.ref])).stdout.trim();
    const type = damage === "record-blob" ? "blob" : "tree";
    const oid = (await git("git", ["rev-parse", `${revision}:${damage === "record-blob" ? live.path : "nested"}`])).stdout.trim();
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const bytes = (await f.ports.rawExec([...args, "cat-file", type, oid])).stdout;
    success(await f.store.write(update(f, historical, "Current companion.\n")));
    const current = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...update(f, current, current.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const home = expandStoredPath(reference, { history: true });
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.history({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [home.ref],
      remedy: { text: expect.stringMatching(/restore|fetch|pull/iu) },
    } });
    const restored = await f.ports.rawExec([...args, "hash-object", "-t", type, "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    expect(success(await f.store.history({ reference })).map(({ content }) => content)).toContain("Historical-only companion.\n");
    expect(success(await f.store.read({ reference })).content).toBe("Current companion.\n");
  });
});
