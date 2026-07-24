import { constants } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  resolveCodeRabbitExecutable,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/executable.js";

describe("CodeRabbit executable resolution", () => {
  it("carries the invocation subprocess policy into version interrogation", async () => {
    const interaction = {
      terminalPrompts: "forbidden" as const,
      presenters: "forbidden" as const,
      ambientStdin: "closed" as const,
    };
    const interrogate = vi.fn(async () => "CodeRabbit CLI version 0.6.5\n");

    await resolveCodeRabbitExecutable("coderabbit", {
      access: async () => undefined,
      realpath: async () => "/trusted/bin/coderabbit",
      readFile: async () => Buffer.from("exact executable bytes"),
      interrogate,
      interaction,
      pathValue: "/trusted/bin",
      platform: "linux",
      pathExtValue: "",
    });

    expect(interrogate).toHaveBeenCalledWith("/trusted/bin/coderabbit", {
      remainingMs: expect.any(Number),
      signal: expect.any(AbortSignal),
      interaction,
    });
  });

  it("binds digest and version to one resolved executable path", async () => {
    const access = vi.fn(async (path: string, mode: number) => {
      if (path !== "/trusted/bin/coderabbit" || mode !== constants.X_OK) throw new Error("not executable");
    });
    const realpath = vi.fn(async () => "/trusted/bin/coderabbit-v0.6.5");
    const readFile = vi.fn(async () => Buffer.from("exact executable bytes"));
    const interrogate = vi.fn(async (path: string) => {
      if (path !== "/trusted/bin/coderabbit-v0.6.5") throw new Error("wrong artifact");
      return "CodeRabbit CLI version 0.6.5\n";
    });

    await expect(resolveCodeRabbitExecutable("coderabbit", {
      access,
      realpath,
      readFile,
      interrogate,
      pathValue: "/untrusted/bin:/trusted/bin",
      platform: "linux",
      pathExtValue: "",
    })).resolves.toEqual({
      path: "/trusted/bin/coderabbit-v0.6.5",
      digest: "sha256:135a9af43260004bfc617b97f806fcc6600e211fe0219d6c4311ef8cc6d59b48",
      qualifiedVersion: "coderabbit/0.6.5",
    });
    expect(access).toHaveBeenCalledWith("/trusted/bin/coderabbit", constants.X_OK, {
      remainingMs: expect.any(Number),
      signal: expect.any(AbortSignal),
    });
    expect(realpath).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledOnce();
    expect(interrogate).toHaveBeenCalledWith("/trusted/bin/coderabbit-v0.6.5", {
      remainingMs: expect.any(Number),
      signal: expect.any(AbortSignal),
    });
  });
});
