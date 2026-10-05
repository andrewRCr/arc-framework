/** Review records inherit their owner's selected lifecycle placement and listing restrictions. */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, candidateFixture, boundaryFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const locations = ["active","planned","provisional","completed"] as const;
const placements = [
  {location:"active",path:".arc/active/meta-example.md",state:"Active",placement:{kind:"active"}},
  {location:"planned",path:".arc/backlog/planned/example/meta-example.md",state:"Planning",placement:{kind:"backlog",commitment:"planned"}},
  {location:"provisional",path:".arc/backlog/provisional/example/meta-example.md",state:"Planning",placement:{kind:"backlog",commitment:"provisional"}},
  {location:"completed",path:".arc/completed/2026-q4/01_example/meta-example.md",state:"Shipped",placement:{kind:"completed",quarter:"2026-q4",sequence:"01"}},
] as const;

async function put(root:string,path:string,content:string) {
  await mkdir(dirname(join(root,path)),{recursive:true});
  await writeFile(join(root,path),content);
}

describe.each(["review/candidate","review/integration-boundary"] as const)("%s owner listings", (kind) => {
  async function fixture() {
    const h = await trackedWriteFixture();
    await h.exec("git",["commit","--allow-empty","-m","Initialize"]);
    const reference = h.reference(kind);
    const content = JSON.stringify(kind === "review/candidate" ? candidateFixture() : boundaryFixture());
    const plant = ()=>h.store.write({action:"put",reference,expected:null,content,provenance:{verb:"attest",lifecycleAction:"attest"}});
    return {...h,recordReference:reference,plant};
  }

  it.each(placements)("inherits $location placement and filters from its primary", async ({location,path,state,placement}) => {
    const h = await fixture();
    await put(h.root,path,makeMetaFixture("example",{state}));
    success(await h.plant());
    const record = success(await h.store.read({reference:h.recordReference}));
    expect(record.placement).toEqual(placement);
    for (const filter of [undefined,{locations:[location]},{locations:[location],heldHere:true}]) {
      expect(success(await h.store.list({family:"review",kind,owner:h.recordReference.owner,...(filter ? {filter} : {})})))
        .toMatchObject({status:"complete",records:[record],diagnostics:[],missed:false});
    }
    for (const other of locations.filter((value)=>value !== location)) {
      expect(success(await h.store.list({family:"review",kind,filter:{locations:[other]}}))).toMatchObject({status:"absent"});
    }
    expect(success(await h.store.list({family:"review",kind,owner:h.reference(kind,"other").owner}))).toMatchObject({status:"absent"});
  });

  it("uses the requested saved tree for both review bytes and owner placement", async () => {
    const h = await fixture();
    await put(h.root,".arc/active/meta-example.md",makeMetaFixture("example"));
    const landed = success(await h.plant());
    const saved = success(await h.store.read({reference:h.recordReference}));
    await h.exec("git",["add","."]); await h.exec("git",["commit","-m","Save active review"]);
    const asOf = success(await h.store.version());
    await unlink(join(h.root,".arc/active/meta-example.md"));
    await put(h.root,".arc/backlog/planned/example/meta-example.md",makeMetaFixture("example",{state:"Planning"}));
    success(await h.store.write({action:"remove",reference:h.recordReference,expected:landed.version!,provenance:{verb:"remove",lifecycleAction:"remove"}}));
    expect(await h.store.read({reference:h.recordReference})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
    expect(success(await h.store.read({reference:h.recordReference,asOf}))).toEqual(saved);
    expect(success(await h.store.list({family:"review",kind,asOf,filter:{locations:["active"],heldHere:true}})))
      .toMatchObject({status:"complete",records:[saved]});
    expect(success(await h.store.list({family:"review",kind,asOf,filter:{locations:["planned"]}}))).toMatchObject({status:"absent"});
  });

  it("excludes a composed owner held only on another branch when heldHere is requested", async () => {
    const h = await fixture();
    await h.exec("git",["checkout","-b","feat/example"]);
    await put(h.root,".arc/active/meta-example.md",makeMetaFixture("example",{branch:"feat/example"}));
    await h.exec("git",["add","."]); await h.exec("git",["commit","-m","Save branch owner"]);
    await h.exec("git",["checkout","main"]);
    success(await h.plant());
    const read = success(await h.store.read({reference:h.recordReference}));
    expect(success(await h.store.list({family:"review",kind}))).toMatchObject({status:"complete",records:[read]});
    expect(success(await h.store.list({family:"review",kind,filter:{heldHere:true}}))).toMatchObject({status:"absent"});
  });

  it("keeps the legacy active fallback for orphan review records while honoring filters", async () => {
    const h = await fixture();
    success(await h.plant());
    const saved = success(await h.store.read({reference:h.recordReference}));
    expect(saved.placement).toEqual({kind:"active"});
    expect(success(await h.store.list({family:"review",kind,filter:{locations:["active"]}})))
      .toMatchObject({status:"complete",records:[saved]});
    expect(success(await h.store.list({family:"review",kind,filter:{locations:["completed"]}}))).toMatchObject({status:"absent"});
    expect(success(await h.store.list({family:"review",kind,filter:{heldHere:true}}))).toMatchObject({status:"absent"});
  });
});
