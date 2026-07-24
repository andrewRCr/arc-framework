/** In-process assembly and canonical validation for release-commit input. */

import {
  assembleCommitMessageParagraphs,
  captureCommitMessageFileSource,
  wrapCommitMessageBody,
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
  /** Whether unsupported or Git-managed sources may fall through to interactive Git behavior. */
  interactionAllowed?: boolean;
  readFile: (path: string) => Promise<Uint8Array>;
  readFileWithIdentity?: (path: string) => Promise<{
    bytes: Uint8Array;
    identity: string;
  }>;
  readStdin: () => Promise<Uint8Array>;
  setupRepository: (cwd: string) => Promise<CommitMessageCheckRepository>;
  hasPrepareCommitMsgHook: (cwd: string) => Promise<boolean>;
  /** Whether `-m` bodies should be greedy-wrapped to the resolved policy width. */
  wrap: boolean;
}

function inputFailure(message: string): CommitMessagePreflightResult {
  return { kind: "refused", reason: "input", message };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
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
    const validationSkipped = preparedContext.kind === "outcome" && preparedContext.outcome.kind === "skipped";
    if (validationSkipped && deps.interactionAllowed !== false) {
      return { kind: "pass-through" };
    }

    const classification = classifyCommitMessageInput({
      args,
      stdinIsTTY: deps.stdinIsTTY,
      commitCleanup: repository.cleanup,
      commitEncoding: repository.encoding,
    });
    if (classification.kind === "pass-through") {
      return deps.interactionAllowed === false
        ? inputFailure("Commit-message input is not a proven editor-free deterministic source.")
        : classification;
    }
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
      const raw = assembleCommitMessageParagraphs(classification.source.values);
      if (deps.wrap && preparedContext.kind === "ready") {
        const wrapped = assembleCommitMessageParagraphs(
          classification.source.values,
          preparedContext.policy.bodyMaxLineLength,
        );
        messageBytes = wrapped;
        transport = bytesEqual(wrapped, raw) ? { kind: "messages" } : { kind: "messages", snapshotRouted: true };
      } else {
        messageBytes = raw;
        transport = { kind: "messages" };
      }
    } else {
      const capture = await captureCommitMessageFileSource(classification.source.path, deps);
      if (capture.kind === "error") return inputFailure(capture.message);
      messageBytes = capture.messageBytes;
      transport = capture.input === "file"
        ? {
            kind: "file",
            rawBytes: capture.rawBytes,
            sourcePath: classification.source.path,
            ...(capture.sourceIdentity === undefined
              ? {}
              : { sourceIdentity: capture.sourceIdentity }),
          }
        : { kind: "stdin", rawBytes: capture.rawBytes };
    }

    if (validationSkipped) {
      return { kind: "passed", verdict: "pass", messageBytes, transport };
    }

    const checked = await validateCommitMessageBytes(messageBytes, repository);
    if (checked.kind === "error") return inputFailure(checked.error.message);
    if (checked.result.kind === "skipped") return { kind: "pass-through" };
    if (checked.exitCode === 1) {
      const rendered = renderCheckCommitMessage(checked, false);
      let correctedMessageBytes: Uint8Array | undefined;
      if (
        classification.source.kind !== "messages"
        && preparedContext.kind === "ready"
        && isUtf8Encoding(repository.encoding)
      ) {
        const wrapped = wrapCommitMessageBody(messageBytes, preparedContext.policy.bodyMaxLineLength);
        if (!bytesEqual(wrapped, messageBytes)) {
          const corrected = await validateCommitMessageBytes(wrapped, repository);
          if (corrected.kind === "result" && corrected.exitCode === 0) correctedMessageBytes = wrapped;
        }
      }
      return {
        kind: "refused",
        reason: "validation",
        message: (rendered.stderr ?? rendered.stdout ?? "Commit-message validation failed.").trimEnd(),
        ...(correctedMessageBytes === undefined ? {} : { correctedMessageBytes }),
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

function isUtf8Encoding(label: string): boolean {
  try {
    return new TextDecoder(label).encoding === "utf-8";
  } catch {
    return false;
  }
}
