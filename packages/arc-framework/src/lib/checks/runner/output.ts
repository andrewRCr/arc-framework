/** Best-effort invocation-attributable display and report output, separate from terminal authority. */
import { StringDecoder } from "node:string_decoder";
import type { PrepareSelectedCheckExecutionInput } from "./execution.js";
import { checkInvocationLabel, type CheckInvocationDetail } from "./parent.js";

/** Collected presentation bytes; protocol settlement remains the facade's responsibility. */
export interface CheckOutputCollector {
  onOutput: NonNullable<PrepareSelectedCheckExecutionInput["onOutput"]>;
  onDiagnostic: NonNullable<PrepareSelectedCheckExecutionInput["onDiagnostic"]>;
  combined(): string;
  diagnostics(): string;
  withOutput(details: readonly CheckInvocationDetail[]): CheckInvocationDetail[];
  report(details: readonly CheckInvocationDetail[]): string;
}

interface OutputChunk {
  invocationId?: string;
  stream: "stdout" | "stderr" | "diagnostic";
  bytes: Buffer;
}

/** Collect display bytes without inferring whether an invocation completed. */
export function createCheckOutputCollector(): CheckOutputCollector {
  const chunks: OutputChunk[] = [];
  const diagnostics: OutputChunk[] = [];
  const byInvocation = new Map<string, OutputChunk[]>();
  const combined = () => collectedText(chunks);
  return {
    onOutput: output => {
      const chunk = { invocationId: output.invocationId, stream: output.stream, bytes: Buffer.from(output.bytes) };
      chunks.push(chunk);
      const invocation = byInvocation.get(output.invocationId) ?? [];
      invocation.push(chunk);
      byInvocation.set(output.invocationId, invocation);
    },
    onDiagnostic: bytes => {
      const chunk = { stream: "diagnostic" as const, bytes: Buffer.from(bytes) };
      chunks.push(chunk); diagnostics.push(chunk);
    },
    combined, diagnostics: () => collectedText(diagnostics),
    withOutput: details => details.map(detail => {
      const received = byInvocation.get(detail.invocationId);
      return received === undefined ? detail : { ...detail, output: collectedText(received) };
    }),
    report: details => details.length <= 1 && details[0]?.shard === undefined ? combined()
      : [collectedText(diagnostics), ...details.filter(detail => detail.output !== undefined)
        .map(detail => `${checkInvocationLabel(detail)}\n${detail.output}`)].filter(Boolean).join("\n"),
  };
}

function collectedText(chunks: readonly OutputChunk[]): string {
  const decoders = new Map<string, StringDecoder>();
  const text: string[] = [];
  for (const chunk of chunks) {
    const key = JSON.stringify([chunk.invocationId, chunk.stream]);
    const decoder = decoders.get(key) ?? new StringDecoder("utf8");
    decoders.set(key, decoder);
    text.push(decoder.write(chunk.bytes));
  }
  for (const decoder of decoders.values()) text.push(decoder.end());
  return text.join("");
}
