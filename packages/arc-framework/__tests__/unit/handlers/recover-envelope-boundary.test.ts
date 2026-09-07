/** Persisted-seed disposition coverage at the recovery handler boundary. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createRecoverStatusProbes: vi.fn(),
    auditRecoveryState: vi.fn(),
    gitConfigGet: vi.fn(),
    readConfiguredIdentity: vi.fn(),
    readFile: vi.fn(),
    resolveUserSurfaceResolver: vi.fn(),
    resolveRecoverySeedCheckout: vi.fn(),
    resolveRecoverySeedPath: vi.fn(),
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
vi.mock("../../../src/lib/compaction-seed/recovery-path.js", () => ({
    resolveRecoverySeedCheckout: mocks.resolveRecoverySeedCheckout,
    resolveRecoverySeedPath: mocks.resolveRecoverySeedPath,
}));
vi.mock("../../../src/lib/recover/audit.js", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../src/lib/recover/audit.js")>(),
    auditRecoveryState: mocks.auditRecoveryState,
}));
vi.mock("../../../src/lib/recover/report.js", () => ({
    assertRecoverAuditReport: vi.fn(),
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
    mocks.resolveRecoverySeedPath.mockResolvedValue({
        ok: true,
        path: "/selected/.arc/user/test-user/.internal/compaction-seed.json",
        source: "explicit",
    });
    mocks.resolveRecoverySeedCheckout.mockResolvedValue({ ok: true, checkoutPath: "/selected" });
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

    it("binds committed and task-list progression evidence to the recovered checkout", async () => {
        const seedHead = "a".repeat(40);
        const freshHead = "b".repeat(40);
        const seed = {
            schemaVersion: 1,
            emittedAt: "2026-08-29T12:00:00.000Z",
            repoRoot: "/selected",
            branch: "feat/demo",
            head: seedHead,
            dirty: false,
            activeWorkUnit: "demo",
            metaPath: ".arc/active/meta-demo.md",
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit",
            taskCursor: null,
            loadSet: { manifestVersion: 1, entries: [] },
            uncommittedFiles: [],
            locus: { checkoutPath: "/selected", parentCheckoutPath: null },
        };
        mocks.readFile.mockImplementation((path: string, encoding: string) => {
            if (encoding !== "utf8") throw new Error(`unexpected encoding: ${encoding}`);
            if (path === "/selected/.arc/user/test-user/.internal/compaction-seed.json") {
                return Promise.resolve(JSON.stringify(seed));
            }
            if (path === "/selected/.arc/active/tasks-demo.md") {
                return Promise.resolve("fresh tasks\n");
            }
            throw new Error(`unexpected read: ${path}`);
        });
        mocks.createRecoverStatusProbes.mockReturnValue({});
        mocks.runRecoverStatus.mockResolvedValue({});
        mocks.gitExec.mockImplementation((_command: string, args: string[], options?: { cwd?: string }) => {
            if (options?.cwd !== "/selected") {
                throw new Error(`git call escaped recovered checkout: ${options?.cwd ?? "unset"}`);
            }
            if (args[0] === "status") return Promise.resolve({ stdout: "" });
            if (args.includes("--abbrev-ref")) return Promise.resolve({ stdout: "feat/demo\n" });
            if (args.includes("--verify")) {
                const ref = args.at(-1);
                return Promise.resolve({ stdout: `${ref === `${seedHead}^{commit}` ? seedHead : freshHead}\n` });
            }
            if (args[0] === "merge-base" && args[1] === seedHead && args[2] === freshHead) {
                return Promise.resolve({ stdout: `${seedHead}\n` });
            }
            if (args[0] === "diff") return Promise.resolve({ stdout: ".arc/active/tasks-demo.md\0" });
            if (args[0] === "show" && args[1] === `${seedHead}:.arc/active/tasks-demo.md`) {
                return Promise.resolve({ stdout: "seed tasks\n" });
            }
            throw new Error(`unexpected git call: ${args.join(" ")}`);
        });
        let observedResolverEvidence: unknown;
        mocks.auditRecoveryState.mockImplementation(async (input: {
            resolveCommittedProgress?: (seedHead: string, currentHead: string) => Promise<unknown>;
            resolveTaskListEvidence?: (taskListPath: string) => Promise<unknown>;
        }) => {
            if (input.resolveCommittedProgress === undefined || input.resolveTaskListEvidence === undefined) {
                throw new Error("recovery progression resolvers are unavailable");
            }
            observedResolverEvidence = {
                committed: await input.resolveCommittedProgress(seedHead, freshHead),
                tasks: await input.resolveTaskListEvidence(".arc/active/tasks-demo.md"),
            };
            return {
                status: "ready",
                ready: true,
                stopReasons: [],
                explainedDrift: [],
                loadSetAudit: null,
                locus: null,
                locusHint: null,
                dirtyFiles: {
                    expected: [],
                    actual: [],
                    pathSetMatch: true,
                    dirtyStateConsistent: true,
                    match: true,
                    explainedByCommittedProgress: false,
                },
                taskCursor: null,
            };
        });

        await handleRecoverAudit({ json: true });

        expect(observedResolverEvidence).toEqual({
            committed: {
                advanced: true,
                files: new Set([".arc/active/tasks-demo.md"]),
            },
            tasks: {
                status: "ok",
                seed: "seed tasks\n",
                fresh: "fresh tasks\n",
            },
        });
    });
});
