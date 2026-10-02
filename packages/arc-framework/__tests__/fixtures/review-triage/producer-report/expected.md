# Expected Behavior: Producer-Backed Approval Report

The assessment should establish that:

- the report leads with a decision table whose row carries the finding's report-local label, verdict, gating,
  `REJECT` action, and title, with the open question directly beneath it as the one thing asked of the approver;
- the finding's section gives a standalone account below the table: its heading names the finding, and the reviewer's
  issue is stated before the full action and the detail behind the verdict;
- the trailing evidence line preserves the native label, capture ordinal, source reference, and report-local finding
  label without conflating them, and keeps ARC's verification reference distinct from the producer source;
- ARC's unsupported verdict appears separately from the reviewer's reported `major` grade;
- rejection remains in the complete set as record-only, with a complete rationale, action, and open question;
- the accompanying typed proposal supplies the canonical disposition-set identity, exact target, producer result,
  policy/rubric context, proposer, and `proposedVerification: full`; approval of that complete set has not occurred;
- `proposal.severityGatingPolicy` was carried by the first request and resolved into canonical per-finding `gating`;
  the returned `payload.proposal` need not repeat that input-only field;
- the pass line states where review stands — one admitted pass of a two-pass ceiling, no confirmed findings — and
  remains distinct from the agent's conditional stop recommendation; and
- no response, mutation, or verification narrowing is authorized before approval. A later performed fix scope would
  have to equal or exceed the approved scope.

The retained expectations are a fixture oracle; only an attended fresh-context run supplies behavioral evidence.
