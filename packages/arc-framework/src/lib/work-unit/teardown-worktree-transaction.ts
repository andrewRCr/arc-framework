/** Marker- and topology-bound transaction for physical worktree retirement. */

import type { GitExec } from "../git/exec.js";
import type { AdvisoryLockOptions } from "../user-sync/notes-lock.js";
import {
  createNodeTeardownSelectionReader,
  teardownSelectionsEqual,
  type TeardownSelection,
  type TeardownSelectionReader,
} from "./teardown-selection.js";
import { withWorktreeOperationLock } from "./worktree-operation-lock.js";

const DIAGNOSTIC = "cannot retire worktree";

export interface RetireWorktreeOptions {
  readonly expectedSelection: TeardownSelection;
  readonly revalidateLocal: () => Promise<void>;
  readonly retireProjection: () => Promise<void>;
}

export interface TeardownWorktreeTransactionDriver {
  retire(options: RetireWorktreeOptions): Promise<void>;
}

/** Bind physical retirement to the shared repository operation mutex. */
export function createNodeTeardownWorktreeTransactionDriver(options: {
  readonly exec: GitExec;
  readonly identity: string;
  readonly lockOptions?: AdvisoryLockOptions;
  readonly readSelection?: TeardownSelectionReader;
}): TeardownWorktreeTransactionDriver {
  const readSelection = options.readSelection
    ?? createNodeTeardownSelectionReader({ exec: options.exec, identity: options.identity });
  return {
    retire: async (request) => {
      await requireExpectedSelection(readSelection, request.expectedSelection, "before mutex acquisition");
      await withWorktreeOperationLock({
        exec: options.exec,
        cwd: request.expectedSelection.checkout.path,
        ...(options.lockOptions === undefined ? {} : { lockOptions: options.lockOptions }),
        operation: async () => {
          await requireExpectedSelection(readSelection, request.expectedSelection, "under the operation mutex");
          await request.revalidateLocal();
          await requireExpectedSelection(readSelection, request.expectedSelection, "before physical retirement");
          await request.retireProjection();
        },
      });
    },
  };
}

async function requireExpectedSelection(
  readSelection: TeardownSelectionReader,
  expected: TeardownSelection,
  boundary: string,
): Promise<void> {
  const current = await readSelection({
    checkoutPath: expected.checkout.path,
    subject: expected.subject,
  });
  if (current.kind !== "clear") {
    throw new Error(`${DIAGNOSTIC}: ${current.message}`);
  }
  if (!teardownSelectionsEqual(expected, current)) {
    throw new Error(`${DIAGNOSTIC}: target selection changed ${boundary}`);
  }
}
