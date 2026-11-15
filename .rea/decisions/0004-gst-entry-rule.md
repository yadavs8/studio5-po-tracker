# 0004 — GST entry rule

Status: accepted (2026-11-15)

GST may be 0 but never silently blank. If GST is blank and an invoice total is known, GST = total − taxable. If both are blank, the form refuses with "Enter the GST amount (0 if none)". When parts and total disagree by more than ₹1, the form refuses (the DB check `chk_inv_gst_adds_up` already enforces this). Audit H13.
