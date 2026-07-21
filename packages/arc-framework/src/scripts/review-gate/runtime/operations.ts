/** Closed repository-only map of self-hosting review-gate executable surfaces. */

interface SelfHostingExecutableOperation {
  launcher: `run-${string}.ts`;
  argvPrefix: readonly string[];
  registryKeys: readonly string[];
  npmScript: `review-gate:${string}` | null;
  workflows: readonly `.github/workflows/${string}.yml`[];
  operatorDocs: readonly string[];
  authority: "forward-dormant" | "qualification" | "outage";
}

function operation(value: SelfHostingExecutableOperation): Readonly<SelfHostingExecutableOperation> {
  return Object.freeze({
    ...value,
    argvPrefix: Object.freeze([...value.argvPrefix]),
    registryKeys: Object.freeze([...value.registryKeys]),
    workflows: Object.freeze([...value.workflows]),
    operatorDocs: Object.freeze([...value.operatorDocs]),
  });
}

/** Authoritative operation-to-launcher, registry, command, workflow, and operator-document bindings. */
export const SELF_HOSTING_EXECUTABLE_OPERATIONS = Object.freeze({
  "assert-head-mutable": operation({
    launcher: "run-assert-head-mutable.ts", argvPrefix: [],
    registryKeys: ["createReadOnlyHeadMutabilityReader", "runAssertHeadMutable"],
    npmScript: "review-gate:assert-head-mutable", workflows: [], operatorDocs: [], authority: "forward-dormant",
  }),
  attest: operation({
    launcher: "run-attest.ts", argvPrefix: [], registryKeys: ["createAttestRuntime", "runAttestMain"],
    npmScript: null, workflows: [".github/workflows/review-gate-attest.yml"], operatorDocs: [],
    authority: "forward-dormant",
  }),
  await: operation({
    launcher: "run-await.ts", argvPrefix: [], registryKeys: ["runAwaitMain"], npmScript: "review-gate:await",
    workflows: [], operatorDocs: [".arc/system/workflows/project/coordinate-pr-review.md"],
    authority: "forward-dormant",
  }),
  discover: operation({
    launcher: "run-reconcile.ts", argvPrefix: ["discover"],
    registryKeys: ["createReconcileRuntime", "runDiscoveryMain"], npmScript: null,
    workflows: [".github/workflows/review-gate.yml"], operatorDocs: [], authority: "forward-dormant",
  }),
  "next-action": operation({
    launcher: "run-next-action.ts", argvPrefix: [],
    registryKeys: ["createReadOnlyNextActionReader", "runNextAction"], npmScript: "review-gate:next-action",
    workflows: [], operatorDocs: [".arc/system/workflows/project/coordinate-pr-review.md"],
    authority: "forward-dormant",
  }),
  "perform-action": operation({
    launcher: "run-perform-action.ts", argvPrefix: [],
    registryKeys: ["createReadOnlyNextActionReader", "runPerformAction"], npmScript: "review-gate:perform-action",
    workflows: [], operatorDocs: [".arc/system/workflows/project/coordinate-pr-review.md"],
    authority: "forward-dormant",
  }),
  qualify: operation({
    launcher: "run-qualification.ts", argvPrefix: [], registryKeys: ["runQualification"],
    npmScript: "review-gate:qualify", workflows: [], operatorDocs: [".github/review-gate.md"],
    authority: "qualification",
  }),
  "qualify-token": operation({
    launcher: "run-token-qualification.ts", argvPrefix: [], registryKeys: ["runTokenQualification"],
    npmScript: "review-gate:qualify-token", workflows: [".github/workflows/review-gate-qualify.yml"],
    operatorDocs: [], authority: "qualification",
  }),
  reconcile: operation({
    launcher: "run-reconcile.ts", argvPrefix: ["reconcile"],
    registryKeys: ["createReconcileRuntime", "runReconcileMain"], npmScript: null,
    workflows: [".github/workflows/review-gate.yml"], operatorDocs: [], authority: "forward-dormant",
  }),
  "repair-environment": operation({
    launcher: "run-repair-environment.ts", argvPrefix: [], registryKeys: ["provisionRepairEnvironment"],
    npmScript: "review-gate:repair-environment", workflows: [], operatorDocs: [".github/review-gate.md"],
    authority: "outage",
  }),
  "validate-repair": operation({
    launcher: "run-repair.ts", argvPrefix: [],
    registryKeys: ["parseRepairDispatchEvent", "validateRepairDispatch"],
    npmScript: "review-gate:validate-repair", workflows: [".github/workflows/review-gate-repair.yml"],
    operatorDocs: [], authority: "outage",
  }),
} satisfies Record<string, Readonly<SelfHostingExecutableOperation>>);
