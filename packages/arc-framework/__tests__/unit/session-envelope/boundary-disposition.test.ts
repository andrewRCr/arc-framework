/** Output-boundary failure and original-emission coverage for envelope producers. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertSessionInitProbeResult,
    assertSessionRecoverProbeResult,
} from "../../../src/commands/status/schema.js";
import { formatUnexpectedError } from "../../../src/lib/errors.js";
import { assertRecoverAuditReport } from "../../../src/lib/recover/report.js";

const FIXTURE_DIR = join(
    import.meta.dirname,
    "..",
    "..",
    "fixtures",
    "session-envelope",
);

type ContractAssertion = (value: unknown) => void;

function fixture(name: string): Record<string, unknown> {
    const normalized = readFileSync(join(FIXTURE_DIR, name), "utf8");
    return JSON.parse(
        normalized.replaceAll(/<DATE_\d+>/gu, "2026-01-02"),
    ) as Record<string, unknown>;
}

function substituteCliBoundary(
    assertContract: ContractAssertion,
    value: Record<string, unknown>,
): { exitCode: number; stderr: string; stdout: string } {
    try {
        assertContract(value);
        return {
            exitCode: 0,
            stderr: "",
            stdout: `${JSON.stringify(value)}\n`,
        };
    } catch (error) {
        return {
            exitCode: 1,
            stderr: `${formatUnexpectedError(error)}\n`,
            stdout: "",
        };
    }
}

describe("session-envelope output boundaries", () => {
    it.each([
        [
            "session-init",
            assertSessionInitProbeResult,
            () => ({
                ...fixture("session-init-orient.json"),
                undeclared: true,
            }),
            'session-init-envelope: <root>: Unrecognized key: "undeclared"',
        ],
        [
            "lean recovery",
            assertSessionRecoverProbeResult,
            () => {
                const report = fixture("recovery-audit-ready.json");
                return {
                    ...(report.recover as Record<string, unknown>),
                    undeclared: true,
                };
            },
            'session-recover-envelope: <root>: Unrecognized key: "undeclared"',
        ],
        [
            "recovery report",
            assertRecoverAuditReport,
            () => ({
                ...fixture("recovery-audit-ready.json"),
                undeclared: true,
            }),
            'recovery-audit-report: <root>: Unrecognized key: "undeclared"',
        ],
    ] as const)(
        "fails a malformed internal %s producer before output",
        (_name, assertion, makeValue, detail) => {
            expect(substituteCliBoundary(assertion, makeValue())).toEqual({
                exitCode: 1,
                stderr: `✖ session-envelope.invalid: ${detail}\n`,
                stdout: "",
            });
        },
    );

    it.each([
        [
            "session-init",
            assertSessionInitProbeResult,
            () => fixture("session-init-orient.json"),
            (value: Record<string, unknown>) => {
                const worktree = value.worktree as {
                    value: Record<string, unknown>;
                };
                worktree.value.unownedEvidence = { deep: { retained: true } };
            },
        ],
        [
            "lean recovery",
            assertSessionRecoverProbeResult,
            () => {
                const report = fixture("recovery-audit-ready.json");
                return structuredClone(report.recover) as Record<
                    string,
                    unknown
                >;
            },
            (value: Record<string, unknown>) => {
                const worktree = value.worktree as {
                    value: Record<string, unknown>;
                };
                worktree.value.unownedEvidence = { deep: { retained: true } };
            },
        ],
        [
            "recovery report",
            assertRecoverAuditReport,
            () => fixture("recovery-audit-ready.json"),
            (value: Record<string, unknown>) => {
                const recover = value.recover as {
                    worktree: { value: Record<string, unknown> };
                };
                recover.worktree.value.unownedEvidence = {
                    deep: { retained: true },
                };
            },
        ],
    ] as const)(
        "validates and emits the original %s object",
        (_name, assertion, makeValue, enrich) => {
            const value = makeValue();
            enrich(value);
            const expectedBytes = `${JSON.stringify(value)}\n`;

            const result = substituteCliBoundary(assertion, value);

            expect(result).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: expectedBytes,
            });
            expect(result.stdout).toContain(
                '"unownedEvidence":{"deep":{"retained":true}}',
            );
        },
    );
});
