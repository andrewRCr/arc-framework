/** Persisted-seed disposition coverage at the recovery handler boundary. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createRecoverStatusProbes: vi.fn(),
    gitConfigGet: vi.fn(),
    readConfiguredIdentity: vi.fn(),
    readFile: vi.fn(),
    resolveUserSurfaceResolver: vi.fn(),
    runRecoverStatus: vi.fn(),
    gitExec: vi.fn(),
    gitExecInput: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
    ...await importOriginal<typeof import("node:fs/promises")>(),
    readFile: mocks.readFile,
}));
vi.mock("../../../src/commands/status.js", () => ({
    runRecoverStatus: mocks.runRecoverStatus,
}));
vi.mock("../../../src/lib/git/index.js", () => ({
    gitConfigGet: mocks.gitConfigGet,
    readConfiguredIdentity: mocks.readConfiguredIdentity,
}));
vi.mock("../../../src/lib/io-context.js", () => ({
    createUserIOContext: () => ({
        exec: mocks.gitExec,
        execInput: mocks.gitExecInput,
        readFile: mocks.readFile,
    }),
}));
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
        Promise.resolve(key === "arc.role" ? "maintainer" : undefined),
    );
    mocks.readConfiguredIdentity.mockResolvedValue("test-user");
    mocks.resolveUserSurfaceResolver.mockResolvedValue({
        identityGlobalRoot: "/repo/.arc/user/test-user",
    });
});

afterEach(() => {
    stdoutSpy.mockRestore();
});

describe("recovery persisted-seed boundary", () => {
    it("preserves configured identity absence and read-failure as identity-missing", async () => {
        for (const outcome of [null, new Error("git unavailable")]) {
            stdout = "";
            if (outcome instanceof Error) mocks.readConfiguredIdentity.mockRejectedValueOnce(outcome);
            else mocks.readConfiguredIdentity.mockResolvedValueOnce(outcome);

            await handleRecoverAudit({ json: true });

            expect(JSON.parse(stdout)).toMatchObject({
                verdict: { stopReasons: [{ kind: "identity-missing" }] },
            });
        }
    });

    it("propagates an invalid configured identity before resolving user paths", async () => {
        const error = Object.assign(new Error("Configured ARC identity is invalid"), {
            code: "identity.invalid",
        });
        mocks.readConfiguredIdentity.mockRejectedValue(error);

        await expect(handleRecoverAudit({ json: true })).rejects.toBe(error);
        expect(mocks.resolveUserSurfaceResolver).not.toHaveBeenCalled();
    });

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
