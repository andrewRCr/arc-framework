/** An identity write preserves every blob outside its explicit mutation keys. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { hashBlob } from "../../src/lib/errand/ref-tree.js";
import { syncFixture, syncErrandRef, syncErrand, syncPut, syncRecord } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

function namedPut(name: string) {
  const slug = SlugSchema.parse(name);
  return { ...syncPut(), reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
    content: serializeTransientIdentityRecord({ ...syncRecord(slug), slug, branch: `chore/${slug}` }) };
}

for (const canonical of [false, true]) for (const remoteRace of [false, true]) {
  it(`retains untouched bytes, version and history; canonical: ${canonical}, remote race: ${remoteRace}`, async () => {
    const h = await syncFixture();
    const content = canonical ? serializeTransientIdentityRecord(syncRecord()) : JSON.stringify(syncRecord());
    const version = await hashBlob(h.a.execInput, content);
    const tree = (await h.a.execInput(["mktree"], `100644 blob ${version}\talpha\n`)).trim();
    const tip = (await h.a.execInput(["commit-tree", tree], "Seed exact identity bytes\n")).trim();
    await h.a.exec("git", ["update-ref", syncErrandRef, tip]);
    await h.a.exec("git", ["push", "origin", `${syncErrandRef}:${syncErrandRef}`]);
    const before = success(await h.a.store.read({ reference: syncErrand }));
    const history = success(await h.a.store.history({ reference: syncErrand }));
    const actual = h.a.ports.exec;
    let raced = false;
    if (remoteRace) h.a.ports.exec = async (command, args, options) => {
      if (!raced && args[0] === "push") { raced = true; success(await h.b.store.write(namedPut("gamma"))); }
      return actual(command, args, options);
    };
    const beta = success(await h.a.store.write(namedPut("beta")));
    h.a.ports.exec = actual;
    expect(raced).toBe(remoteRace);
    expect(success(await h.a.store.read({ reference: syncErrand }))).toEqual(before);
    expect(success(await h.a.store.history({ reference: syncErrand }))).toEqual(history);
    expect((await h.remote("git", ["rev-parse", `${syncErrandRef}:alpha`])).stdout).toBe(version);
    const settled = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
    expect(await h.a.store.write(namedPut("beta"))).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(settled);
    expect(success(await h.a.store.read({ reference: syncErrand }))).toEqual(before);
    success(await h.a.store.write({ action: "remove", reference: namedPut("beta").reference, expected: beta.version!, provenance: syncPut().provenance }));
    expect(success(await h.a.store.read({ reference: syncErrand }))).toEqual(before);
    // An intentional same-content put may canonicalize its own bytes; its reported version must match persistence.
    const put = success(await h.a.store.write(syncPut("original", before.version)));
    expect(success(await h.a.store.read({ reference: syncErrand })).version).toBe(put.version);
    expect((await h.remote("git", ["rev-parse", `${syncErrandRef}:alpha`])).stdout).toBe(put.version);
    expect(put.version === before.version).toBe(canonical);
  });
}
