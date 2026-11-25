/** A reopened owner's missing history objects keep the live clone's repair route. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("live comparison history loss in %s", layout => {
  it.each(["commit", "tree"] as const)("restores a reopened owner's missing historical %s without requesting an absent retained ref", async type => {
    const f = await createRefFixture({}, layout), record = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const from = await f.settle(), archived = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write({ ...update(f, archived, f.content(record.reference, "valid")), placement: { kind: "active" }, provenance: { ...testProvenance, verb: "reopen" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write(update(f, reopened, f.content(record.reference, "changed"))));
    const middle = success(await f.store.read({ reference: record.reference })), home = expandStoredPath(record.reference);
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...args, "rev-parse", type === "commit" ? home.ref : `${home.ref}^{tree}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", type, oid])).stdout;
    success(await f.store.write(update(f, middle, f.content(record.reference, "changed-again"))));
    const current = (await f.ports.exec("git", [...args, "rev-parse", type === "commit" ? home.ref : `${home.ref}^{tree}`])).stdout.trim();
    expect(current).not.toBe(oid);
    const input = { from, to: await f.settle(), references: [record.reference] }, baseline = success(await f.store.changes(input));
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [],
      remedy: { text: expect.stringMatching(/restore|fetch|pull/iu) },
    } });
    const restored = await f.ports.rawExec([...args, "hash-object", "-t", type, "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    expect(success(await f.store.changes(input))).toEqual(baseline);
  });
});
