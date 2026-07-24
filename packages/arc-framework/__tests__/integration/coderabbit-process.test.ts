import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  runCodeRabbitProcess,
} from "../../src/scripts/review-gate/providers/coderabbit/process.js";
import {
  executeBoundedFrontlineCarrier,
} from "../../src/scripts/review-gate/runtime/frontline-execution-boundary.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("CodeRabbit process boundary", () => {
  it("terminates a hung child when the frontline execution deadline expires", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-coderabbit-process-"));
    roots.push(root);

    const result = await executeBoundedFrontlineCarrier({
      timeoutMs: 25,
      execute: ({ remainingMs, signal }) => runCodeRabbitProcess(
        process.execPath,
        ["-e", "setInterval(() => undefined, 60_000)"],
        { cwd: root, remainingMs, signal },
      ),
    });

    expect(result.canceled).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
