/** Structurally validated fixed plans shared by runner correlation and transport tests. */
import { PrepareParamsSchema, PrepareResultSchema, type PrepareParams, type PrepareResult } from "../../../src/lib/checks/runner/contract.js";

/** Make a plan whose independent invocation/probe namespaces contain prototype-shaped IDs. */
export function makeRunnerProtocolPlan(): PrepareParams {
  return PrepareParamsSchema.parse({ protocolVersion: 1, planId: "00000000-0000-4000-8000-000000000001",
    source: { root: "/owned/source", manifest: "/owned/manifest", digest: `sha256:${"a".repeat(64)}`,
      coordinates: { tree: "1".repeat(40), head: "2".repeat(40), merged: [] } },
    environment: {},
    probes: { global: [{ id: "__proto__", argv: ["node", "--version"], cwd: "." }],
      check: [{ id: "constructor", argv: ["node", "--version"], cwd: "nested" }] },
    invocations: [{ id: "__proto__", argv: ["runner", "first"], cwd: ".", shell: false },
      { id: "constructor", argv: ["runner", "second"], cwd: "nested", shell: false }],
  });
}

/** Produce a schema-validated ready reply with complete per-invocation probe coverage. */
export function makeRunnerProtocolReady(plan: PrepareParams): Extract<PrepareResult, { status: "ready" }> {
  const result = PrepareResultSchema.parse({ status: "ready", planId: plan.planId, contextId: "context",
    sourceDigest: plan.source.digest, capabilities: { runGroup: true }, runtime: { kind: "known",
      bindings: plan.invocations.map(invocation => ({ invocationId: invocation.id, identity: `sha256:${"b".repeat(64)}`,
        probes: [...plan.probes.global, ...plan.probes.check].map(probe => ({ id: probe.id, stdout: ` \n${probe.id}\r\n` })),
      })),
    } });
  if (result.status !== "ready") throw new Error("Expected ready fixture");
  return result;
}
