/** Native operating-system process-inspector contract probes. */

import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPlatformProcessInspector,
  type LinuxProcessFs,
} from "../../src/lib/locus/platform-inspectors.js";
import {
  createProcessExec,
  type ProcessExec,
  type ProcessExecResult,
} from "../../src/lib/locus/process-exec.js";
import { verifyProcessAnchor } from "../../src/lib/locus/process-inspector.js";

const SUPPORTED_PLATFORMS = ["linux", "darwin", "win32"];
const MISSING_PID = 2_147_483_647;

describe("native process execution", () => {
  const exec = createProcessExec();

  it("classifies a genuinely missing executable", async () => {
    const missingExecutable = join(tmpdir(), `arc-missing-executable-${randomUUID()}`);

    await expect(exec(missingExecutable, [])).resolves.toMatchObject({ kind: "missing" });
  });

  it("preserves a genuine nonzero exit", async () => {
    await expect(exec(process.execPath, ["--eval", "process.exit(7)"])).resolves.toEqual({
      kind: "nonzero",
      stdout: "",
      stderr: "",
      exitCode: 7,
    });
  });

  it("classifies native cancellation", async () => {
    const startedMarker = join(tmpdir(), `arc-started-process-${randomUUID()}`);
    const controller = new AbortController();
    const result = exec(
      process.execPath,
      [
        "--eval",
        `require("node:fs").writeFileSync(${JSON.stringify(startedMarker)}, "started"); `
          + "setTimeout(() => process.exit(0), 2_000); setInterval(() => {}, 10_000)",
      ],
      { signal: controller.signal },
    );

    try {
      await waitForPath(startedMarker);
      controller.abort();
      await expect(result).resolves.toMatchObject({ kind: "canceled" });
    } finally {
      controller.abort();
      await result;
      await rm(startedMarker, { force: true });
    }
  });

  it("classifies the native output limit", async () => {
    await expect(exec(
      process.execPath,
      ["--eval", "process.stdout.write(\"x\".repeat(1_024))"],
      { maxOutputBytes: 16 },
    )).resolves.toMatchObject({ kind: "output-limit" });
  });
});

async function waitForPath(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for child-process marker: ${path}`);
}

function nativeFailureInspector(failure: "permission" | "malformed") {
  if (process.platform === "linux") {
    const linuxFs: LinuxProcessFs = failure === "permission"
      ? {
          readFile: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); },
          readlink: async () => "/usr/bin/node",
        }
      : {
          readFile: async () => "malformed",
          readlink: async () => "/usr/bin/node",
        };
    return createPlatformProcessInspector(process.platform, { linuxFs });
  }

  const result: ProcessExecResult = failure === "permission"
    ? { kind: "nonzero", stdout: "", stderr: "permission denied", exitCode: 1 }
    : { kind: "success", stdout: "malformed native output", stderr: "", exitCode: 0 };
  const exec: ProcessExec = async () => result;
  return createPlatformProcessInspector(process.platform, { exec });
}

describe.runIf(SUPPORTED_PLATFORMS.includes(process.platform))(`native process inspector (${process.platform})`, () => {
  it("observes a stable PID generation and verifies only the exact start token as live", async () => {
    const inspector = createPlatformProcessInspector();
    const first = await inspector.inspect(process.pid);
    const second = await inspector.inspect(process.pid);

    if (first.kind !== "present") {
      const detail = first.kind === "unverifiable" ? `: ${first.reason}` : "";
      throw new Error(`Native ${inspector.kind} could not inspect the current process${detail}`);
    }
    expect(first).toMatchObject({ kind: "present", pid: process.pid });
    expect(second).toEqual(first);

    const anchor = {
      kind: "process" as const,
      pid: first.pid,
      startToken: first.startToken,
      inspector: inspector.kind,
      selector: "native-contract",
    };
    await expect(verifyProcessAnchor(anchor, inspector)).resolves.toBe("live");
    await expect(verifyProcessAnchor({ ...anchor, startToken: `${anchor.startToken}-reused` }, inspector))
      .resolves.toBe("dead");
  });

  it("reports a missing native PID as dead", async () => {
    const inspector = createPlatformProcessInspector();
    const anchor = {
      kind: "process" as const,
      pid: MISSING_PID,
      startToken: "missing-generation",
      inspector: inspector.kind,
      selector: "native-contract",
    };

    const missing = await inspector.inspect(MISSING_PID);
    if (missing.kind === "unverifiable") {
      throw new Error(`Native ${inspector.kind} could not distinguish a missing process: ${missing.reason}`);
    }
    expect(missing).toEqual({ kind: "absent" });
    await expect(verifyProcessAnchor(anchor, inspector)).resolves.toBe("dead");
  });

  it.each(["permission", "malformed"] as const)("degrades %s evidence to unknown", async (failure) => {
    const inspector = nativeFailureInspector(failure);
    const anchor = {
      kind: "process" as const,
      pid: process.pid,
      startToken: "fixture-generation",
      inspector: inspector.kind,
      selector: "native-contract",
    };

    await expect(inspector.inspect(process.pid)).resolves.toMatchObject({ kind: "unverifiable" });
    await expect(verifyProcessAnchor(anchor, inspector)).resolves.toBe("unknown");
  });
});
