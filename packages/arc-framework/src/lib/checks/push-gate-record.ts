/** The push gate's latest verdict, recorded so the command that ran `git push` can say why the gate refused it. */
import { readFile } from "node:fs/promises";
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
  recordedAt: z.number(),
  refs: z.array(z.string()),
  refused: z.boolean(),
  error: z.string().optional(),
  checks: z.array(PushGateCheckSchema),
});

/** One check that held the push back, with where its output went and how to rerun it. */
export type PushGateCheck = z.infer<typeof PushGateCheckSchema>;

/** The gate's verdict over one push event; `checks` lists only those that held the push back. */
export type PushGateVerdict = Omit<z.infer<typeof PushGateRecordSchema>, "schemaVersion">;

/** Why the gate refused a push: the checks that held it back, or the error that stopped the gate running them. */
export interface PushGateRefusal {
  error?: string;
  checks: PushGateCheck[];
}

const RECORD_FILE = "pre-push.latest.json";

/**
 * Record the gate's verdict, replacing the previous one.
 * @param directory - The checkout's check record directory
 * @param verdict - What the gate decided, when, and for which refs
 * @param writeFile - Atomic file writer
 */
export async function writePushGateRecord(
  directory: string, verdict: PushGateVerdict, writeFile: (path: string, content: string) => Promise<void>,
): Promise<void> {
  await writeFile(join(directory, RECORD_FILE), `${JSON.stringify({ schemaVersion: 1, ...verdict })}\n`);
}

/**
 * Read the refusal the gate recorded for one ref since a push started.
 * @param input - Record directory, pushed ref, push start in epoch milliseconds, and file reader
 * @returns The refusal, or null when the gate passed, recorded nothing that recent, never checked the ref, or left no
 *   readable record
 */
export async function readPushGateRefusal(input: {
  directory: string; ref: string; since: number; readFile: (path: string) => Promise<string>;
}): Promise<PushGateRefusal | null> {
  let content: string;
  try {
    content = await input.readFile(join(input.directory, RECORD_FILE));
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const record = PushGateRecordSchema.safeParse(parsed);
  if (!record.success || !record.data.refused || record.data.recordedAt < input.since) return null;
  if (record.data.error !== undefined) return { error: record.data.error, checks: record.data.checks };
  return record.data.refs.includes(input.ref) ? { checks: record.data.checks } : null;
}

/**
 * Read the refusal recorded in a checkout's check record directory for a push of one branch.
 * @param input - Git executor and checkout that pushed, the pushed branch, and when the push started
 * @returns The refusal, or null when none applies or the record cannot be located
 */
export async function readCheckoutPushGateRefusal(input: {
  git: GitExec; cwd: string; branch: string; since: number;
}): Promise<PushGateRefusal | null> {
  let directory: string;
  try {
    directory = await checkRecordDirectory(input.git, input.cwd);
  } catch {
    return null;
  }
  return readPushGateRefusal({ directory, ref: `refs/heads/${input.branch}`, since: input.since,
    readFile: path => readFile(path, "utf8") });
}
