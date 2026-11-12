/** Archived point reads preserve requested-record failures and admit their applicable repair. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it.each(["malformed", "future", "unavailable"].flatMap(damage => [
  { damage, saved: false }, { damage, saved: true },
]))("retains $damage archived record diagnostics in saved=$saved reads", async ({ damage, saved }) => {
  const f = await createRefFixture();
  const primary = await seed(f, f.reference("work-item/meta"));
  const target = await seed(f, { ...f.reference("review/evidence", "damaged"), owner: primary.reference.owner });
  const healthy = await seed(f, { ...f.reference("review/evidence", "healthy"), owner: primary.reference.owner });
  const quarter = ArchiveQuarterSchema.parse("2026-q4"), ref = `refs/arc/archive/${quarter}`;
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const entries = await capturedEntries(f, ref), home = expandStoredPath(target.reference);
  const path = entries.find(entry => entry.path.endsWith(home.path))!.path;
  const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const parent = (await f.ports.exec("git", [...scope, "rev-parse", ref])).stdout.trim();
  const unavailableContent = '{"payload":"Retained archived evidence awaiting exact restoration."}';
  const damaged = [];
  for (const entry of entries) {
    if (damage === "future" && entry.path.endsWith(home.metadataPath)) {
      const metadata = JSON.parse((await f.ports.exec("git", [...scope, "show", `${ref}:${entry.path}`])).stdout);
      metadata.formats[canonicalize({ kind: target.reference.kind, key: target.reference.key })] = 2;
      damaged.push({ path: entry.path, content: JSON.stringify(metadata) });
    } else if (entry.path === path && damage !== "future") {
      damaged.push({ path, content: damage === "malformed" ? "Invalid machine JSON" : unavailableContent });
    } else damaged.push(entry);
  }
  const broken = await plantRef(f.root, ref, damaged, { parents: [parent], gitDir: f.gitDir });
  const blob = broken.blobs.get(path);
  if (damage === "unavailable") {
    if (!blob) throw new Error("Missing deliberately planted blob");
    await removeLooseObject(f.root, blob, f.gitDir);
  }
  const asOf = await f.settle();
  const read = () => f.store.read({ reference: target.reference, ...(saved ? { asOf } : {}) });
  const refused = await read();
  expect(refused).toMatchObject({ status: "refused", refusal: { reference: target.reference,
    code: damage === "unavailable" ? "state-unresolvable" : "record-malformed" } });
  expect(success(await f.store.read({ reference: healthy.reference, ...(saved ? { asOf } : {}) })).content).toBe(healthy.content);
  if (damage === "unavailable") {
    expect(refused).toMatchObject({ refusal: { remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
    expect((await f.ports.execInput([...scope, "hash-object", "-w", "--stdin"], unavailableContent)).trim()).toBe(blob);
    expect(success(await read()).content).toBe(unavailableContent);
  } else {
    await plantRef(f.root, ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    if (saved) expect(await read()).toEqual(refused);
    expect(success(await f.store.read({ reference: target.reference, ...(saved ? { asOf: await f.settle() } : {}) })).content).toBe(target.content);
  }
}, 30_000);
