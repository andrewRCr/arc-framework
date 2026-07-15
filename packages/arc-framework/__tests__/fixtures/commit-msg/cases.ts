/** Shared commit-message acceptance corpus. */

import type { CommitCheckFindingCode, CommitCheckVerdict } from "../../../src/lib/commit-check/index.js";

export type CommitMessageDivergence =
  | "trailer-position"
  | "continuation-folding"
  | "last-occurrence"
  | "pattern-dialect"
  | "invalid-active-config";

export interface CommitMessageFixture {
  name: string;
  messageBytes: Uint8Array;
  config: string;
  repository: {
    artifacts?: readonly string[];
    unavailableRoots?: readonly string[];
    role?: "maintainer" | "contributor";
  };
  expected: {
    verdict: CommitCheckVerdict;
    findingCodes: readonly CommitCheckFindingCode[];
  };
  divergence?: CommitMessageDivergence;
  bashVerdict?: CommitCheckVerdict;
}

const encoder = new TextEncoder();
const bytes = (message: string): Uint8Array => encoder.encode(message);

export const COMMIT_MESSAGE_FIXTURES: readonly CommitMessageFixture[] = [
  {
    name: "valid conventional standalone",
    messageBytes: bytes("feat(core): add stable behavior\n\nContext: standalone (maintenance)\n"),
    config: "",
    repository: {},
    expected: { verdict: "pass", findingCodes: [] },
  },
  {
    name: "invalid conventional type",
    messageBytes: bytes("feature(core): add stable behavior\n\nContext: standalone (maintenance)\n"),
    config: "",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["subject.invalid-type"] },
  },
  {
    name: "missing design artifact warning",
    messageBytes: bytes("feat(core): add stable behavior\n\nContext: spec-missing.md (planning)\n"),
    config: "",
    repository: {},
    expected: { verdict: "pass-with-warnings", findingCodes: ["footer.artifact-not-found"] },
  },
  {
    name: "duplicate key keeps first definition",
    messageBytes: bytes("feat(core): add stable behavior\n"),
    config: "commit.context_footer: disabled\ncommit.context_footer: required\n",
    repository: {},
    expected: { verdict: "pass", findingCodes: [] },
  },
  {
    name: "bare empty duplicate selects default",
    messageBytes: bytes("not conventional but long enough\n\nContext: standalone (maintenance)\n"),
    config: "commit.format:\ncommit.format: any\n",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["subject.invalid-format"] },
  },
  {
    name: "partial design roots are advisory",
    messageBytes: bytes("feat(core): add stable behavior\n\nContext: spec-missing.md (planning)\n"),
    config: "",
    repository: { unavailableRoots: ["active"] },
    expected: { verdict: "pass-with-warnings", findingCodes: ["footer.artifact-unresolvable"] },
  },
  {
    name: "Context shaped body line is not final trailer",
    messageBytes: bytes(
      "feat(core): add stable behavior\n\nContext: standalone (maintenance)\nBody follows.\n",
    ),
    config: "",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["footer.missing"] },
    divergence: "trailer-position",
    bashVerdict: "pass",
  },
  {
    name: "trailer continuation folds before policy",
    messageBytes: bytes("feat(core): add stable behavior\n\nContext: tasks-example.md\n (Task 1.2)\n"),
    config: "",
    repository: { artifacts: ["active/tasks-example.md"] },
    expected: { verdict: "pass", findingCodes: [] },
    divergence: "continuation-folding",
    bashVerdict: "fail",
  },
  {
    name: "last Context occurrence is authoritative",
    messageBytes: bytes(
      "feat(core): add stable behavior\n\nContext: standalone (maintenance)\nContext: invalid\n",
    ),
    config: "",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["footer.invalid"] },
    divergence: "last-occurrence",
    bashVerdict: "pass",
  },
  {
    name: "POSIX-only custom pattern receives migration finding",
    messageBytes: bytes("ticket-12345\n"),
    config:
      "commit.format: custom\ncommit.custom_pattern: '^ticket-[[:digit:]]+$'\ncommit.context_footer: disabled\n",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["config.unsupported-pattern-dialect"] },
    divergence: "pattern-dialect",
    bashVerdict: "pass",
  },
  {
    name: "unknown active enum fails consistently",
    messageBytes: bytes("feat(core): add stable behavior\n"),
    config: "commit.format: strict\ncommit.context_footer: disabled\n",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["config.invalid-value"] },
    divergence: "invalid-active-config",
    bashVerdict: "pass",
  },
  {
    name: "astral subject length counts code points",
    messageBytes: bytes("feat(x): 😀\n"),
    config: "hooks.subject_max_length: 10\ncommit.context_footer: disabled\n",
    repository: {},
    expected: { verdict: "pass", findingCodes: [] },
  },
  {
    name: "embedded dotted phase retains Bash rejection",
    messageBytes: bytes("feat(core): add stable behavior\n\nSubPhase 1.2 is still rejected\n"),
    config: "commit.context_footer: disabled\n",
    repository: {},
    expected: { verdict: "fail", findingCodes: ["message.dotted-phase"] },
  },
] as const;
