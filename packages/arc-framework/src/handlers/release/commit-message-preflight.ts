/** In-process assembly and canonical validation for release-commit input. */

import {
  assembleCommitMessageParagraphs,
  captureCommitMessageFileSource,
} from "../../lib/release/commit-message-assembly.js";
import { classifyCommitMessageInput } from "../../lib/release/commit-message-source.js";
import { prepareCommitCheckContext } from "../../lib/commit-check/context.js";
import { formatDiagnosticPreview } from "../../lib/commit-check/diagnostics.js";
import type { CommitMessageCheckRepository } from "../../lib/commit-check/repository.js";
import { validateCommitMessageBytes } from "../check/commit-msg.js";
import { renderCheckCommitMessage } from "../check/commit-msg-output.js";
import type { CommitMessagePreflightResult, PreflightCommitMessage } from "./commit.js";

/** I/O and repository boundaries needed by release preflight. */
export interface CommitMessagePreflightDeps {
  stdinIsTTY: boolean;
  readFile: (path: string) => Promise<Uint8Array>;
  readStdin: () => Promise<Uint8Array>;
  setupRepository: (cwd: string) => Promise<CommitMessageCheckRepository>;
  hasPrepareCommitMsgHook: (cwd: string) => Promise<boolean>;
}

function inputFailure(message: string): CommitMessagePreflightResult {
  return { kind: "refused", reason: "input", message };
}

/** Create the production preflight function from injected system boundaries. */
export function createCommitMessagePreflight(deps: CommitMessagePreflightDeps): PreflightCommitMessage {
  return async ({ args, cwd }) => {
    let repository: CommitMessageCheckRepository;
    try {
      repository = await deps.setupRepository(cwd);
    } catch (cause: unknown) {
      const detail = formatDiagnosticPreview(cause instanceof Error ? cause.message : String(cause));
      return inputFailure(`Could not prepare commit-message preflight: ${detail}`);
    }

    const preparedContext = prepareCommitCheckContext(repository.context);
    if (preparedContext.kind === "outcome" && preparedContext.outcome.kind === "skipped") {
      return { kind: "pass-through" };
    }

    const classification = classifyCommitMessageInput({
      args,
      stdinIsTTY: deps.stdinIsTTY,
      commitCleanup: repository.cleanup,
      commitEncoding: repository.encoding,
    });
    if (classification.kind === "pass-through") return classification;
    if (classification.kind === "refused") {
      return inputFailure("Commit-message input requires an interactive editor.");
    }
    try {
      if (await deps.hasPrepareCommitMsgHook(cwd)) return { kind: "pass-through" };
    } catch (cause: unknown) {
      const detail = formatDiagnosticPreview(cause instanceof Error ? cause.message : String(cause));
      return inputFailure(`Could not inspect prepare-commit-msg hook: ${detail}`);
    }

    let messageBytes: Uint8Array;
    let transport: NonNullable<Extract<CommitMessagePreflightResult, { kind: "passed" }>["transport"]>;
    if (classification.source.kind === "messages") {
      messageBytes = assembleCommitMessageParagraphs(classification.source.values);
      transport = { kind: "messages" };
    } else {
      const capture = await captureCommitMessageFileSource(classification.source.path, deps);
      if (capture.kind === "error") return inputFailure(capture.message);
      messageBytes = capture.messageBytes;
      transport = capture.input === "file"
        ? { kind: "file", rawBytes: capture.rawBytes, sourcePath: classification.source.path }
        : { kind: "stdin", rawBytes: capture.rawBytes };
    }

    const checked = await validateCommitMessageBytes(messageBytes, repository);
    if (checked.kind === "error") return inputFailure(checked.error.message);
    if (checked.result.kind === "skipped") return { kind: "pass-through" };
    if (checked.exitCode === 1) {
      const rendered = renderCheckCommitMessage(checked, false);
      return {
        kind: "refused",
        reason: "validation",
        message: (rendered.stderr ?? rendered.stdout ?? "Commit-message validation failed.").trimEnd(),
      };
    }
    const verdict = checked.result.verdict;
    return {
      kind: "passed",
      verdict: verdict === "pass-with-warnings" ? verdict : "pass",
      messageBytes,
      transport,
    };
  };
}
