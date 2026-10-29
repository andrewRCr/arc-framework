/** Named archived reads retain their selection plan while reacquiring native physical evidence. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

it.each(["default", "separate"] as const)("revalidates a named archive selection in two native processes (%s)", async layout => {
  const f = await createRefReadFixture();
  if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "archived" }, kind: "work-item/meta" });
  success(await f.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("archived", { state: "Shipped" }),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const expected = success(await f.store.read({ reference }));
  const trace = join(f.root, "named-read.jsonl");
  vi.stubEnv("GIT_TRACE2_EVENT", trace);
  try {
    expect(success(await f.store.read({ reference }))).toEqual(expected);
    const events = (await readFile(trace, "utf8")).trim().split("\n")
      .map(line => JSON.parse(line) as { event: string; argv?: string[] });
    const commands = events.filter(({ event }) => event === "start");
    expect(commands.filter(({ argv }) => argv?.includes("diff-tree"))).toHaveLength(0);
    expect(commands).toHaveLength(2);
  } finally { vi.unstubAllEnvs(); }
}, 30_000);

it.each(["default", "separate"] as const)("refuses a missing cached sibling directory and continues after repair (%s)", async layout => {
  const f = await createRefReadFixture();
  if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const quarter = ArchiveQuarterSchema.parse("2026-q1");
  const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "target" }, kind: "work-item/meta" });
  let other;
  for (const name of ["target", "other"]) {
    other = success(await f.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name } }),
      expected: null, content: makeMetaFixture(name, { state: "Shipped" }), placement: { kind: "completed", quarter },
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
  }
  if (!other) throw new Error("Missing sibling owner");
  success(await f.store.write({ action: "put", reference: RecordReferenceSchema.parse({ owner: other.reference.owner,
    kind: "work-item/companion", key: "nested/deep/notes.md" }), expected: null, content: "Sibling directory content.\n",
    provenance: { verb: "save", lifecycleAction: "edit" } }));
  const expected = success(await f.store.read({ reference }));
  const gitDir = join(f.root, ".git", ...(layout === "separate" ? ["arc", "store"] : []));
  const scope = layout === "separate" ? [`--git-dir=${gitDir}`] : [];
  const listing = (await f.exec("git", [...scope, "ls-tree", "-r", "-t", `refs/arc/archive/${quarter}`])).stdout;
  const oid = /^040000 tree ([0-9a-f]+)\t[^\n]*\/nested$/mu.exec(listing)?.[1];
  if (!oid) throw new Error("The native sibling subtree was not created");
  const path = join(gitDir, "objects", oid.slice(0, 2), oid.slice(2)), bytes = await readFile(path);
  await rm(path);
  expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
  await writeFile(path, bytes);
  expect(success(await f.store.read({ reference }))).toEqual(expected);
}, 30_000);
