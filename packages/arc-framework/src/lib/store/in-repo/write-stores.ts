/** Existing canonical record writers adapted only through the explicit filesystem ports. */
import { dirname, join } from "node:path";
import { withAdvisoryLock } from "../../advisory-lock.js";
import type { WriteInput } from "../write.js";
import type { InRepoContext } from "./context.js";
import type { WriteContent } from "./write-codec.js";

/** Apply one already-admitted mutation through its canonical writer or exact-byte filesystem port.
 * @param context - Checkout I/O and clock.
 * @param path - Admitted repository-relative destination.
 * @param input - Caller mutation carrying its expected digest.
 * @param content - Validated serializer input, absent for removal.
 * @param heldLocks - Actual canonical locks held by the surrounding transaction.
 * @returns Nothing once the mutation has landed.
 */
export async function landTracked(context: InRepoContext, path: string, input: WriteInput, content: WriteContent | undefined, heldLocks: ReadonlySet<string>): Promise<void> {
  const { ports } = context;
  const absolute = join(ports.checkoutRoot, path);
  if (input.action === "remove") { await ports.fs.unlink(absolute); return; }
  if (content === undefined) throw new Error("A put requires prepared content");
  const fs = { readFile: (target: string) => ports.fs.readFile(target), writeFile: (target: string, bytes: string) => ports.fs.writeFile(target, bytes),
    withLock: <T>(lockPath: string, operation: () => Promise<T>) => heldLocks.has(lockPath) ? operation() : withCanonicalRecordLock(context, lockPath, operation) };
  if (content.kind === "candidate") { const { writeCandidateRecord } = await import("../../work-unit/candidate-record-store.js"); await writeCandidateRecord(ports.checkoutRoot, input.reference.owner.name, content.value, input.expected, fs); return; }
  if (content.kind === "boundary") { const { writeSubmissionBoundary } = await import("../../work-unit/submission-boundary-store.js"); await writeSubmissionBoundary(ports.checkoutRoot, content.value, input.expected, fs); return; }
  if (content.kind === "transition") {
    const { writeTransitionRecord } = await import("../../work-unit/transition-record-store.js");
    await writeTransitionRecord(ports.checkoutRoot, content.value, { lstat: (target) => ports.fs.lstat(target), mkdir: (target, options) => ports.fs.mkdir(target, options),
      writeFile: (target, bytes) => ports.fs.exclusiveCreate(target, bytes) });
    return;
  }
  await ports.fs.mkdir(dirname(absolute), { recursive: true });
  await ports.fs.writeFile(absolute, content.bytes);
}

/** Hold a canonical store's own file lock inside the outer tracked-write scope.
 * @param context - Explicit filesystem and clock dependencies.
 * @param lockPath - Absolute per-file lock path used by the existing store.
 * @param operation - Store write or exact-byte restoration.
 * @returns The operation result after its file lock releases.
 */
export async function withCanonicalRecordLock<T>(context: InRepoContext, lockPath: string, operation: () => Promise<T>): Promise<T> {
  const { ports } = context;
  await ports.fs.mkdir(dirname(lockPath), { recursive: true });
  return withAdvisoryLock(lockPath, operation, { exclusiveCreate: (path, bytes) => ports.fs.exclusiveCreate(path, bytes),
    readFile: (path) => ports.fs.readFile(path), removeFile: (path) => ports.fs.unlink(path), now: () => ports.clock().getTime() });
}

/** Hold unique canonical target locks in deterministic order across the complete transaction.
 * @param context - Filesystem and clock dependencies.
 * @param targets - Resolved put and removal targets.
 * @param operation - Digest preflight, mutation and rollback using the actual held locks.
 * @returns The operation result after every canonical lock releases.
 */
export async function withCanonicalRecordLocks<T>(context: InRepoContext, targets: { path: string; input: WriteInput }[],
  operation: (heldLocks: ReadonlySet<string>) => Promise<T>): Promise<T> {
  const paths = [...new Set(targets.filter(({ input }) => ["review/candidate", "review/integration-boundary"].includes(input.reference.kind))
    .map(({ path }) => `${join(context.ports.checkoutRoot, path)}.lock`))].sort();
  const held = new Set<string>();
  const enter = async (index: number): Promise<T> => {
    const path = paths[index];
    if (path === undefined) return operation(held);
    return withCanonicalRecordLock(context, path, async () => {
      held.add(path);
      try { return await enter(index + 1); }
      finally { held.delete(path); }
    });
  };
  return enter(0);
}
