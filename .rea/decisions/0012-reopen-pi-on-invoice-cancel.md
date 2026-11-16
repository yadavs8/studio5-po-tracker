# 0012 — A PI reopens when its tax invoice is cancelled

Status: accepted (2026-11-15). Owner: "yes, reopen the PI". Refines rule M17 (migration_015).

A converted PI stays converted while its tax invoice is live. When that invoice is cancelled — in the tracker
or by a void in the doc generator — the PI goes back to "sent", its invoice link is cleared, and its remarks
say which invoice was cancelled, so the corrected invoice can be made from the same PI. The cancelled
invoice keeps its `pi_id` as history. Un-cancelling the invoice converts the PI back only if it is still open
(it never takes the PI from a newer invoice). Done in the database (migration_018) so every path behaves alike.
