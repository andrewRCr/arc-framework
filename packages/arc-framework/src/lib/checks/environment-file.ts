/** Bounded file copying with opened-handle stability checks for frozen check inputs. */
import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Opened input boundary retaining byte and metadata observations on the same handle. */
export interface EnvironmentInputFile {
  stat(): Promise<BigIntStats>;
  read(buffer: Buffer): Promise<number>;
  close(): Promise<void>;
}

/** Owned output boundary completing each chunk before accepting the next. */
export interface EnvironmentInputWriter {
  write(buffer: Buffer): Promise<void>;
  close(): Promise<void>;
}

/** Filesystem operations used by a frozen input scope. */
export interface EnvironmentCaptureIO {
  createDirectory(): Promise<string>;
  openInput(path: string): Promise<EnvironmentInputFile>;
  openOutput(path: string): Promise<EnvironmentInputWriter>;
  removeDirectory(path: string): Promise<void>;
}

/** Native private-file storage; nonblocking opens allow nonregular inputs to refuse without hanging. */
export const nodeEnvironmentCaptureIO: EnvironmentCaptureIO = {
  createDirectory: () => mkdtemp(join(tmpdir(), "arc-check-inputs-")),
  openInput: async path => {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    return { stat: () => file.stat({ bigint: true }),
      read: async buffer => (await file.read(buffer, 0, buffer.length, null)).bytesRead,
      close: () => file.close() };
  },
  openOutput: async path => {
    const file = await open(path, "wx", 0o600);
    return { write: buffer => file.writeFile(buffer), close: () => file.close() };
  },
  removeDirectory: path => rm(path, { recursive: true, force: true }),
};

/** Safe, path-free explanation for an explicit file that cannot be frozen. */
export class EnvironmentFileCaptureError extends Error {}

/** Private temporary storage for a frozen copy could not be created or written. */
export class EnvironmentStorageError extends Error {}

function unchanged(before: BigIntStats, after: BigIntStats, bytes: number): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs && after.size === BigInt(bytes);
}

interface OpenCaptureFiles { input: EnvironmentInputFile; output?: EnvironmentInputWriter }

async function copyOpenedInput(io: EnvironmentCaptureIO, files: OpenCaptureFiles, destination: string): Promise<{
  path: string; bytes: number; digest: `sha256:${string}`;
}> {
  const { input } = files;
  const before = await input.stat();
  if (!before.isFile()) throw new EnvironmentFileCaptureError("input must resolve to a regular file");
  if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new EnvironmentFileCaptureError("input is too large to describe exactly");
  const output = await io.openOutput(destination).catch((cause: unknown) => {
    throw new EnvironmentStorageError("temporary storage could not hold a frozen copy", { cause });
  });
  files.output = output;
  const buffer = Buffer.alloc(64 * 1024);
  const hash = createHash("sha256");
  let bytes = 0;
  for (;;) {
    const count = await input.read(buffer);
    if (count === 0) break;
    bytes += count;
    if (BigInt(bytes) > before.size) throw new EnvironmentFileCaptureError("input changed during capture");
    const chunk = buffer.subarray(0, count);
    await output.write(chunk);
    hash.update(chunk);
  }
  if (!unchanged(before, await input.stat(), bytes)) throw new EnvironmentFileCaptureError("input changed during capture");
  return { path: destination, bytes, digest: `sha256:${hash.digest("hex")}` };
}

/** Copy and hash one regular file, closing both handles without replacing a capture failure with a close failure. */
export async function captureEnvironmentFile(io: EnvironmentCaptureIO, source: string, destination: string): Promise<{
  path: string; bytes: number; digest: `sha256:${string}`;
}> {
  const files: OpenCaptureFiles = { input: await io.openInput(source) };
  const copied = await copyOpenedInput(io, files, destination).then(
    value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  const closed = await Promise.allSettled([files.input, files.output].map(async file => { await file?.close(); }));
  if (!copied.ok) throw copied.error;
  if (closed.some(result => result.status === "rejected")) throw new EnvironmentFileCaptureError("input or copy could not be closed");
  return copied.value;
}
