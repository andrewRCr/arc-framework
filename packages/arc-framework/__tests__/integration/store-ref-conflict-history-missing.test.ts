import { expect, it } from "vitest";

import { RecordReferenceSchema, runStoreConflict } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("returns a live conflict's Missing history unchanged without pulling in %s", async layout => {
  const f = await createRefFixture({}, layout);
  if (f.gitDir) await f.ports.exec("git", [`--git-dir=${f.gitDir}`, "config", "remote.backing.arc-state", "push"]);
  const base = await seed(f, f.reference("work-item/companion"), "base\n");
  success(await f.store.write(update(f, base, "current\n")));
  const changed = success(await f.store.write(update(f, base, "incoming\n")));
  expect(changed.conflicts).toHaveLength(1);
  const conflict = changed.conflicts[0];
  if (conflict?.kind !== "work-item/conflict-record" || conflict.owner.type !== "work-item" || !conflict.owner.uid) {
    throw new Error("Expected a genuine work-item conflict");
  }
  const input = { uid: conflict.owner.uid, kind: conflict.kind, id: String(conflict.key) };
  const home = expandStoredPath(conflict), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
  await removeLooseObject(f.root, oid, f.gitDir);
  const operand = RecordReferenceSchema.parse({ ...conflict, owner: { ...conflict.owner, name: input.uid } });
  const original = await f.store.history({ reference: operand });
  expect(original).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  const ports = { ...f.ports, exec: async (...args: Parameters<typeof f.ports.exec>) => {
    if (args[1].includes("fetch")) throw new Error("An empty history route must not fetch");
    return f.ports.exec(...args);
  } };
  expect(await runStoreConflict(ports, input)).toEqual(original);
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", "blob", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await runStoreConflict(ports, input))).toMatchObject({ status: "present", reference: conflict });
}, 60_000);
