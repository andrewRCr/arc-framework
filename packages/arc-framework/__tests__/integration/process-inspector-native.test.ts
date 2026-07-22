/** Native operating-system process-inspector contract probes. */

import { describe, expect, it } from "vitest";

import {
  createPlatformProcessInspector,
  type LinuxProcessFs,
} from "../../src/lib/locus/platform-inspectors.js";
import type { ProcessExec, ProcessExecResult } from "../../src/lib/locus/process-exec.js";
import { verifyProcessAnchor } from "../../src/lib/locus/process-inspector.js";

const SUPPORTED_PLATFORMS = ["linux", "darwin", "win32"];
const MISSING_PID = 2_147_483_647;

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

describe.runIf(SUPPORTED_PLATFORMS.includes(process.platform))("native process inspector", () => {
  it("observes a stable PID generation and verifies only the exact start token as live", async () => {
    const inspector = createPlatformProcessInspector();
    const first = await inspector.inspect(process.pid);
    const second = await inspector.inspect(process.pid);

    expect(first).toMatchObject({ kind: "present", pid: process.pid });
    expect(second).toEqual(first);
    if (first.kind !== "present") throw new Error(`Current process is ${first.kind}`);

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

    await expect(inspector.inspect(MISSING_PID)).resolves.toEqual({ kind: "absent" });
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
