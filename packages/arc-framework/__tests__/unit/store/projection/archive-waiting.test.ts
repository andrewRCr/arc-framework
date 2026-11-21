/** A waiting archived edit is held with a reported refusal, even where the file's folder refuses its read. */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { holdWaitingArchiveEdit } from "../../../../src/lib/store/projection/archive-waiting.js";
import type { RecordEntry, RefusedMark } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionRootState } from "../../../../src/lib/store/projection/process-state.js";

const folder = ".arc/completed/2026-q4/01_alpha";
const path = `${folder}/notes.txt`;
let checkout: string;

beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-archive-waiting-"));
  await mkdir(join(checkout, folder), { recursive: true });
  await writeFile(join(checkout, path), "An edit made without opening the file.\n");
});

afterEach(async () => {
  await chmod(join(checkout, folder), 0o755);
  await rm(checkout, { recursive: true, force: true });
});

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "holds a waiting edit with the access refusal when the file's folder refuses the read", async () => {
  const reported: RefusedMark[] = [];
  const root = { checkout, unsent: new Set<string>(), rights: undefined,
    context: { format: "sha1", report: ({ mark }: { mark: RefusedMark }) => { reported.push(mark); } } } as unknown as ProjectionRootState;
  const entry = { kind: "record", pending: false, refused: null, copies: [], persisted: null } as unknown as RecordEntry;
  await chmod(join(checkout, folder), 0o600);

  const held = await holdWaitingArchiveEdit(root, { checkout, path, copy: null, entry, base: { kind: "absent" } as never, observedEdit: true });

  const access = { reason: `Cannot validate ${path}: EACCES.`, remedy: { text: "Repair access to the file, then retry the command." } };
  expect(held).toMatchObject({ answer: "refused", mark: access, entry: { pending: true, refused: access } });
  expect(reported).toEqual([access]);
  expect(root.unsent.has(path)).toBe(true);
});
