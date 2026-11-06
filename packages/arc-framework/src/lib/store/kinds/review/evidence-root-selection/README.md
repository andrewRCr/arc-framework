# Approval-root selection

A selector chooses one complete approved-response branch for an exact work-item UID and producer. Its stable key
does not depend on the choice or attribution. The record retains an immutable result binding and the complete root
inventory; changing a choice preserves every approval, performance, settlement, and prior selector version.

Readers validate the full inventory at one captured manifest before returning selected authority. An excluded branch
must contain neither performance nor settlement, including an empty settlement. Missing history, changed roots,
conflicts, or late excluded effects prevent the selector from granting authority.

`arc store repair-review-roots --schema` describes the explicit preview/apply request. Preview reports branches and
eligible choices; apply compares the relevant record versions and complete inventory again under ordinary store
admission. Opposite choices retain a whole-record conflict that the same command can explicitly resolve.
