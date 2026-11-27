// Built-in letter templates (HTML + plain text).

const LETTER_TEMPLATES = [
  {
    label: '— premium templates —',
    subject: '', html: '', text: '',
  },
  {
    label: 'Welcome / Onboarding',
    subject: 'Welcome aboard, [Firstname] — your account is ready',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:32px 28px;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:22px;font-weight:700">Welcome, [Firstname]</div>
    <div style="color:#93c5fd;font-size:13px;margin-top:6px">Your account at [Company] is ready</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Your workspace is live. Everything you need to get started is below — most teams are up and running in under ten minutes.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:#2563eb;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Get started</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;line-height:1.7;margin:0">If the button doesn't work, copy this link: ++rbc_url++</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af;margin:0">Questions? Just reply to this email — a real person reads it.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nYour account is ready. Get started: ++rbc_url++\n\nQuestions? Just reply.`,
  },

  {
    label: 'Invoice / Receipt',
    subject: 'Your invoice from [Company] — ref ++rbc_number6++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;border-bottom:2px solid #111827">
    <div style="font-size:20px;font-weight:800">[Company]</div>
    <div style="font-size:13px;color:#6b7280">Invoice</div>
  </div>
  <div style="padding:28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:24px">
      <tr><td style="color:#6b7280;padding:6px 0">Bill to</td><td style="text-align:right;font-weight:600">[Firstname] [Lastname]<br><span style="color:#6b7280;font-weight:400">[~EMail~]</span></td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Invoice #</td><td style="text-align:right">++rbc_number6++-++rbc_randstring++</td></tr>
      <tr><td style="color:#6b7280;padding:6px 0">Date</td><td style="text-align:right">++rbc_date++</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px">
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-weight:600">Description</td><td style="padding:10px 14px;font-weight:600;text-align:right">Amount</td></tr>
      <tr><td style="padding:12px 14px">Professional services</td><td style="padding:12px 14px;text-align:right">$1,250.00</td></tr>
      <tr><td style="padding:12px 14px">Add-ons</td><td style="padding:12px 14px;text-align:right">$350.00</td></tr>
      <tr style="border-top:2px solid #111827"><td style="padding:12px 14px;font-weight:700">Total due</td><td style="padding:12px 14px;text-align:right;font-weight:800;font-size:16px">$1,600.00</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="background:#111827;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pay now</a></td></tr></table>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">Questions about this invoice? Reply to this email.</p>
  </div>
</div>`,
    text: `Invoice ++rbc_number6++-++rbc_randstring++\n\nBill to: [Firstname] [Lastname] <[~EMail~]>\nProfessional services: $1,250.00\nAdd-ons: $350.00\nTOTAL DUE: $1,600.00\nPay: ++rbc_url++`,
  },
  {
    label: 'Follow-up / Bump',
    subject: 'Re: [Firstname] — quick follow-up',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Bumping this to the top of your inbox — just in case it got buried.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">The short version: we can have this done for you by <strong>++rbc_date++</strong>, and there's still room in this month's schedule.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px">Want me to lock in a slot? Reply YES and I'll send the details.</p>
    <p style="font-size:13px;color:#6b7280;margin:0">— The [Company] team</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nBumping this — short version: we can have it done by ++rbc_date++. Reply YES and I'll send details.\n\n— [Company]`,
  },
  {
    label: 'Newsletter',
    subject: 'Your digest — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:#0f172a;padding:28px;text-align:center;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:22px;font-weight:800">[Company] Digest</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px">++rbc_date++ · for [Firstname]</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px">
    <div style="margin-bottom:24px"><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story one headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Two or three sentences of teaser copy that makes the reader click through to the full piece.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <div style="margin-bottom:24px"><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story two headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Second item summary goes here, kept short and punchy.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <div><div style="font-size:17px;font-weight:700;margin-bottom:6px">Story three headline</div><p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0">Third item summary. Vary the topics to keep it fresh.</p><a href="++rbc_url++" style="font-size:13px;color:#2563eb">Read more →</a></div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0"><a href="++rbc_url++" style="color:#9ca3af">View in browser</a> · <a href="[AbmeldeLink]" style="color:#9ca3af">Unsubscribe</a></p>
  </div>
</div>`,
    text: `[Company] Digest — ++rbc_date++\n\n1. Story one headline — ++rbc_url++\n2. Story two headline — ++rbc_url++\n3. Story three headline — ++rbc_url++\n\nUnsubscribe: [AbmeldeLink]`,
  },
  {
    label: 'RFQ / Quote Request',
    subject: 'Request for quotation — [Firstname] / [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;border-bottom:2px solid #0f766e">
    <div style="font-size:20px;font-weight:800;color:#0f766e">Request for Quotation</div>
    <div style="font-size:13px;color:#6b7280;margin-top:4px">Ref RFQ-++rbc_number6++ · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Dear [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">We are sourcing proposals for an upcoming project and your company came recommended. Could you share your best pricing and lead time for the scope below?</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;font-size:14px;margin:16px 0">
      <tr style="background:#f0fdfa"><td style="padding:10px 14px;font-weight:600">Item</td><td style="padding:10px 14px;font-weight:600">Qty</td><td style="padding:10px 14px;font-weight:600;text-align:right">Target date</td></tr>
      <tr><td style="padding:12px 14px">Item description one</td><td style="padding:12px 14px">10</td><td style="padding:12px 14px;text-align:right">++rbc_date++</td></tr>
      <tr><td style="padding:12px 14px">Item description two</td><td style="padding:12px 14px">5</td><td style="padding:12px 14px;text-align:right">++rbc_date++</td></tr>
    </table>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">Please reply with your quotation, payment terms and any questions — we'd like to decide by end of week.</p>
    <p style="font-size:13px;color:#6b7280;margin:0">Regards,<br><strong>[Name]</strong><br>[Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nRequest for quotation — Ref RFQ-++rbc_number6++ (++rbc_date++)\n\nScope:\n- Item one ×10\n- Item two ×5\n\nPlease reply with pricing, terms and lead time.`,
  },
  {
    label: 'Meeting Request',
    subject: 'Quick call? — [Firstname] / [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">I'd love to set up 20 minutes to walk you through what we're doing at [Company] — I think there's a real fit with what you're building.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">Does <strong>++rbc_date++</strong> work? I'm flexible Thursday and Friday afternoon if not.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#0f766e;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pick a time</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:0">Or just reply with a couple of slots that suit you.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:13px;color:#6b7280;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\n20-minute call about [Company]? Does ++rbc_date++ work — or reply with slots.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Payment Reminder',
    subject: 'Friendly reminder — invoice ++rbc_number6++ due ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Just a friendly nudge — invoice <strong>++rbc_number6++-++rbc_randstring++</strong> for <strong>$1,600.00</strong> is due <strong>++rbc_date++</strong>.</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">If it's already been taken care of, ignore this — and thanks again for the business.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#111827;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Pay invoice</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0">Questions? Reply here or call us directly.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nReminder: invoice ++rbc_number6++-++rbc_randstring++ ($1,600.00) due ++rbc_date++.\nPay: ++rbc_url++`,
  },
  {
    label: 'Proposal / Estimate',
    subject: 'Your proposal from [Company] — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(135deg,#111827,#312e81);padding:30px 28px;border-radius:12px 12px 0 0">
    <div style="color:#ffffff;font-size:20px;font-weight:800">Proposal for [Firstname]</div>
    <div style="color:#a5b4fc;font-size:13px;margin-top:6px">Prepared by [Company] · valid until ++rbc_date++</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Attached is our proposal covering the scope we discussed. Here's the headline:</p>
    <div style="background:#f9fafb;border-left:4px solid #4f46e5;padding:16px 20px;margin:0 0 20px;font-size:14px;line-height:1.7">
      <strong>Investment:</strong> $4,800 one-time<br>
      <strong>Timeline:</strong> 3 weeks from kickoff<br>
      <strong>Includes:</strong> setup, training, 30-day support
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4f46e5;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:13px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">Review proposal</a></td></tr></table>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0">Happy to jump on a call and walk through any of it.</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nProposal from [Company] — Investment $4,800, 3-week timeline.\nReview: ++rbc_url++`,
  },
  {
    label: 'Appointment Confirmation',
    subject: 'Confirmed: your appointment ++rbc_date++ ++rbc_time++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="padding:28px;text-align:center">
    <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;margin:0 auto 16px;line-height:56px;font-size:26px">✓</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:4px">You're booked, [Firstname]</div>
    <div style="font-size:14px;color:#6b7280">Appointment confirmed</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin:0 28px 28px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:#0f766e">++rbc_date++</div>
    <div style="font-size:15px;color:#4b5563;margin-top:4px">++rbc_time++</div>
    <div style="font-size:13px;color:#9ca3af;margin-top:8px">with the [Company] team</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0"><tr><td style="background:#0f766e;border-radius:8px"><a href="++rbc_url++" style="display:inline-block;padding:11px 26px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px">Add to calendar</a></td></tr></table>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0 28px 24px">Need to reschedule? Just reply to this email.</p>
</div>`,
    text: `Confirmed, [Firstname] — appointment ++rbc_date++ at ++rbc_time++ with [Company].\nReschedule: reply to this email.`,
  },
  {
    label: 'Order Confirmation',
    subject: 'Order confirmed — ref ++rbc_number6++',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:32px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:19px;font-weight:bold">[Company]</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Order confirmation</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.8;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.8;margin:0 0 16px">Thanks for your order. We've received it and it's being processed — you'll get a shipping update once it leaves our warehouse.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:18px 0">
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Order ref</td><td style="padding:8px 12px;text-align:right">++rbc_number6++-++rbc_randstring++</td></tr>
      <tr><td style="padding:8px 12px">Placed</td><td style="padding:8px 12px;text-align:right">++rbc_date++ ++rbc_time++</td></tr>
      <tr><td style="padding:8px 12px">Ships to</td><td style="padding:8px 12px;text-align:right">[Firstname] [Lastname]</td></tr>
    </table>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">Questions about the order? Just reply — it comes straight to us.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nOrder confirmed — ref ++rbc_number6++-++rbc_randstring++ (placed ++rbc_date++).\nYou'll get a shipping update shortly.`,
  },
  {
    label: 'Shipping / Delivery Notice',
    subject: 'Your shipment is on its way — ref ++rbc_number6++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:2px solid #444">
    <div style="font-size:18px;font-weight:bold">Shipment update</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Ref ++rbc_number6++-++rbc_randstring++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Good news — your package shipped today and is out for delivery. Expected arrival: <strong>++rbc_date++</strong>.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Track it here: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">Someone needs to be available to sign, or you can redirect delivery from the tracking page.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Customer Service · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nYour shipment (ref ++rbc_number6++-++rbc_randstring++) shipped today — expected ++rbc_date++.\nTrack: ++rbc_url++`,
  },
  {
    label: 'Service Recovery / Apology',
    subject: 'Sorry about ++rbc_date++ — and what we are doing about it',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I'm writing personally about the delay you experienced. There's no good excuse — we missed our own deadline and that's on us.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Here's what we've done: the job is now assigned to a senior team member, you'll get daily updates until it's done, and I've applied a credit to your account for the inconvenience.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">If you'd rather talk it through, call me directly — my number is below. I want to make this right.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">[Name]<br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nSorry about the delay — we missed our deadline and that's on us.\nThe job is reassigned, you'll get daily updates, and I've credited your account.\nCall me directly if you'd rather talk: [Name] · [~EMail~]`,
  },
  {
    label: 'Contract / Agreement',
    subject: 'Agreement for signature — [Company] / [Firstname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Service Agreement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Between [Company] and [Firstname] [Lastname] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.8;margin:0 0 14px">Dear [Firstname],</p>
    <p style="font-size:14px;line-height:1.8;margin:0 0 14px">Please find the agreement for the work we discussed. Key terms are summarized below — the full document is attached.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:18px 0">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>Scope</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">As discussed</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>Term</strong></td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">12 months</td></tr>
      <tr><td style="padding:8px 12px"><strong>Fee</strong></td><td style="padding:8px 12px;text-align:right">Per attached schedule</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.8;margin:0 0 20px">You can review and sign electronically here: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:14px;line-height:1.8;margin:0">Let me know if any clause needs clarification before you sign.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nService agreement attached — scope as discussed, 12-month term, fee per schedule.\nReview & sign: ++rbc_url++`,
  },
  {
    label: 'Partnership / Intro',
    subject: 'Quick intro — [Company] × [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I came across [Company] while researching partners in your space — what you're doing with ++rbc_domain1++ caught my eye.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">We help companies like yours with [short description of offering]. I think there's a clean fit — happy to send a one-pager if useful.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Worth a 15-minute call next week? I can work around your schedule.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Best,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nCame across [Company] — liked what you're doing. We help with [offering]; think there's a fit.\nWorth 15 minutes next week?\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Review / Testimonial Request',
    subject: 'How did we do? — [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Your project wrapped up recently and I'd genuinely value your honest feedback — good or bad.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">It takes about two minutes: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">If anything fell short, tell me directly — I'd rather hear it from you than find out later.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nHow did we do? Honest feedback welcome — takes 2 min: ++rbc_url++`,
  },

  {
    label: 'Event Invitation',
    subject: 'You are invited — [event name], ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="background:#1f2937;padding:34px 28px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">You're invited</div>
    <div style="color:#d1d5db;font-size:14px;margin-top:6px">[event name] · hosted by [Company]</div>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:28px;text-align:center">
    <div style="font-size:26px;font-weight:bold;margin-bottom:4px">++rbc_date++</div>
    <div style="font-size:15px;color:#444">++rbc_time++</div>
    <div style="font-size:13px;color:#777;margin:8px 0 24px">[venue or video link]</div>
    <a href="++rbc_url++" style="display:inline-block;background:#1f2937;color:#fff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px">RSVP</a>
    <p style="font-size:12px;color:#999;margin:24px 0 0">Hi [Firstname] — spots are limited, RSVP by ++rbc_date++.</p>
  </div>
</div>`,
    text: `You're invited — [event name]\n\n++rbc_date++ at ++rbc_time++ · [venue]\nRSVP: ++rbc_url++`,
  },
  {
    label: 'Holiday / Office Hours',
    subject: 'Office hours over the holidays — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Quick heads-up on our holiday schedule so nothing catches you off guard:</p>
    <ul style="font-size:14px;line-height:1.9;color:#333;padding-left:20px;margin:0 0 18px">
      <li><strong>++rbc_date++ – ++rbc_date++:</strong> office closed, limited email monitoring</li>
      <li><strong>++rbc_date++ onwards:</strong> full service resumes</li>
      <li>Urgent issues: reply with URGENT in the subject and it gets escalated</li>
    </ul>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Anything that can't wait, send it now and we'll pick it up first thing back.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Happy holidays,<br><strong>The [Company] team</strong></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nHoliday hours: closed ++rbc_date++ – ++rbc_date++. Full service resumes ++rbc_date++.\nUrgent? Reply with URGENT in subject.\n\n— [Company]`,
  },
  {
    label: 'Account Statement',
    subject: 'Your statement — ++rbc_date++ · [Company]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Account statement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">[Firstname] [Lastname] · [~EMail~] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:20px">
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Date</td><td style="padding:8px 12px;font-weight:bold">Description</td><td style="padding:8px 12px;font-weight:bold;text-align:right">Amount</td></tr>
      <tr><td style="padding:8px 12px">++rbc_date++</td><td style="padding:8px 12px">Service charge</td><td style="padding:8px 12px;text-align:right">$120.00</td></tr>
      <tr><td style="padding:8px 12px">++rbc_date++</td><td style="padding:8px 12px">Add-on service</td><td style="padding:8px 12px;text-align:right">$85.00</td></tr>
      <tr style="border-top:2px solid #222"><td colspan="2" style="padding:8px 12px;font-weight:bold">Balance due</td><td style="padding:8px 12px;text-align:right;font-weight:bold">$205.00</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.7;margin:0">View the full statement online: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Billing · [~EMail~]</p>
  </div>
</div>`,
    text: `Statement — ++rbc_date++\n\nService charge $120.00\nAdd-on $85.00\nBalance due: $205.00\nFull statement: ++rbc_url++`,
  },
  {
    label: 'Price Quote / Estimate',
    subject: 'Quote for [Firstname] — valid until ++rbc_date++',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:2px solid #2c5282">
    <div style="font-size:18px;font-weight:bold;color:#2c5282">Quotation</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Prepared for [Firstname] [Lastname] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px">As requested, here's our pricing for the work discussed:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;font-size:13px;margin:16px 0">
      <tr style="background:#ebf2fa"><td style="padding:9px 12px;font-weight:bold">Item</td><td style="padding:9px 12px;font-weight:bold;text-align:right">Price</td></tr>
      <tr><td style="padding:9px 12px">Line item one — description</td><td style="padding:9px 12px;text-align:right">$450.00</td></tr>
      <tr><td style="padding:9px 12px">Line item two — description</td><td style="padding:9px 12px;text-align:right">$780.00</td></tr>
      <tr><td style="padding:9px 12px">Line item three — description</td><td style="padding:9px 12px;text-align:right">$320.00</td></tr>
      <tr style="border-top:2px solid #2c5282"><td style="padding:9px 12px;font-weight:bold">Total</td><td style="padding:9px 12px;text-align:right;font-weight:bold">$1,550.00</td></tr>
    </table>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 18px">Valid until ++rbc_date++. Payment terms: 50% upfront, balance on completion.</p>
    <a href="++rbc_url++" style="display:inline-block;background:#2c5282;color:#fff;padding:11px 28px;text-decoration:none;font-weight:bold;font-size:13px">Accept quote</a>
    <p style="font-size:13px;color:#555;margin:18px 0 0">Questions on any line? Reply and I'll walk you through it.</p>
  </div>
</div>`,
    text: `Quote for [Firstname] — valid until ++rbc_date++\n\nItem one $450 · Item two $780 · Item three $320\nTOTAL: $1,550.00\nAccept: ++rbc_url++`,
  },
  {
    label: 'Thank You Note',
    subject: 'Thank you — [Firstname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#222">
  <div style="padding:36px 32px">
    <p style="font-size:15px;line-height:1.9;margin:0 0 16px">Hi [Firstname],</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 16px">I just wanted to say thank you. The way you handled [recent thing] made a real difference on our end — it doesn't go unnoticed.</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 24px">We're lucky to work with people like you. Looking forward to the next project.</p>
    <p style="font-size:15px;line-height:1.9;margin:0">Warmly,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nThank you — the way you handled things recently made a real difference.\nLooking forward to next time.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'NDA / Confidentiality',
    subject: 'NDA for review — [Company] / [Firstname]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Non-Disclosure Agreement</div>
    <div style="font-size:12px;color:#777;margin-top:2px">Mutual NDA · prepared ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Dear [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Ahead of our discussions, I've attached a mutual NDA covering the information we'll share. It's a standard two-way agreement — nothing unusual.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Please review and sign at your convenience: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a>. Happy to adjust any terms if your legal team has preferences.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Best,<br><strong>[Name]</strong><br><span style="color:#777;font-size:13px">[Company] · [~EMail~]</span></p>
  </div>
</div>`,
    text: `Dear [Firstname],\n\nMutual NDA attached ahead of our discussions — standard two-way terms.\nReview & sign: ++rbc_url++`,
  },
  {
    label: 'Reference / Recommendation',
    subject: 'Reference for [Firstname] [Lastname]',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:36px 32px">
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">To whom it may concern,</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">I am writing to recommend [Firstname] [Lastname], who worked with us at [Company] as [role] from ++rbc_date++ to ++rbc_date++.</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 16px">During that time [Firstname] consistently [key strength]. What stood out most was [specific example]. I would hire them again without hesitation.</p>
    <p style="font-size:14px;line-height:1.9;margin:0 0 24px">Please feel free to contact me with any questions.</p>
    <p style="font-size:14px;line-height:1.9;margin:0">Sincerely,<br><strong>[Name]</strong><br>[Title], [Company]<br>[~EMail~]</p>
  </div>
</div>`,
    text: `To whom it may concern,\n\nI recommend [Firstname] [Lastname] ([role], ++rbc_date++ – ++rbc_date++). Consistently strong on [strength]; standout example: [example]. Would rehire without hesitation.\n\n[Name] · [~EMail~]`,
  },
  {
    label: 'Deadline / Action Notice',
    subject: 'Action needed by ++rbc_date++ — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">This is a reminder that we need [the thing — e.g. signed agreement, updated details, payment] from you by <strong>++rbc_date++</strong> to keep everything on schedule.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">It takes about five minutes: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0">If the deadline is a problem, let me know and we'll find another option — just don't let it slip silently.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Name] · [Company] · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nNeed [item] from you by ++rbc_date++ to stay on schedule.\nTakes 5 min: ++rbc_url++\nIssues? Just reply.`,
  },
  {
    label: 'Job Application Follow-up',
    subject: 'Following up — application for [position]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Dear Hiring Manager,</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I applied for the [position] role on ++rbc_date++ (ref ++rbc_number6++) and wanted to follow up on my application.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">I've attached my updated CV and portfolio. I'm particularly drawn to [specific reason related to company], and I'd welcome the chance to discuss how my experience with [relevant skill] could contribute.</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px">Happy to make time for a call at your convenience.</p>
    <p style="font-size:14px;line-height:1.7;margin:0">Thank you for your consideration,<br><strong>[Firstname] [Lastname]</strong><br><span style="color:#777;font-size:13px">[~EMail~] · [portfolio/LinkedIn]</span></p>
  </div>
</div>`,
    text: `Dear Hiring Manager,\n\nFollowing up on my application for [position] (ref ++rbc_number6++, applied ++rbc_date++). CV + portfolio attached. Drawn to [reason]; happy to discuss [skill].\n\n[Firstname] [Lastname] · [~EMail~]`,
  },
  {
    label: 'Product Update',
    subject: 'What we shipped this month — [Company]',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#222">
  <div style="padding:30px 28px;border-bottom:1px solid #ddd">
    <div style="font-size:18px;font-weight:bold">Product update</div>
    <div style="font-size:12px;color:#777;margin-top:2px">[Company] · ++rbc_date++</div>
  </div>
  <div style="padding:28px">
    <p style="font-size:14px;line-height:1.7;margin:0 0 14px">Hi [Firstname],</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">Quick roundup of what changed since last month — mostly things you asked for:</p>
    <ul style="font-size:14px;line-height:1.9;color:#333;padding-left:20px;margin:0 0 18px">
      <li><strong>Faster exports</strong> — reports now generate in seconds, not minutes</li>
      <li><strong>Bulk edits</strong> — update multiple records at once</li>
      <li><strong>Fixed</strong> the sync issue a few of you flagged</li>
    </ul>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">Full changelog: <a href="++rbc_url++" style="color:#0645ad">++rbc_url++</a></p>
    <p style="font-size:13px;color:#555;margin:0">Something missing? Reply and tell us — it goes straight to the roadmap.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">[Company] Product Team · [~EMail~]</p>
  </div>
</div>`,
    text: `Hi [Firstname],\n\nThis month: faster exports, bulk edits, and the sync fix you flagged.\nChangelog: ++rbc_url++`,
  },


];


export { LETTER_TEMPLATES };
