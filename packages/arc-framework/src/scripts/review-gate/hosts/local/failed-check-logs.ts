/** Private task-local storage for retrieved failed-check logs. */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  FailedCheckLogFile,
  FailedCheckLogStore,
} from "../../failed-check-logs.js";

export interface FailedCheckLogStoreIo {
  temporaryRoot(): string;
  makeTemporaryDirectory(prefix: string): Promise<string>;
  writePrivateFile(path: string, contents: string): Promise<void>;
}

const defaultIo: FailedCheckLogStoreIo = {
  temporaryRoot: () => tmpdir(),
  makeTemporaryDirectory: async (prefix) => mkdtemp(prefix),
  writePrivateFile: async (path, contents) => writeFile(path, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  }),
};

/**
 * Build a private temporary-file store for failed-check logs.
 *
 * @param io - Injectable temporary-directory and file boundary.
 * @returns A store that writes one private file per exact job identity.
 */
export function createLocalFailedCheckLogStore(
  io: FailedCheckLogStoreIo = defaultIo,
): FailedCheckLogStore {
  return {
    materialize: async (entries): Promise<FailedCheckLogFile[]> => {
      const identities = new Set<string>();
      for (const { job } of entries) {
        if (identities.has(job.jobId)) {
          throw new Error(`duplicate failed-check job identity: ${job.jobId}`);
        }
        identities.add(job.jobId);
      }
      const directory = await io.makeTemporaryDirectory(
        join(io.temporaryRoot(), "arc-failed-check-logs-"),
      );
      const logs: FailedCheckLogFile[] = [];
      for (const { job, log } of entries) {
        const path = join(directory, `job-${job.jobId}.log`);
        await io.writePrivateFile(path, log);
        logs.push({ ...job, path });
      }
      return logs;
    },
  };
}
