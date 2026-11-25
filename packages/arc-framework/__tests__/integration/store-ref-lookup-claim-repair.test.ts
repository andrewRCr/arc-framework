import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

describe.each(["default", "separate"] as const)("claim payload restoration in %s", layout => {
  it.each(["errand", "groom", "housekeep"] as const)("recovers an unavailable %s payload at unchanged tips and keeps unrelated lookup usable", async kind => {
    const f = await createRefFixture({}, layout);
    const record = await seed(f, f.reference(kind === "errand" ? "work-item/record" : `claims/${kind}`));
    const unrelated = await seed(f, f.reference("work-item/meta", "unrelated"));
    const home = expandStoredPath(record.reference), gitDir = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tip = (await f.ports.exec("git", [...gitDir, "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
    const oid = (await f.ports.exec("git", [...gitDir, "rev-parse", `${home.ref}:${home.path}`], { cwd: f.root })).stdout.trim();
    await removeLooseObject(f.root, oid, f.gitDir);
    const claim = { kind, slug: SlugSchema.parse(kind === "errand" ? record.reference.owner.name : String(record.reference.key)), claimId: "1".repeat(32) };
    expect.soft(await f.store.lookup({ kind: "claim", claim })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
    expect(success(await f.store.lookup({ kind: "slug", slug: unrelated.reference.owner.name })).reference).toEqual(unrelated.reference);
    expect((await f.ports.execInput([...gitDir, "hash-object", "-w", "--stdin"], record.content, { cwd: f.root })).trim()).toBe(oid);
    expect((await f.ports.exec("git", [...gitDir, "rev-parse", home.ref], { cwd: f.root })).stdout.trim()).toBe(tip);
    expect(await f.store.lookup({ kind: "claim", claim })).toMatchObject({ status: "ok", result: { reference: record.reference } });
  });
});
