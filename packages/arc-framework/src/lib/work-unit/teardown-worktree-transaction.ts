/** Marker- and topology-bound transaction for physical worktree retirement. */

import type { GitExec } from "../git/exec.js";
import {
  readWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration,
  restoreWorktreeMarkerGeneration,
  type WorktreeHuskStamp,
} from "../git/worktree-marker.js";
import { digestBytes } from "../kernel/index.js";
import type { AdvisoryLockOptions } from "../advisory-lock.js";
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

/** Exact marker and projection transition performed while the shared worktree mutex is held. */
export interface HuskWorktreeOptions {
  readonly expectedSelection: TeardownSelection;
  readonly revalidateLocal: () => Promise<void>;
  readonly stamp: WorktreeHuskStamp;
  readonly detachProjection: () => Promise<void>;
}

export interface TeardownWorktreeTransactionDriver {
  retire(options: RetireWorktreeOptions): Promise<void>;
  husk?(options: HuskWorktreeOptions): Promise<void>;
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
    husk: async (request) => {
      await requireExpectedSelection(readSelection, request.expectedSelection, "before mutex acquisition");
      await withWorktreeOperationLock({
        exec: options.exec,
        cwd: request.expectedSelection.checkout.path,
        ...(options.lockOptions === undefined ? {} : { lockOptions: options.lockOptions }),
        operation: async () => {
          const checkoutPath = request.expectedSelection.checkout.path;
          await requireExpectedSelection(readSelection, request.expectedSelection, "under the operation mutex");
          await request.revalidateLocal();
          await requireExpectedSelection(readSelection, request.expectedSelection, "before terminal stamp");

          const current = await readWorktreeMarkerGeneration(checkoutPath);
          if (current.kind !== "present") {
            throw new Error(`${DIAGNOSTIC}: terminal stamp requires one managed marker generation`);
          }
          const ownedMarker = { ...current.marker };
          delete ownedMarker.renameMovePending;
          const replaced = await replaceWorktreeMarkerGeneration(
            checkoutPath,
            current.bytes,
            { ...ownedMarker, husk: request.stamp },
          );
          if (replaced.kind !== "replaced") {
            throw new Error(`${DIAGNOSTIC}: marker generation changed before terminal stamp`);
          }

          const stampedSelection: TeardownSelection = {
            ...request.expectedSelection,
            markerGeneration: digestBytes(replaced.bytes),
          };
          try {
            await requireExpectedSelection(readSelection, stampedSelection, "before terminal detach");
            await request.detachProjection();
          } catch (error) {
            await rollbackTerminalStamp(readSelection, request.expectedSelection, replaced.bytes, current.bytes);
            throw error;
          }

          await requireExpectedSelection(
            readSelection,
            {
              ...stampedSelection,
              checkout: {
                ...stampedSelection.checkout,
                branch: null,
                detached: true,
              },
            },
            "after terminal detach",
          );
        },
      });
    },
  };
}

async function rollbackTerminalStamp(
  readSelection: TeardownSelectionReader,
  expected: TeardownSelection,
  stampedBytes: Buffer,
  originalBytes: Buffer,
): Promise<void> {
  await requireExpectedSelection(
    readSelection,
    { ...expected, markerGeneration: digestBytes(stampedBytes) },
    "before terminal-stamp rollback",
  );
  const restored = await restoreWorktreeMarkerGeneration(expected.checkout.path, stampedBytes, originalBytes);
  if (restored.kind !== "replaced") {
    throw new Error(`${DIAGNOSTIC}: terminal-stamp rollback lost its marker generation`);
  }
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
