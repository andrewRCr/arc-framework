/** Production adapters for exact-target frontline review execution. */

import { bindReviewSourceReferenceForInvocation } from "./source-invocation.js";
import type { InteractionContext } from "../../../lib/command-input/interaction-context.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { createReviewCompositionContext } from "./composition-context.js";
import {
  LocalFrontlineOutcomeStore,
} from "../hosts/local/frontline-outcome-store.js";
import {
  prepareFrontlineTargetMaterialization,
} from "../hosts/local/frontline-materialization.js";
import { withRepositoryReviewOperationLock } from "../hosts/local/git-common-state.js";
import {
  classifyFrontlineCarrierFailure,
  prepareFrontlineCarrier,
} from "../policy/frontline-carrier.js";
import {
  normalizeFrontlineOutcome,
} from "../policy/frontline-outcome.js";
import {
  FrontlineSourceRegistry,
} from "../policy/frontline-source.js";
import {
  executeCodeRabbitFrontline,
  CODERABBIT_FRONTLINE_REGISTRATION,
} from "../providers/coderabbit/frontline-execution.js";
import {
  resolveCodeRabbitExecutable,
} from "../providers/coderabbit/executable.js";
import {
  runCodeRabbitProcess,
} from "../providers/coderabbit/process.js";
import type { FrontlineRunCommandDependencies } from "./frontline-run-command.js";

/** External process seams; executable lookup, hashing, and provider parsing stay production-owned. */
export interface CodeRabbitProcessOptions {
  executable?: Pick<NonNullable<Parameters<typeof resolveCodeRabbitExecutable>[1]>, "interrogate" | "pathValue">;
  run?: typeof runCodeRabbitProcess;
}

/** Bind frontline run to exact Git materialization, the invocation's result store, and CodeRabbit. */
export function createFrontlineRunDependencies(options: ReviewInvocationInput & {
  interaction: InteractionContext["subprocess"];
  codeRabbit?: CodeRabbitProcessOptions;
}): FrontlineRunCommandDependencies {
  const context = createReviewCompositionContext(options);
  const input = { ...options, ...context };
  const { publisher, family } = context;
  const registry = new FrontlineSourceRegistry([CODERABBIT_FRONTLINE_REGISTRATION]);
  return {
    bindSourceReference: reference => bindReviewSourceReferenceForInvocation(input, reference),
    operationStore: family.ports.inFlight,
    ...(family.mode === "stored" ? { outcomes: family.ports.outcomes }
      : { outcomeStore: new LocalFrontlineOutcomeStore(publisher) }),
    withOperationLock: (operationId, maxWaitMs, action) => withRepositoryReviewOperationLock(
      input.exec,
      input.cwd,
      operationId,
      maxWaitMs,
      action,
    ),
    confirmSource: (source) => {
      const registered = registry.resolve(source.sourceId);
      return Promise.resolve(registered);
    },
    prepareExecutionTarget: (target) => prepareFrontlineTargetMaterialization({
      ...input,
      target,
    }),
    execute: async (execution) => {
      const expected = CODERABBIT_FRONTLINE_REGISTRATION.descriptor;
      const prepared = await prepareFrontlineCarrier(execution.source, {
        prepareAgent: () => Promise.resolve({
          status: "unavailable",
          reason: "unsupported-agent-carrier",
        }),
        prepareCommand: ({ executable, argv }) => Promise.resolve(
          expected.kind === "command"
          && executable === expected.executable
          && argv.join("\0") === expected.argv.join("\0")
            ? {
                status: "ready",
                execute: () => executeCodeRabbitFrontline(execution, {
                  resolveExecutable: (command, context) => resolveCodeRabbitExecutable(command, {
                    ...context,
                    ...input.codeRabbit?.executable,
                    interaction: input.interaction,
                  }),
                  run: (command, argv, options) => (input.codeRabbit?.run ?? runCodeRabbitProcess)(command, argv, {
                    ...options,
                    interaction: input.interaction,
                  }),
                }),
              }
            : {
                status: "invalid",
                reason: "unsupported-command-carrier",
              },
        ),
      });
      if (prepared.status !== "ready") {
        const failure = classifyFrontlineCarrierFailure(prepared);
        const providerResult = failure === "authorization-rejected"
          ? { kind: "authorization-rejected" as const }
          : failure === "capability-unsupported"
            ? { kind: "capability-unsupported" as const }
            : failure === "invalid-output"
              ? { kind: "malformed" as const }
              : {
                  kind: "unavailable" as const,
                  reason: prepared.status === "unavailable" ? prepared.reason : "adapter-unavailable",
                };
        return {
          outcome: normalizeFrontlineOutcome({
            providerResult,
            source: execution.source,
            target: execution.target,
            pass: execution.pass,
            maxPasses: execution.maxPasses,
          }),
          executableIdentity: null,
        };
      }
      return prepared.execute();
    },
    now: () => new Date().toISOString(),
  };
}
