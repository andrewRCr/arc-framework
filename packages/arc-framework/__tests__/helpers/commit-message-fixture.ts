/** Runtime adapters for the shared commit-message fixture corpus. */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  createCommitCheckContext,
  createFilesystemArtifactResolver,
  readCommitCheckConfiguration,
  validateCommitMessage,
} from "../../src/lib/commit-check/index.js";
import { parseArcConfig } from "../../src/lib/config/index.js";
import type { CommitCheckOutcome } from "../../src/lib/commit-check/index.js";
import type { CommitMessageFixture } from "../fixtures/commit-msg/cases.js";

const execFileAsync = promisify(execFile);

interface MaterializedFixture {
  root: string;
  arcRoot: string;
}

async function materializeFixture(fixture: CommitMessageFixture): Promise<MaterializedFixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-commit-corpus-"));
  const arcRoot = join(root, ".arc");
  const configPath = join(arcRoot, "system", "arc-config.yml");
  const messagePath = join(root, "COMMIT_EDITMSG");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, fixture.config);
  await writeFile(messagePath, fixture.messageBytes);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  if (fixture.repository.role) {
    await execFileAsync("git", ["config", "arc.role", fixture.repository.role], { cwd: root });
  }
  for (const artifact of fixture.repository.artifacts ?? []) {
    const target = join(arcRoot, artifact);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "fixture");
  }
  for (const unavailableRoot of fixture.repository.unavailableRoots ?? []) {
    const target = join(arcRoot, unavailableRoot);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "not a directory");
  }
  return { root, arcRoot };
}

async function withFixture<T>(
  fixture: CommitMessageFixture,
  run: (materialized: MaterializedFixture) => Promise<T>,
): Promise<T> {
  const materialized = await materializeFixture(fixture);
  try {
    return await run(materialized);
  } finally {
    await rm(materialized.root, { recursive: true, force: true });
  }
}

/** Run one corpus case through the canonical TypeScript validator. */
export async function runTypeScriptFixture(fixture: CommitMessageFixture): Promise<CommitCheckOutcome> {
  return withFixture(fixture, async ({ arcRoot }) => {
    const configuration = readCommitCheckConfiguration(parseArcConfig(fixture.config));
    const context = createCommitCheckContext({
      configuration,
      mergeInProgress: false,
      role: fixture.repository.role,
      resolveArtifact: createFilesystemArtifactResolver(arcRoot),
    });
    return validateCommitMessage(new TextDecoder().decode(fixture.messageBytes), context);
  });
}
