/** Plain save finishes accepted explicit resolution without reopening archive edit admission. */
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";

it.each(["current", "predecessor"] as const)("installs a %s unopened resolution once and requires an opening for a later edit", async receipt => {
  const h = await archiveRetirementFixture(), name = "conflicted.md", path = `${h.folder}/${name}`;
  const base = await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, name), "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) {
    success(await h.store.write(update(h.f, base, content)));
  }
  const current = success(await h.store.read({ reference: base.reference }));
  expect(current.conflicts).toHaveLength(1);
  const [conflict] = current.conflicts;
  if (conflict === undefined) throw new Error("The fixture did not create a conflict");
  await projectionCommand(h.input, ["status"]);
  await h.write(path, current.content);

  let submissions = 0, deny = false, refused = false;
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      const isResolution = input.projectionAdmission?.local.path === path;
      if (isResolution) submissions++;
      const sent = await h.store.batch(input);
      if (isResolution && submissions === 1 && sent.status === "ok") deny = true;
      return sent;
    },
    read: async input => {
      if (!deny || !sameReference(input.reference, base.reference)) return h.store.read(input);
      deny = false;
      refused = true;
      return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "archive",
        condition: "Read unavailable.", remedy: { text: "Retry the read." } } };
    },
  });
  const command = { ...h.input, store };
  await projectionCommand(command, ["save", "--resolve", formatConflictToken(conflict)]);
  expect(refused).toBe(true);
  const accepted = success(await h.store.read({ reference: base.reference }));
  expect(accepted.conflicts).toHaveLength(0);
  expect(submissions).toBe(1);
  const { index, location } = await h.disk();
  const entry = index.entries[path];
  expect(entry).toMatchObject({ pending: true, persisted: { recording: true } });
  if (receipt === "predecessor") {
    if (entry?.kind !== "record" || !entry.persisted?.recording) throw new Error("Expected an accepted recording");
    const persisted = { ...entry.persisted };
    delete persisted.inputBlob;
    await writeProjectionIndex(location, withProjectionEntry(index, path, { ...entry, acceptedInputStat: undefined, persisted }));
  }
  expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({ kind: "passes" });

  await projectionCommand(command, ["save"]);
  expect(submissions).toBe(1);
  expect((await h.disk()).index.entries[path]).toMatchObject({ kind: "record", pending: false });
  if (process.platform !== "win32") expect((await lstat(join(h.checkout, path))).mode & 0o200).toBe(0);

  const changed = "An independent correction after the resolution.\n";
  await h.write(path, changed);
  await projectionCommand(command, ["save"]);
  expect(submissions).toBe(1);
  expect(success(await store.read({ reference: base.reference })).version).toBe(accepted.version);
  expect((await projectionCommand(command, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  await projectionCommand(command, ["save"]);
  expect(submissions).toBe(2);
  expect(success(await store.read({ reference: base.reference })).content).toContain(changed.trim());
});
