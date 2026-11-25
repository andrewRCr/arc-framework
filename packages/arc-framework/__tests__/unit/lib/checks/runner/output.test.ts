/** Attributed output keeps split UTF-8 frames intact without making display a completion authority. */
import { expect, it } from "vitest";
import { createCheckOutputCollector } from "../../../../../src/lib/checks/runner/output.js";
import type { CheckInvocationDetail } from "../../../../../src/lib/checks/runner/parent.js";

it("collects interleaved chunks per expected pair and labels the full report", () => {
  const output = createCheckOutputCollector();
  const text = Buffer.from("é first\n");
  output.onOutput({ invocationId: "first", stream: "stdout", bytes: text.subarray(0, 1) });
  output.onOutput({ invocationId: "second", stream: "stderr", bytes: Buffer.from("second\n") });
  output.onOutput({ invocationId: "first", stream: "stdout", bytes: text.subarray(1) });
  output.onDiagnostic(Buffer.from("adapter diagnostic\n"));
  const planned: CheckInvocationDetail[] = [
    { invocationId: "first", batch: 1, shard: { index: 1, count: 2 }, outcome: { kind: "failure", exitCode: 7 } },
    { invocationId: "second", batch: 1, shard: { index: 2, count: 2 }, outcome: { kind: "success", exitCode: 0 } },
    { invocationId: "missing", batch: 2, outcome: { kind: "unavailable", reason: "No terminal outcome" } },
  ];
  const details = output.withOutput(planned);
  expect(details.map(detail => detail.output)).toEqual(["é first\n", "second\n", undefined]);
  expect(details.map(detail => detail.outcome)).toEqual(planned.map(detail => detail.outcome));
  expect(output.report(details)).toContain("Batch 1, shard 1/2\né first\n");
  expect(output.report(details)).toContain("Batch 1, shard 2/2\nsecond\n");
  expect(output.report(details)).toContain("adapter diagnostic");
});

it("decodes stdout and stderr independently when one stream interrupts a split character", () => {
  const collector = createCheckOutputCollector();
  const character = Buffer.from("é");
  collector.onOutput({ invocationId: "one", stream: "stdout", bytes: character.subarray(0, 1) });
  collector.onOutput({ invocationId: "one", stream: "stderr", bytes: Buffer.from("warning\n") });
  collector.onOutput({ invocationId: "one", stream: "stdout", bytes: character.subarray(1) });
  const details = collector.withOutput([{ invocationId: "one", batch: 1, outcome: { kind: "failure", exitCode: 1 } }]);
  expect(details[0]?.output).toBe("warning\né");
  expect(collector.combined()).toBe("warning\né");
});
