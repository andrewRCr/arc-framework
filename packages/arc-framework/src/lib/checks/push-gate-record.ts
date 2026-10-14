/** The push gate's refusal of one push, recorded so the command that ran that `git push` can say why. */
import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GitExec } from "../git/exec.js";
import { checkRecordDirectory } from "./record.js";

const PushGateCheckSchema = z.object({
  id: z.string(),
  outcome: z.string(),
  reason: z.string().optional(),
  logPath: z.string().optional(),
  remedy: z.string().optional(),
});

const PushGateRecordSchema = z.object({
  schemaVersion: z.literal(1),
  error: z.string().optional(),
  checks: z.array(PushGateCheckSchema),
});

/** One check that held the push back, with where its output went and how to rerun it. */
export type PushGateCheck = z.infer<typeof PushGateCheckSchema>;

/** Why the gate refused a push: the checks that held it back, or the error that stopped the gate running them. */
export interface PushGateRefusal {
  error?: string;
  checks: PushGateCheck[];
}

const PUSH_GATE_ID = /^[0-9a-f]{32}$/u;

/** Mint the identifier one push hands its push gate, so the gate's record answers for that push alone. */
export function createPushGateId(): string {
  return randomBytes(16).toString("hex");
}

/** Whether a value can name a push gate record; anything else could reach outside the record directory. */
export function isPushGateId(value: string | undefined): value is string {
  return value !== undefined && PUSH_GATE_ID.test(value);
}

function recordPath(directory: string, pushGateId: string): string {
  if (!isPushGateId(pushGateId)) throw new Error(`Invalid push gate identifier ${JSON.stringify(pushGateId)}`);
  return join(directory, `pre-push.${pushGateId}.json`);
}

/**
 * Record why the gate refused the push that handed it this identifier.
 * @param directory - The checkout's check record directory
 * @param pushGateId - The refused push's identifier
 * @param refusal - The checks that held the push back, or the error that stopped the gate
 * @param writeFile - Atomic file writer
 */
export async function writePushGateRefusal(
  directory: string, pushGateId: string, refusal: PushGateRefusal,
  writeFile: (path: string, content: string) => Promise<void>,
): Promise<void> {
  await writeFile(recordPath(directory, pushGateId), `${JSON.stringify({ schemaVersion: 1, ...refusal })}\n`);
}

/**
 * Read, then remove, the refusal the gate recorded for one push.
 * @param input - Record directory, the push's identifier, and file reader and remover
 * @returns The refusal, or null when the gate recorded none for that push or left no readable record
 */
export async function readPushGateRefusal(input: {
  directory: string; pushGateId: string; readFile: (path: string) => Promise<string>;
  removeFile: (path: string) => Promise<void>;
}): Promise<PushGateRefusal | null> {
  const path = recordPath(input.directory, input.pushGateId);
  let content: string;
  try {
    content = await input.readFile(path);
  } catch {
    return null;
  }
  try {
    await input.removeFile(path);
  } catch {
    // A record left behind answers for no other push, so failing to remove it costs only disk space.
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const record = PushGateRecordSchema.safeParse(parsed);
  if (!record.success) return null;
  return record.data.error === undefined ? { checks: record.data.checks }
    : { error: record.data.error, checks: record.data.checks };
}

/**
 * Read, then remove, the refusal recorded in a checkout's check record directory for one push.
 * @param input - Git executor, the checkout that pushed, and the push's identifier
 * @returns The refusal, or null when none was recorded for that push or the record cannot be located
 */
export async function readCheckoutPushGateRefusal(input: {
  git: GitExec; cwd: string; pushGateId: string;
}): Promise<PushGateRefusal | null> {
  let directory: string;
  try {
    directory = await checkRecordDirectory(input.git, input.cwd);
  } catch {
    return null;
  }
  return readPushGateRefusal({ directory, pushGateId: input.pushGateId, readFile: path => readFile(path, "utf8"),
    removeFile: path => rm(path, { force: true }) });
}
