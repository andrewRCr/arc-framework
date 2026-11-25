import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { checkLineageRecord } from "../../src/lib/store/kinds/lineage/check.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import type { Mutation } from "../../src/lib/store/write.js";

const grammar = { shape: "heading" as const, sections: ["Entries"] };
const empty = "# Inbound\n\n## Entries\n";
const held = `${empty}\n### Concern\n\n- _Id:_ \`11111111111111111111111111111111\`\n\nConcern.\n`;

async function setup() {
  const f = await createRefFixture({ "work-item/inbound": { entry: grammar },
    "lineage/transition": { check: (input) => checkLineageRecord(input, grammar) } });
  const primary = await seed(f, f.reference("work-item/meta"));
  const reference = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/inbound" });
  success(await f.store.write({ action: "put", reference, expected: null, content: held, provenance: testProvenance }));
  const inbound = success(await f.store.read({ reference }));
  const lineage = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "lineage/transition" });
  return { f, primary, inbound, lineage };
}

function terminal(primary: StoreRecord, kind: "abandon" | "decompose"): string {
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected minted origin");
  return writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind, incoming: [], retiredBranches: [],
    successors: kind === "abandon" ? [] : [{ name: SlugSchema.parse("successor") }], ...(kind === "decompose" ? { outgoing: [] } : {}) });
}

describe("retirement checks before the automatic sweep", () => {
  it.each(["abandon", "decompose"] as const)("refuses %s with held inbound entries and preserves every ref", async (kind) => {
    const { f, primary, lineage } = await setup(), git = makeGitExec(f.root);
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    expect(await f.store.batch({ writes: [{ action: "remove", reference: primary.reference, expected: primary.version },
      { action: "put", reference: lineage, expected: null, content: terminal(primary, kind) }], provenance: { ...testProvenance, verb: kind } }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "lineage.inbound-held" } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
  });

  it.each([["abandon", "settle"], ["abandon", "remove"], ["decompose", "settle"], ["decompose", "remove"]] as const)("admits %s when its batch applies %s to the held entries", async (kind, cleanup) => {
      const { f, primary, inbound, lineage } = await setup();
      const mutation: Mutation = cleanup === "settle" ? mutationOf(update(f, inbound, empty))
        : { action: "remove", reference: inbound.reference, expected: inbound.version };
      success(await f.store.batch({ writes: [{ action: "remove", reference: primary.reference, expected: primary.version }, mutation,
        { action: "put", reference: lineage, expected: null, content: terminal(primary, kind) }], provenance: { ...testProvenance, verb: kind } }));
      const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined, git = makeGitExec(f.root);
      expect((await git("git", ["ls-tree", "-r", `refs/arc/history/work/${uid}`])).stdout).toBe("");
      expect(await f.store.read({ reference: inbound.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await f.store.history({ reference: inbound.reference }))[0]).toMatchObject({ content: null, version: null });
    });

  it("keeps inbound settlement's exception from admitting another origin put", async () => {
    const { f, primary, inbound, lineage } = await setup();
    const companion = await seed(f, f.reference("work-item/companion"));
    const git = makeGitExec(f.root), before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    expect(await f.store.batch({ writes: [{ action: "remove", reference: primary.reference, expected: primary.version },
      mutationOf(update(f, inbound, empty)), mutationOf(update(f, companion)),
      { action: "put", reference: lineage, expected: null, content: terminal(primary, "abandon") }], provenance: { ...testProvenance, verb: "abandon" } }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference: lineage, rule: "store.terminal-origin-put" } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
  });
});
