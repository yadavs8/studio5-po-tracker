# 0005 — Retention: release action now, ledger later

Status: accepted (2026-11-15)

Pending retention / handover holds keep counting as settled (PROJECT_RULES: Settlement includes Retention). Add a "Mark released" action on a pending hold so a `retention_release` payment can be matched. The dedicated `retention_ledger` with Handover + DLP maturity (PROJECT_RULES §4) is deferred to a separate feature plan — a known deviation, recorded here. Audit M2.
