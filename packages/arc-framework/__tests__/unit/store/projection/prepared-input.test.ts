/** Store-dependent preparation reuses captured local input without reopening its checkout. */
import { mkdir, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { captureWriteBackFile, createWriteBackPort, prepareCapturedWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { success } from "../../../helpers/store/suite-tools.js";

it("prepares the captured edit after the local file is no longer readable", async () => {
  const fixture = await createWriteBackFixture();
  try {
    const content = "opening\ncaptured input\nclosing\n";
    await fixture.edit(content);
    const capture = await captureWriteBackFile(fixture.context, fixture.request);
    expect(capture.kind).toBe("read");
    if (capture.kind !== "read") throw new Error("The settled input was not captured");
    await unlink(join(fixture.checkout, fixture.path));
    expect(await prepareCapturedWriteBack(fixture.context, fixture.request, capture)).toMatchObject({ kind: "ready",
      write: { content, expected: fixture.entry.base.version }, takenIn: content,
      selectedBase: { kind: "stored", version: fixture.entry.base.version } });
  } finally { await fixture.dispose(); }
});

it("refuses a linked ancestor without reading its target and captures the repaired file", async () => {
  const fixture = await createWriteBackFixture({ path: ".arc/user/test-user/scratch/note.md" });
  try {
    const folder = dirname(join(fixture.checkout, fixture.path)), backup = join(fixture.checkout, "original-folder");
    const target = join(fixture.checkout, "private-target");
    await mkdir(target);
    const secret = renderStampedFile({ content: "Private target content.\n", stamp: fixture.entry.base.blob });
    await writeFile(join(target, "note.md"), secret);
    await rename(folder, backup);
    await symlink(target, folder, "junction");
    expect(await captureWriteBackFile(fixture.context, fixture.request)).toMatchObject({ kind: "held" });
    expect(await readFile(join(target, "note.md"), "utf8")).toBe(secret);
    await rm(folder);
    await rename(backup, folder);
    const content = "Repaired inside content.\n";
    await fixture.edit(content);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(success(await fixture.store.read({ reference: fixture.entry.reference })).content).toBe(content);
  } finally { await fixture.dispose(); }
});
