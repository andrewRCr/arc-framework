/** Missing interior commits return recoverable historical refusals and resume after exact object restoration. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["history", "changes", "completed-write", "retired-history"] as const)("recovers %s after a retained tip loses an ancestor commit", async operation => {
  const f = await createRefFixture();
  const record = await seed(f, f.reference(operation === "history" || operation === "changes" ? "personal/document" : "work-item/meta"));
  const home = expandStoredPath(record.reference, { registry: f.ports.registry });
  const from = await f.settle();
  success(await f.store.write(update(f, record)));
  const middle = success(await f.store.read({ reference: record.reference }));
  const missing = (await f.ports.exec("git", ["rev-parse", home.ref])).stdout.trim();
  let query: () => ReturnType<typeof f.store.history> | ReturnType<typeof f.store.changes> | ReturnType<typeof f.store.write>;
  if (operation === "history" || operation === "changes") {
    success(await f.store.write(update(f, middle, record.content)));
    const to = await f.settle();
    query = operation === "history" ? () => f.store.history({ reference: record.reference }) : () => f.store.changes({ from, to });
  } else if (operation === "completed-write") {
    success(await f.store.write({ ...update(f, middle, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const archived = success(await f.store.read({ reference: record.reference }));
    query = () => f.store.write(update(f, archived));
  } else {
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: record.reference.owner });
    success(await f.store.batch({ writes: [
      { action: "put", reference: lineage, expected: null, content: f.content(lineage) },
      { action: "remove", reference: record.reference, expected: middle.version },
    ], provenance: testProvenance }));
    query = () => f.store.history({ reference: record.reference });
  }
  const bytes = (await f.ports.rawExec(["cat-file", "commit", missing], { cwd: f.root, objectAccess: "local-only" })).stdout;
  await removeLooseObject(f.root, missing);
  expect(await query()).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
    remedy: { text: expect.stringMatching(/restore|fetch|pull/iu) } } });
  const restored = await f.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: f.root, input: bytes, objectAccess: "local-only" });
  expect(Buffer.from(restored.stdout).toString("utf8").trim()).toBe(missing);
  expect((await query()).status).toBe("ok");
});

it.each(["canceled", "unrelated", "present-object"] as const)("preserves %s traversal failures instead of claiming unavailable ancestry", async kind => {
  const f = await createRefFixture(), record = await seed(f, f.reference("personal/document"), "Present history.\n");
  const home = expandStoredPath(record.reference, { registry: f.ports.registry });
  const oid = (await f.ports.exec("git", ["rev-parse", home.ref])).stdout.trim();
  const error = makeGitProcessError({ command: "git", args: ["rev-list", oid],
    ...(kind === "canceled" ? { isCanceled: true as const } : { exitCode: 128 }),
    stderr: kind === "unrelated" ? "fatal: invalid revision options\n" : `error: Could not read ${oid}\n` });
  const store = createRefStore({ ...f.ports, exec: async (command, args, options) => {
    if (args.includes("rev-list")) throw error;
    return f.ports.exec(command, args, options);
  } });
  await expect(store.history({ reference: record.reference })).rejects.toBe(error);
});
