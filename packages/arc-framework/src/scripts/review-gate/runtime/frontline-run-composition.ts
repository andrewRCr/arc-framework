/** Production adapters for exact-target frontline review execution. */

import type { GitExec } from "../../../lib/git/exec.js";
import {
  LocalFrontlineOutcomeStore,
} from "../hosts/local/frontline-outcome-store.js";
import {
  prepareFrontlineTargetMaterialization,
} from "../hosts/local/frontline-materialization.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../hosts/local/git-common-state.js";
import {
  LocalReviewOperationStateStore,
} from "../hosts/local/operation-state-store.js";
import {
  prepareFrontlineCarrier,
} from "../policy/frontline-carrier.js";
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

/** Bind frontline run to exact Git materialization, repository-common stores, and CodeRabbit. */
export function createFrontlineRunDependencies(input: {
  exec: GitExec;
  cwd: string;
}): FrontlineRunCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const registry = new FrontlineSourceRegistry([CODERABBIT_FRONTLINE_REGISTRATION]);
  return {
    operationStore: new LocalReviewOperationStateStore(publisher),
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    confirmSource: (source) => {
      const registered = registry.resolve(source.sourceId);
      if (registered === null) throw new Error(`unregistered frontline source: ${source.sourceId}`);
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
                  resolveExecutable: resolveCodeRabbitExecutable,
                  run: runCodeRabbitProcess,
                }),
              }
            : {
                status: "invalid",
                reason: "unsupported-command-carrier",
              },
        ),
      });
      if (prepared.status !== "ready") {
        throw new Error(`frontline carrier is not executable: ${prepared.status}`);
      }
      return prepared.execute();
    },
    now: () => new Date().toISOString(),
  };
}
