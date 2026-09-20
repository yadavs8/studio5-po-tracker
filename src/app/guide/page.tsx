import Link from 'next/link';
import { PageHeader } from '@/lib/ui';
import { WORDS, HELP } from '@/lib/plain';

const STEPS = [
  { n: 1, t: 'Client sends a Purchase Order (PO)', d: 'This is the client saying "we agree to pay this much for this work". Enter it on the PO & PI page and attach the PDF. Its total (with GST) is the number everything else is measured against.' },
  { n: 2, t: 'You send a Proforma Invoice (PI)', d: 'A PI is a quote sent for approval before the real invoice. Enter it on the PO & PI page and link it to its PO. The client may ask for changes; the status shows where it is.' },
  { n: 3, t: 'You raise the Tax Invoice', d: 'Once the client accepts, you issue the real invoice. On the Invoices page, choose the PO (and the PI it came from). The PI is marked done automatically. If the invoice would go above what is left on the PO, the app warns you.' },
  { n: 4, t: 'Money arrives in the bank', d: 'On the Payments page, record the amount, the date and which PO it is for. Advances (money before any invoice) are recorded the same way, as type "Advance".' },
  { n: 5, t: 'Match the money to the invoices', d: 'Press Allocate on a payment and say which invoice(s) it paid. One payment can pay several invoices. The app will not let you match more than the payment, or more than the invoice needs.' },
  { n: 6, t: 'Note tax deducted or amounts held back', d: 'On the invoice, add "Tax deducted by client (TDS)" or "Held back until site handover" so the balance is exact. Held-back money is kept separate and is never counted as overdue.' },
  { n: 7, t: 'Log how far the work is', d: 'Master Data → pick the site → Log Progress. This is shown next to how much has been billed, so you can see if work is ahead of billing.' },
];

const TERMS: [string, string][] = [
  [WORDS.poValue, HELP.poValue],
  [WORDS.billed, HELP.billed],
  [WORDS.received, HELP.received],
  [WORDS.taxDeducted, HELP.taxDeducted],
  [WORDS.held, HELP.held],
  [WORDS.billedUnpaid, HELP.billedUnpaid],
  [WORDS.notBilled, HELP.notBilled],
  [WORDS.stillToReceive, HELP.stillToReceive],
  [WORDS.advanceLeft, HELP.advanceLeft],
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <PageHeader
        title="How this works"
        subtitle="Written for someone who does not know accounting. Read once, and every screen will make sense."
      />
      <div className="max-w-4xl space-y-10 px-8 py-8">
        <section>
          <h2 className="font-serif text-xl font-semibold">The idea in one paragraph</h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-[#1C1C1A]/80">
            Every job starts with a <b>PO</b>: the total the client agreed to pay. Everything else (quotes, invoices, money received) is
            tracked <b>against that PO</b>, so at any moment you can see what is paid, what is billed but unpaid, and what is still to come.
            You type each thing in once. The app does all the adding and subtracting, so no total is ever typed by hand.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl font-semibold">The steps, in order</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4 border border-[#1C1C1A]/10 bg-white px-5 py-4">
                <span className="flex h-7 w-7 flex-none items-center justify-center bg-[#1F3A52] font-mono text-sm text-white">{s.n}</span>
                <div>
                  <div className="font-sans text-sm font-semibold">{s.t}</div>
                  <div className="mt-1 font-sans text-sm leading-relaxed text-[#1C1C1A]/70">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-serif text-xl font-semibold">A worked example</h2>
          <div className="mt-3 border border-[#1C1C1A]/10 bg-white px-5 py-4 font-sans text-sm leading-relaxed">
            Dehradun gave PO 016 for <b className="font-mono">₹10,55,546.88</b>. They paid an advance of <b className="font-mono">₹1,55,166</b>.
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[#1C1C1A]/80">
              <li><b>Money received:</b> ₹1,55,166 (15%).</li>
              <li><b>Still to receive on the PO:</b> ₹10,55,546.88 − ₹1,55,166 = <b className="font-mono">₹9,00,380.88</b>.</li>
              <li><b>Billed, waiting for payment:</b> ₹0, because no tax invoice has been raised yet.</li>
              <li>So the whole ₹9,00,380.88 is <b>work not billed yet</b>. When you raise an invoice, that part moves into &quot;billed, waiting for payment&quot;. When the client pays, it moves into &quot;received&quot;.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-xl font-semibold">What each number means</h2>
          <dl className="mt-3 divide-y divide-[#1C1C1A]/10 border border-[#1C1C1A]/10 bg-white">
            {TERMS.map(([t, d]) => (
              <div key={t} className="grid grid-cols-1 gap-1 px-5 py-3 md:grid-cols-3 md:gap-4">
                <dt className="font-sans text-sm font-semibold">{t}</dt>
                <dd className="font-sans text-sm leading-relaxed text-[#1C1C1A]/70 md:col-span-2">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="font-serif text-xl font-semibold">Keeping the data clean</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 font-sans text-sm leading-relaxed text-[#1C1C1A]/80">
            <li>The app <b>refuses</b> wrong entries: amounts of zero, taxable + GST not equal to the total, matching more money than was received, or mixing up sites.</li>
            <li>Open <Link href="/data-health" className="text-[#1F3A52] underline">Data health</Link> any time. It lists anything missing (like an unattached file) or unclear (like a payment not matched to an invoice). Empty list = trustworthy numbers.</li>
            <li>Every change to a PO, invoice or payment is logged with who changed it and when, and the log cannot be edited.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
