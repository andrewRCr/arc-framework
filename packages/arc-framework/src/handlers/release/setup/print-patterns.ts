/**
 * `arc release setup print-patterns` command orchestrator.
 *
 * Emits paste-ready release-wrapper allowlist patterns for supported
 * harnesses. The command is stdout-only on success and writes no state.
 *
 * @module
 */

export interface RunReleaseSetupPrintPatternsOptions {
  harness?: string;
  format?: string;
  writeStdout?: (msg: string) => void;
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseSetupPrintPatternsResult {
  exitCode: number;
}

const RAW_PATTERNS = [
  "arc release commit:*",
  "arc release push:*",
] as const;

/**
 * Run the `arc release setup print-patterns` sub-command.
 *
 * @param opts - Harness and output-format options plus injectable I/O sinks
 * @returns Exit code for the command invocation
 */
export function runReleaseSetupPrintPatterns(
  opts: RunReleaseSetupPrintPatternsOptions,
): RunReleaseSetupPrintPatternsResult {
  const writeStdout = opts.writeStdout ?? ((msg) => {
    process.stdout.write(msg);
  });
  const writeStderr = opts.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });

  if (opts.format === "raw") {
    writeStdout(`${RAW_PATTERNS.join("\n")}\n`);
    return { exitCode: 0 };
  }

  if (opts.harness === "claude-code") {
    writeStdout(`${JSON.stringify({
      permissions: {
        allow: [
          "Bash(arc release commit:*)",
          "Bash(arc release push:*)",
        ],
      },
    }, null, 2)}\n`);
    return { exitCode: 0 };
  }

  if (opts.harness === "codex") {
    writeStdout("prefix_rule([\"arc\", \"release\", \"commit\"])\n");
    writeStdout("prefix_rule([\"arc\", \"release\", \"push\"])\n");
    return { exitCode: 0 };
  }

  if (opts.harness !== undefined) {
    writeStderr(`Unknown release setup harness: ${opts.harness}. Emitting abstract contract.\n`);
  }

  writeStdout(`Release-wrapper allowlist contract:
1. Canonical command shape: match \`arc release commit\` and \`arc release push\`.
2. Prefix-match semantics: permit each command prefix plus forwarded git arguments.
3. Scope: install in this developer's harness permission surface on this machine.
4. Mode awareness: default-prompt mode removes the harness prompt; bypass mode is audit-only.
5. Side effects: edit only harness allowlist/config; this emitter writes no ARC state.
6. Verification expectations: run a prompt-observation check such as \`arc release commit --version\`.
`);
  return { exitCode: 0 };
}

/**
 * Commander adapter for `arc release setup print-patterns`.
 *
 * @param opts - Commander-parsed harness and format options
 */
export function handleReleaseSetupPrintPatterns(opts: {
  harness?: string;
  format?: string;
}): void {
  const result = runReleaseSetupPrintPatterns(opts);
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
