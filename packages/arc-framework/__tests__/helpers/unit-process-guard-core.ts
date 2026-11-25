/** Per-file admission policy for native launches from unit tests. */
import { resolve } from "node:path";

/** Cumulative launch accounting for one current file. */
export interface UnitLaunchSnapshot {
  readonly file: string;
  readonly launchCount: number;
  readonly blockedCount: number;
  readonly allowlisted: boolean;
}

/** Native launch admission with an injected current-file authority. */
export class UnitProcessGuard {
  private readonly allowed: ReadonlySet<string>;
  private readonly counts = new Map<string, { launchCount: number; blockedCount: number }>();

  constructor(
    readonly root: string,
    allowlist: readonly string[],
    private readonly currentFile: () => string | undefined,
  ) {
    this.allowed = new Set(allowlist.map((file) => resolve(root, file)));
  }

  /**
   * Read current-file cumulative launch accounting.
   * @returns The current file's admission and attempt totals.
   */
  snapshot(): UnitLaunchSnapshot {
    const current = this.currentFile();
    const file = current === undefined ? "<unknown>" : resolve(this.root, current);
    return { file, ...(this.counts.get(file) ?? { launchCount: 0, blockedCount: 0 }),
      allowlisted: current !== undefined && this.allowed.has(file) };
  }

  /**
   * Fail a test whose native refusal was caught after its starting snapshot.
   * @param before - Accounting at the test's start.
   * @returns When no blocked launch occurred since that snapshot.
   */
  assertNoBlockedSince(before: UnitLaunchSnapshot): void {
    if ((this.counts.get(before.file)?.blockedCount ?? 0) > before.blockedCount) {
      throw new Error(`Unit process launch blocked: caught native launch from ${before.file}`);
    }
  }

  /**
   * Fail a file whose suite hooks or collection caught a native refusal.
   * @returns When the file made no blocked launch.
   */
  assertNoBlockedAtFileEnd(): void {
    const snapshot = this.snapshot();
    if (snapshot.blockedCount > 0) {
      throw new Error(`Unit process launch blocked: ${snapshot.blockedCount} caught attempt(s) from ${snapshot.file}`);
    }
  }

  /**
   * Admit a native boundary operation for the current test file.
   * @param operation - Native launch function being invoked.
   * @param action - Original native operation.
   * @returns The admitted operation's unchanged result.
   */
  launch<T>(operation: string, action: () => T): T {
    const before = this.snapshot();
    const counts = this.counts.get(before.file) ?? { launchCount: 0, blockedCount: 0 };
    this.counts.set(before.file, counts);
    counts.launchCount++;
    if (!before.allowlisted) {
      counts.blockedCount++;
      throw new Error(`Unit process launch blocked: ${operation} from ${before.file}`);
    }
    return action();
  }
}
