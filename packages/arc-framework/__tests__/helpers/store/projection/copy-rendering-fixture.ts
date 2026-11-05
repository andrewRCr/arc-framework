/** A genuine swap whose old marker file and new notice file carry different rendering provenance. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMarkerFixture } from "./marker-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { settleAsideCopy } from "../../../../src/lib/store/projection/aside-copies.js";
import type { SwapMoves } from "../../../../src/lib/store/projection/aside-moves.js";

/** Append beyond the old hunk's file edge, so its read-back truthfully renders a notice. */
export async function createCopyRenderingFixture() {
  const source = await createMarkerFixture({ path: ".arc/user/andrew/document.md" });
  await source.edit(source.content + "independent note\n");
  const written = await writeBackFile(source.context, source.index, source.request);
  const entry = written.result.entry;
  const copy = entry.copies[0];
  if (entry.markers !== null || entry.notices.length === 0 || copy === undefined) throw new Error("expected a marker-to-notice swap");
  const text = (content: string) => renderStampedFile({ content, stamp: source.entry.base.blob });
  return { ...source, entry, copy, index: written.index, original: source.entry,
    notice: await source.file(), copyText: (content: string) => writeFile(join(source.checkout, copy.name), text(content)), text,
    copyFile: () => readFile(join(source.checkout, copy.name), "utf8"),
    settle: (moves: SwapMoves = {}) => settleAsideCopy({ ...moves, checkout: source.checkout, path: source.path,
      entry, copy, format: "sha1", takeIn: createWriteBackPort(source.context), writer: source.context.writer }),
  };
}
