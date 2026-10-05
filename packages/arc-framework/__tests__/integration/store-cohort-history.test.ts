/** Cohort history follows the selected logical copy at every saved state. */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences, StateVersionSchema } from "../../src/lib/store/identity.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));

it("conserves selected content, versions and provenance across archive turnover and complete removal", async () => {
  const h = await trackedWriteFixture();
  const planned = ".arc/backlog/planned/group/cohort-group.md";
  const archiveA = ".arc/completed/2026-q3/cohort-group.md";
  const archiveB = ".arc/completed/2026-q4/cohort-group.md";
  const contents = ["# Cohort group\n\nplanned\n", "# Cohort group\n\nfirst archive\n", "# Cohort group\n\nlast archive\n"];
  for (const [index, path] of [planned, archiveA, archiveB].entries()) {
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), contents[index]!);
  }
  const save = async (message: string) => {
    await h.exec("git", ["add", "."]);
    await h.exec("git", ["commit", "-m", message]);
    return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  };
  const initial = await save("Save planned and repeated archives");
  const first = success(await h.store.read({ reference, asOf: initial }));
  await unlink(join(h.root, planned));
  const turnover = await save("Select first archive");
  const second = success(await h.store.read({ reference, asOf: turnover }));
  expect(success(await h.store.history({ reference })).map(({ content }) => content)).toEqual([contents[1], contents[0]]);
  const updated = "# Cohort group\n\nupdated first archive\n";
  await writeFile(join(h.root, archiveA), updated);
  const update = await save("Update selected archive");
  const third = success(await h.store.read({ reference, asOf: update }));
  await unlink(join(h.root, archiveA));
  const lastCopy = await save("Select last archive");
  const fourth = success(await h.store.read({ reference, asOf: lastCopy }));
  await unlink(join(h.root, archiveB));
  const removal = await save("Remove all cohort copies");
  const history = success(await h.store.history({ reference }));
  expect(history.map(({ reference: owner }) => owner)).toEqual(Array(5).fill(reference));
  expect(history.map(({ content, version }) => ({ content, version }))).toEqual([
    { content: null, version: null }, ...[fourth, third, second, first].map(({ content, version }) => ({ content, version })),
  ]);
  expect(history.map(({ provenance }) => {
    if (!("message" in provenance)) throw new Error("Expected landed commit provenance");
    return provenance.message.trim();
  })).toEqual([
    "Remove all cohort copies", "Select last archive", "Update selected archive", "Select first archive", "Save planned and repeated archives",
  ]);
  expect(success(await h.store.changes({ from: initial, to: removal, references: [reference] })))
    .toEqual(history.slice(0, -1).reverse());
  // Later removal never changes what the earlier saved states expose.
  for (const [asOf, record] of [[initial, first], [turnover, second], [update, third], [lastCopy, fourth]] as const)
    expect(success(await h.store.read({ reference, asOf }))).toEqual(record);
});

it("never follows an unrelated work-item rename through a matching cohort name", async () => {
  const h = await trackedWriteFixture();
  const content = "# Cohort group\n\noriginal group\n";
  for (const [path, bytes] of [
    [".arc/backlog/planned/group/cohort-group.md", content],
    [".arc/backlog/planned/earlier/cohort-earlier.md", "# Cohort earlier\n\nunrelated cohort\n"],
    [".arc/active/meta-earlier.md", makeMetaFixture("earlier", { branch: "feat/earlier" })],
  ]) {
    await mkdir(dirname(join(h.root, path!)), { recursive: true });
    await writeFile(join(h.root, path!), bytes!);
  }
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Save distinct namespaces"]);
  await h.exec("git", ["mv", ".arc/active/meta-earlier.md", ".arc/active/meta-group.md"]);
  await writeFile(join(h.root, ".arc/active/meta-group.md"), makeMetaFixture("group", { branch: "feat/group" }));
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Rename only the work item"]);
  const history = success(await h.store.history({ reference }));
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ reference, content, provenance: { message: "Save distinct namespaces\n" } });
});
