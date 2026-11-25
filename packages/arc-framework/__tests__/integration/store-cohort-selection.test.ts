/** One UID-less cohort reference selects one current physical record. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences, StateVersionSchema } from "../../src/lib/store/identity.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each([true, false])("selects one cohort record across repeated archives; planned: %s", async (planned) => {
  const h = await trackedWriteFixture();
  const paths = [".arc/completed/2026-q3/cohort-group.md", ".arc/completed/2026-q4/cohort-group.md"];
  if (planned) paths.unshift(".arc/backlog/planned/group/cohort-group.md");
  for (const [index, path] of paths.entries()) {
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), `# Cohort group\n\ncopy ${index}\n`);
  }
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Save repeated cohort copies"]);
  const asOf = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));
  for (const query of [{}, { asOf }]) {
    const listing = success(await h.store.list({ family: "cohort", kind: "cohort/document", ...query }));
    expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    if (listing.status !== "complete") throw new Error("Expected a complete cohort listing");
    expect(listing.records).toHaveLength(1);
    expect(listing.records[0]).toEqual(success(await h.store.read({ reference, ...query })));
  }
  const before = success(await h.store.read({ reference }));
  const content = "# Cohort group\n\nupdated canonical copy\n";
  success(await h.store.write({ action: "put", reference, expected: before.version, content, provenance: { verb: "test", lifecycleAction: "update" } }));
  expect(await readFile(join(h.root, paths[0]!), "utf8")).toBe(content);
  for (const path of paths.slice(1)) expect(await readFile(join(h.root, path), "utf8")).not.toBe(content);
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Update selected cohort"]);
  const to = StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  expect(success(await h.store.history({ reference })).map((entry) => entry.content)).toEqual([content, before.content]);
  expect(success(await h.store.changes({ from: asOf, to })).filter((entry) => entry.reference.kind === "cohort/document"))
    .toMatchObject([{ reference, content }]);
});
