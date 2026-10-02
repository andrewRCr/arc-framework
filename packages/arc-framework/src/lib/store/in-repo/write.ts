/** Digest-bound tracked writes and all-or-nothing batches under one checkout lock. */
import { randomUUID } from "node:crypto";
import type { BatchInput, BatchResult, WriteInput, WriteResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import { admitTrackedRole } from "./write-admission.js";
import { writeContent, type WriteContent } from "./write-codec.js";
import { withTrackedRefusal } from "./write-conflicts.js";
import { captureTrackedWrites, applyTrackedWrites } from "./write-transaction.js";

async function writeAll(context: InRepoContext, writes: WriteInput[]): Promise<WriteResult[]> {
  const inputs: { input: WriteInput; content?: WriteContent }[] = [];
  for (const input of writes) { admitTrackedRole(context, input); inputs.push({ input, content: await writeContent(input) }); }
  return withTrackedRefusal(() => context.ports.locks.tracked(async () => applyTrackedWrites(context, await captureTrackedWrites(context, inputs))));
}
/** Write one tracked record without staging its bytes.
 * @param context - Explicit checkout I/O and locks.
 * @param input - Version-bound mutation and caller provenance.
 * @returns The canonical written version, or no version on removal.
 */
export async function writeTracked(context: InRepoContext, input: WriteInput): Promise<WriteResult> {
  const result = (await writeAll(context, [input]))[0];
  if (result === undefined) throw new Error("A successful write has no result");
  return result;
}
/** Apply a complete tracked batch or restore every attempted file.
 * @param context - Explicit checkout I/O and locks.
 * @param input - Mutations sharing one provenance.
 * @returns Every mutation result with one batch identifier.
 */
export async function batchTracked(context: InRepoContext, input: BatchInput): Promise<BatchResult> {
  const writes = input.writes.map((write) => ({ ...write, provenance: input.provenance }));
  return { batchId: randomUUID(), writes: await writeAll(context, writes) };
}
