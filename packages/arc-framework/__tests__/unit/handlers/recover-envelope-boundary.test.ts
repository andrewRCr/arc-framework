/** Persisted-seed disposition coverage at the recovery handler boundary. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createRecoverStatusProbes: vi.fn(),
    gitConfigGet: vi.fn(),
    readFile: vi.fn(),
    resolveUserSurfaceResolver: vi.fn(),
    runRecoverStatus: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("../../../src/commands/status.js", () => ({
    runRecoverStatus: mocks.runRecoverStatus,
}));
vi.mock("../../../src/lib/git/index.js", () => ({
    gitConfigGet: mocks.gitConfigGet,
}));
vi.mock("../../../src/lib/io-context.js", () => ({ createGitExec: () => vi.fn() }));
vi.mock("../../../src/lib/user-surfaces.js", () => ({
    resolveUserSurfaceResolver: mocks.resolveUserSurfaceResolver,
}));
vi.mock("../../../src/handlers/recover-probes.js", () => ({
    createRecoverStatusProbes: mocks.createRecoverStatusProbes,
}));
vi.mock("../../../src/handlers/shared.js", () => ({
    requireArcProjectRoot: () => "/repo",
}));

import { handleRecoverAudit } from "../../../src/handlers/recover.js";

let stdout = "";
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.resetAllMocks();
    stdout = "";
    stdoutSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk) => {
            stdout += String(chunk);
            return true;
        });
    mocks.gitConfigGet.mockImplementation((_exec: unknown, key: string) =>
        Promise.resolve(key === "arc.identity" ? "test-user" : "maintainer"),
    );
    mocks.resolveUserSurfaceResolver.mockResolvedValue({
        identityGlobalRoot: "/repo/.arc/user/test-user",
    });
});

afterEach(() => {
    stdoutSpy.mockRestore();
});

describe("recovery persisted-seed boundary", () => {
    it.each([
        ["malformed JSON", "{not-json\n"],
        ["an older schema version", JSON.stringify({ schemaVersion: 0 })],
    ])(
        "returns a structured seed-invalid stop for %s without live probes",
        async (_name, content) => {
            mocks.readFile.mockResolvedValue(content);

            await handleRecoverAudit({ json: true });

            expect(JSON.parse(stdout)).toMatchObject({
                mode: "recover-audit",
                recover: null,
                verdict: {
                    status: "stop",
                    ready: false,
                    stopReasons: [{ kind: "seed-invalid" }],
                },
            });
            expect(mocks.createRecoverStatusProbes).not.toHaveBeenCalled();
            expect(mocks.runRecoverStatus).not.toHaveBeenCalled();
        },
    );
});
