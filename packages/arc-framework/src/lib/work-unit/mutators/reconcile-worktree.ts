/** Compatibility export for the renamed work-unit worktree mutator. */

export {
  nodeReconcileWorkUnitWorktreeFs,
  nodeReconcileWorkUnitWorktreeFs as nodeReconcileWorktreeFs,
  reconcileWorkUnitWorktree,
  reconcileWorkUnitWorktree as reconcileWorktree,
  isSelfTeardown,
} from "./reconcile-work-unit-worktree.js";
export type {
  ReconcileWorkUnitWorktreeContext,
  ReconcileWorkUnitWorktreeContext as ReconcileWorktreeContext,
  ReconcileWorkUnitWorktreeFs,
  ReconcileWorkUnitWorktreeFs as ReconcileWorktreeFs,
  ReconcileWorkUnitWorktreeOp,
  ReconcileWorkUnitWorktreeOp as ReconcileWorktreeOp,
  ReconcileWorkUnitWorktreeResult,
  ReconcileWorkUnitWorktreeResult as ReconcileWorktreeResult,
} from "./reconcile-work-unit-worktree.js";
