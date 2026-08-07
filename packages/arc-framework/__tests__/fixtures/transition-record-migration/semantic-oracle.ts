/** Literal semantic authority for the live retirement-record migration fixture. */

export const TERMINAL_TRANSITION_ORACLE = [
  {
    receiptFilename: "sha256-003e7a6b6f62b9b6c235af8ecdc90899583a8e4b33eba429666ccb6d4817db51.json",
    origin: "review-gate-enforcement-promotion",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "review-gate-enforcement-promotion", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-03db3e58088d6e10b200b80a0b153e9f750a26809f4788cf50f53ebc563a73e0.json",
    origin: "retirement-record-relocation",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "retirement-record-relocation", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-862691204a04c69dae8d8f4eab5196c65ff61229445a5fc0d4e7047711aaf44f.json",
    origin: "review-gate-enforcement-qualification",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "review-gate-enforcement-qualification", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-a014250111a9cc34fc6d70d6ed9ab26f26b06b6d17d11ff3a60480b5a6f82bc3.json",
    origin: "recovery-load-scoping",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "recovery-load-scoping", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-a62671fcfb94417f16d1d6fdbe8e7637a3ccc2c174e5da9b8359cc1dcf0d9b5b.json",
    origin: "review-gate-github-adapter",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "review-gate-github-adapter", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-e0d2c506b3289515c936d23e44ba8b217040f772c6844bb8eb22615e2d197a18.json",
    origin: "claimed-sweep-verbs",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "claimed-sweep-verbs", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-3bbfee893989ff3814fc3e60b4aa1a399e3c1de8c0a3923fc27ca6814dacc6a5.json",
    origin: "locus-generation-binding",
    kind: "abandon",
    successors: [],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unique", disposition: { kind: "abandoned" } },
    })),
    reference: { subject: "locus-generation-binding", outcome: { kind: "removed" } },
  },
  {
    receiptFilename: "sha256-af07c19700e967e16eccd6138dff057832e5276babf850e26e6509576893a1a7.json",
    origin: "cohortless-decomposition",
    kind: "rename",
    successors: ["decomposition-hardening"],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: {
        status: "unique",
        disposition: { kind: "retarget", targetSlug: "decomposition-hardening" },
      },
    })),
    reference: {
      subject: "cohortless-decomposition",
      outcome: { kind: "rename", targetSlug: "decomposition-hardening" },
    },
  },
  {
    receiptFilename: "sha256-ddab1e75e335cc1b032cb4197875e24a30d3a933b7b96a058537909fe3114a1a.json",
    origin: "pr-decomposition",
    kind: "rename",
    successors: ["review-chunking"],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: {
        status: "unique",
        disposition: { kind: "retarget", targetSlug: "review-chunking" },
      },
    })),
    reference: {
      subject: "pr-decomposition",
      outcome: { kind: "rename", targetSlug: "review-chunking" },
    },
  },
  {
    receiptFilename: "sha256-5fd33761ecb25ba0d76532a67fbbd11310a15288889555103b2558510fb3335a.json",
    origin: "chunked-delivery",
    kind: "decompose",
    successors: [
      "delivery-integration-target",
      "delivery-plan-record",
      "delivery-review-cardinality",
      "delivery-stack-topology",
    ],
    queries: ["dependent-alpha", "dependent-beta"].map((dependent) => ({
      dependent,
      answer: { status: "unmapped-dependent" },
    })),
    reference: { subject: "chunked-delivery", outcome: { kind: "decompose" } },
  },
] as const;

export const EXCLUDED_PARK_ORACLE = {
  receiptFilename: "sha256-020f054c50361a5a9198364d320ee8f83fa738f8c0600cb3c4e2bc91f134067d.json",
  origin: "decompose-extraction",
  kind: "park-planning",
} as const;
