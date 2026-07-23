import { describe, expect, it, vi } from "vitest";

import { resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

const routineCode = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: false },
};

const preferences = (sourceIds: readonly string[] = []) => ({
  readDeveloperSourceIds: vi.fn().mockResolvedValue(sourceIds),
  readProjectSourceIds: vi.fn().mockResolvedValue([]),
});

describe("frontline workflow command", () => {
  it("accepts explicit change-set facts and a force invocation without executing a source", async () => {
    const registry = new FrontlineSourceRegistry([{
      sourceId: "review-command",
      descriptor: { kind: "command", executable: "reviewer", argv: ["--mode", "frontline"] },
    }]);

    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: routineCode,
      invocation: { mode: "force", sourceId: "review-command" },
    }, { preferences: preferences(), registry })).resolves.toMatchObject({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      diagnostics: [],
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing: { facts: { activity: { frontlineReview: false } } },
        frontlineReview: {
          action: "attempt",
          reasons: [
            "routine-code",
            "frontline-inactive",
            "frontline-policy-skip",
            "invocation-force",
            "source-invocation",
          ],
          source: {
            sourceId: "review-command",
            kind: "command",
            executable: "reviewer",
            argv: ["--mode", "frontline"],
          },
        },
        pass: 1,
        maxPasses: 2,
      },
    });
  });

  it("projects skipped and both offered actions from the resolved semantic state", async () => {
    const registry = new FrontlineSourceRegistry([{
      sourceId: "review-command",
      descriptor: { kind: "command", executable: "reviewer", argv: ["--mode", "frontline"] },
    }]);
    const activeAtomic = {
      ...routineCode,
      changeDeterminacy: "atomic",
      activity: { ...routineCode.activity, frontlineReview: true },
    };

    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: routineCode,
      invocation: { mode: "inherit" },
    }, { preferences: preferences(), registry })).resolves.toMatchObject({
      state: "skipped",
      nextAction: "none",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: activeAtomic,
      invocation: { mode: "inherit" },
    }, { preferences: preferences(), registry })).resolves.toMatchObject({
      state: "offered",
      nextAction: "bind-source",
    });
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: activeAtomic,
      invocation: { mode: "inherit" },
    }, { preferences: preferences(["review-command"]), registry })).resolves.toMatchObject({
      state: "offered",
      nextAction: "obtain-authorization",
    });
  });

  it("fails closed on malformed change-set facts", async () => {
    const result = await resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: { contentKind: "surprise" },
      invocation: { mode: "inherit" },
    }, { preferences: preferences(), registry: new FrontlineSourceRegistry([]) });

    expect(result.payload.routing).toMatchObject({ facts: { changeSetState: "unknown" } });
    expect(result.payload.frontlineReview).toMatchObject({
      action: "offer",
      reasons: expect.arrayContaining(["unknown-change-set", "frontline-policy-attempt", "source-unbound"]),
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("requires invocation input and rejects shell-shaped registry data at the registry boundary", async () => {
    await expect(resolveFrontlineCommand({
      schemaVersion: 1,
      changeSet: routineCode,
    }, { preferences: preferences(), registry: new FrontlineSourceRegistry([]) })).rejects.toThrow();
    expect(() => new FrontlineSourceRegistry([{
      sourceId: "unsafe",
      descriptor: { kind: "command", executable: "reviewer; rm", argv: [] },
    }])).toThrow();
  });
});
