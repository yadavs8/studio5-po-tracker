# Studio5 → Tally agent

A small program that runs on the **PC where Tally Prime is open**. It carries entries you have sent from the
Studio5 Project Tracker (the **Tally** page) into Tally. One way only: tracker → Tally.

* It **never creates ledgers**. If a ledger is missing it stops for that entry and tells you which one to create.
* It **refuses to post** unless the Tally company name is filled in on the tracker's Tally page.
* It only touches entries you ticked and sent. Everything already in Tally before the tracker started is marked
  "already in Tally" and is never posted again.

## One-time setup

1. **Install Node.js 20 or newer** from nodejs.org (you already have it if the bill app runs on this PC).
2. **Tally:** press `F1 (Help) → Settings → Connectivity → Client/Server configuration` and set
   *TallyPrime acts as* **Server** (or Both), and enable the HTTP-XML server on port **9000**. Restart Tally if it asks.
3. **Make a test company in Tally** (a copy of your real one) and use it for the first runs.
   In the tracker's Tally page, put that test company's name in "Tally company name".
4. **Create the agent's login:** Supabase → Authentication → Users → *Add user*. Use a separate email
   (for example `tally-agent@studio5.in`) and a strong password.
5. In this folder: `npm install`, then copy `env.example.txt` to `.env` and fill in `AGENT_EMAIL` / `AGENT_PASSWORD`.
6. In Tally create these ledgers if they do not exist (or change the names on the tracker's Tally page):
   `Sales - Interior Fit-Out`, `IGST`, `CGST`, `SGST`, `TDS Receivable`, `Bank Account`, `Cash`,
   and a customer ledger for every client / site.

## Every time

1. In the tracker: **Tally** page → tick new entries → **Preview** → **Send**. They show as *Waiting for the agent*.
2. On this PC, with Tally open on the right company:

```
npm start        # REHEARSAL. Prints exactly what it would post. Changes nothing anywhere.
npm run live     # Posts to Tally once, then marks each entry Sent (or shows why Tally refused it).
npm run watch    # Stays open and checks every 2 minutes (live).
```

Always run `npm start` first and read what it prints.

## What each entry becomes in Tally

| Tracker entry | Tally voucher | Debit | Credit |
|---|---|---|---|
| Tax invoice | Sales | Customer ledger (invoice total) | Sales ledger (taxable) + IGST, or CGST + SGST |
| Payment received | Receipt | Bank ledger (or Cash for cash receipts) | Customer ledger |
| Tax deducted by client (TDS) | Journal | TDS Receivable | Customer ledger |

Amounts held back until handover (retention / handover hold) are **not** sent. They are sent as a normal Receipt
when the money actually arrives.

## Check the logic (no Tally needed)

```
npm test
```
