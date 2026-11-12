/** Externally supplied retained entries cannot introduce another archive metadata candidate. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const names = ["metadata-00000000-0000-4000-8000-000000000000.json", "metadata-ffffffff-ffff-4fff-bfff-ffffffffffff.json"];

describe.each(["default", "separate"] as const)("retained archive metadata namespace in %s", layout => {
  for (const [order, name] of names.entries()) for (const format of ["text", "metadata", "directory"] as const) {
    it.each(["archive", "completed-refresh"] as const)(`refuses externally planted lexical ${order} ${format} during %s without changing refs and admits a renamed retry`, async phase => {
      const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
      if (phase === "completed-refresh") success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter } }));
      const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
      const source = `refs/arc/${phase === "archive" ? "" : "history/"}work/${uid}`;
      const entries = await capturedEntries(f, source), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
      const parent = (await f.ports.exec("git", [...scope, "rev-parse", source])).stdout.trim();
      const ownMetadata = entries.find(entry => entry.path === `metadata-${uid}.json`);
      if (!ownMetadata) throw new Error("Missing producer's owner metadata");
      const path = format === "directory" ? `${name}/evidence.txt` : name;
      const extra = format === "metadata" ? { ...ownMetadata, path } : { path, content: "external companion text\n" };
      const broken = await plantRef(f.root, source, [...entries, extra], { parents: [parent], gitDir: f.gitDir });
      const current = success(await f.store.read({ reference: primary.reference }));
      const write = () => f.store.write({ ...update(f, current), placement: { kind: "completed" as const, quarter } });
      const before = success(await f.store.version());
      const refs = () => f.ports.exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)",
        "refs/arc/work/", "refs/arc/history/", "refs/arc/archive/"]);
      const beforeRefs = (await refs()).stdout;
      expect(await write()).toMatchObject({ status: "refused", refusal: {
        condition: expect.stringMatching(/reserved.*metadata|metadata.*reserved/iu), remedy: { text: expect.stringMatching(/rename|repair|key/iu) },
      } });
      expect(success(await f.store.version())).toBe(before);
      expect((await refs()).stdout).toBe(beforeRefs);
      const repairedKey = `evidence/${path}`;
      await plantRef(f.root, source, [...entries, { ...extra, path: repairedKey }], { parents: [broken.tip], gitDir: f.gitDir });
      success(await write());
      const companion = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key: repairedKey });
      expect(await f.store.read({ reference: companion })).toMatchObject({ status: "ok" });
      expect(success(await f.store.read({ reference: primary.reference })).placement?.kind).toBe("completed");
    }, 60_000);
  }
});
