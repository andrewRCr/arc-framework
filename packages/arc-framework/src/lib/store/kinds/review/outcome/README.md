# Review outcomes

An outcome stores one ended review attempt. Its source binding retains the portable admission and result facts for a
local, frontline, or hosted producer. Frontline executable paths and arguments stay outside the stored record; recorded
policy, outcome, and source-binding digests retain their original identities. Source binding retains the digest of the
full source and optional response authority, so portable results still match existing approvals after redaction.

The parser validates content, including the source's admission and coverage. The key uses a local or frontline attempt's
identity and a hosted attempt's stable admission identity. Mutable response and settlement evidence belongs separately.

The write check evaluates the whole proposed lane history for one subject owner. It refuses duplicate terminal
producers, reused hosted admissions, local retry gaps or duplicate generations, and changed contracts under one
extra-pass decision. Incomplete or malformed listings cannot establish admission.
