/** Private mode-restricted disk stores for resumable qualification checkpoints and raw non-secret evidence. */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { hashContent } from "../../../lib/manifest/hash.js";
import type { QualificationCellId, QualificationCheckpoint } from "./qualification-contract.js";
import type { QualificationCheckpointStore, QualificationRawStore } from "./qualification-runner.js";

function credentialShaped(value: string): boolean {
  return /gh[opsu]_[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"(?:token|secret|privateKey|authorization)"\s*:/iu
    .test(value);
}

async function privateWrite(path: string, content: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** JSON checkpoint store whose contents are revalidated by the coordinator on every load. */
export class FileQualificationCheckpointStore implements QualificationCheckpointStore {
  constructor(private readonly root: string) {}

  async load(): Promise<QualificationCheckpoint | null> {
    try {
      return JSON.parse(await readFile(join(this.root, "checkpoint.json"), "utf8")) as QualificationCheckpoint;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw new Error("qualification-checkpoint-read-failed", { cause: error });
    }
  }

  async save(checkpoint: QualificationCheckpoint): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await privateWrite(join(this.root, "checkpoint.json"), `${JSON.stringify(checkpoint)}\n`);
  }
}

/** Raw evidence store that rejects credential-shaped content before persisting and returns its content hash. */
export class FileQualificationRawStore implements QualificationRawStore {
  constructor(private readonly root: string) {}

  async write(cellId: QualificationCellId, rawNonSecret: unknown): Promise<string> {
    const serialized = `${JSON.stringify(rawNonSecret)}\n`;
    if (credentialShaped(serialized)) throw new Error("qualification-raw-credential-shaped");
    const directory = join(this.root, "raw");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await privateWrite(join(directory, `${cellId}.json`), serialized);
    return hashContent(serialized);
  }
}
