# Expected Behavior: Producer-Backed Approval Report

The assessment should establish that:

- the report's four-column table carries the finding's stable label, unsupported grade marker, title, and `REJECT`
  action, with its open question in the Decisions block beneath it;
- the finding's section carries its verdict, the reviewer's reported grade, and record-only standing on its status
  line, then states the finding before the full action and detail behind the verdict;
- the separate evidence text, offered on request rather than shown in the report, preserves the native label, capture
  ordinal, source reference, and report-local finding label without conflating them, and keeps ARC's verification
  reference distinct from the producer source;
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
