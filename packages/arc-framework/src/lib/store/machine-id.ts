/** Clone-local machine IDs shared by linked worktrees and storage consumers. */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { exclusiveCreateFile } from "../fs.js";

const READBACK_ATTEMPTS = 50;
const READBACK_DELAY_MS = 2;

/** Filesystem read boundary for machine-ID files. */
export interface MachineIdFileAccess { readFile(path: string): Promise<string> }
/** Dependencies and an optional legacy candidate, evaluated only when no shared ID exists. */
export interface MachineIdOptions {
  commonGitDir: string;
  identity: string;
  fs: MachineIdFileAccess;
  candidate?: () => Promise<string | null>;
  exclusiveCreate?: (path: string, content: string) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
}

/** Read or exclusively create the configured identity's clone-local machine ID. */
export async function getOrCreateMachineId(options: MachineIdOptions): Promise<string> {
  const path = join(options.commonGitDir, "arc", "user", options.identity, ".internal", ".machine-id");
  const existing = await readMachineIdFile(options.fs, path);
  if (existing) return existing;
  const candidate = await options.candidate?.() ?? randomUUID();
  try {
    await (options.exclusiveCreate ?? exclusiveCreateFile)(path, candidate);
    return candidate;
  } catch (error) {
    if (!isErrnoCode(error, "EEXIST")) throw error;
    // Exclusive creation can precede the winner's body write; never adopt partial UUID bytes.
    for (let attempt = 0; attempt < READBACK_ATTEMPTS; attempt += 1) {
      const winner = await readMachineIdFile(options.fs, path);
      if (winner) return winner;
      await (options.wait ?? delay)(READBACK_DELAY_MS);
    }
    throw error;
  }
}

/** Read a complete machine ID, treating only absence and incomplete contents as missing. */
export async function readMachineIdFile(fs: MachineIdFileAccess, path: string): Promise<string | null> {
  let raw: string;
  try { raw = await fs.readFile(path); } catch (error) {
    if (isErrnoCode(error, "ENOENT")) return null;
    throw error;
  }
  const id = raw.trim();
  return isMachineId(id) ? id : null;
}

/** Recognize the full UUID shape so a concurrent writer's partial bytes cannot become an identity. */
export function isMachineId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
