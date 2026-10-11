/** Disposable checkout-local records of successful check executions. */
import { join } from "node:path";
import type { GitExec } from "../git/exec.js";
import { resolveCheckoutGitDir } from "../git/exec.js";
import { z } from "zod";

const CheckPassKeySchema = z.string().regex(/^[0-9a-f]{64}$/u);
const CheckPassRecordSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string(), key: CheckPassKeySchema, outcome: z.literal("passed"), output: z.string(),
});

/** Complete successful execution payload stored under its content key. */
export interface CheckPassRecord {
  schemaVersion: 1;
  id: string;
  key: string;
  outcome: "passed";
  output: string;
}

/** Directory and filesystem boundaries for disposable pass storage. */
export interface CheckPassStoreIO {
  directory(): Promise<string>;
  readFile(path: string): Promise<string>;
  createFile(path: string, content: string): Promise<void>;
}

/** Best-effort pass lookup and create-only publication. */
export interface CheckPassStore {
  get(key: string, id: string): Promise<CheckPassRecord | null>;
  put(record: CheckPassRecord): Promise<void>;
}

/**
 * Bind disposable pass storage to one checkout.
 * @param io - Injectable directory and complete-file boundaries
 * @returns A pass store whose faults never authorize a hit or refuse execution
 */
export function createCheckPassStore(io: CheckPassStoreIO): CheckPassStore {
  return {
    get: async (key, id) => {
      if (!CheckPassKeySchema.safeParse(key).success) return null;
      try {
        const directory = await io.directory();
        const parsed = CheckPassRecordSchema.safeParse(JSON.parse(await io.readFile(join(directory, `${key}.json`))));
        return parsed.success && parsed.data.key === key && parsed.data.id === id ? parsed.data : null;
      } catch {
        return null;
      }
    },
    put: async (record) => {
      const parsed = CheckPassRecordSchema.safeParse(record);
      if (!parsed.success) return;
      try {
        const directory = await io.directory();
        await io.createFile(join(directory, `${parsed.data.key}.json`), `${JSON.stringify(parsed.data)}\n`);
      } catch {
        // A disposable execution shortcut never refuses the caller's run.
      }
    },
  };
}

/**
 * Resolve the private execution-record directory for one checkout.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @returns The worktree's own check-record directory
 */
export async function checkRecordDirectory(git: GitExec, cwd: string): Promise<string> {
  return join(await resolveCheckoutGitDir(git, cwd), "arc-checks");
}
