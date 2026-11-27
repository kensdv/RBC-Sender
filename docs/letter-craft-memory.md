# LETTER & PDF CRAFT — CORE MEMORY

Learned from the HTML letter library on this machine: 330 HTML files under Desktop + Downloads, 150 in `Downloads\Telegram Desktop`, 142 unique after de-duplication. The library covers Microsoft/Outlook, Adobe, DocuSign, QuickBooks/Intuit, Bill, Barclays, Binance, Chase, Coinbase, Venmo, NFCU, AFCU, EVRI, Zoom, Spotify, SAPO, DGT, HR/staff notices, document-share pages, invoices, receipts, statements, quotes, calendar invites and delivery notices.

Use this memory whenever Rubicon AI writes a letter, an HTML email, a PDF, or an attachment. It is the house style distilled from those files. It does not replace the main Rubicon rules; it specialises them for letters and documents.

---

## 1. THE UNIVERSAL LETTER SKELETON

Every strong letter in the library uses the same eight blocks, in this order:

1. **Hidden preheader** — one short line that previews the letter in the inbox. It never repeats the subject.
2. **Header band** — brand wordmark or logo, centred or left, on the brand colour or white with a thin rule.
3. **Headline (H1)** — one promise or action, 20–26px, sentence case or title case, never a paragraph.
4. **Greeting** — `Dear [Firstname],`, `Hello [Firstname],`, `Hi there,`, `Dear Customer,`, `Dear Staff Member,` or `Attention,`. Use a first name when one exists.
5. **Body** — 2–4 short paragraphs. First paragraph states the fact. Second states the consequence or the amount. Third states the action and deadline. Fourth reassures or closes.
6. **Action panel** — one primary CTA button, optionally with a pale alert box above it and a details/summary box beside or below it.
7. **Signature** — human name, role, team or company, and a reply line. Keep it 2–4 lines.
8. **Footer** — legal name, postal address, copyright year, privacy/terms/contact links, and “please do not reply” when it is automated.

The 600px centred column is the default. Wider (660–700px) only for invoices, statements and tables. Backgrounds are light grey (`#f4f4f4`, `#f5f5f5`, `#f3f2f1`, `#f0f4f7`); the letter card is white with an 8–12px radius and a soft shadow.

---

## 2. COPY FORMULAS THAT RECUR

### Opening lines
- “We noticed some recent activity on your account and want to make sure everything is secure.”
- “We were unable to process your most recent payment for **[Plan]**.”
- “An incoming payment has been initialized for your account.”
- “A document has been shared with you.”
- “You have received an encrypted message.”
- “Your auto generated bill is ready for review.”
- “Your account requires validation to stay active.”
- “A transaction requires your confirmation.”
- “You’re invited to a meeting.”
- “We tried to deliver your parcel however no one was available.”
- “As part of our annual compliance audit, all staff records must be verified.”

### The middle paragraph
Always answer three questions in plain language:
1. **What happened?** (payment declined, document shared, record needs review, parcel held, invoice ready)
2. **Why does it matter?** (service suspended, account limited, funds held, file expires, deadline)
3. **What must the reader do?** (review, confirm, update, sign, pay, reschedule)

Use concrete nouns and numbers: amount, invoice number, reference, tracking number, date, deadline. Avoid vague “important update” copy with no object.

### The urgency line
One line only, and only when true to the letter:
- “If payment is not updated by **[date]**, your service will be suspended.”
- “Failure to verify by **5:00 PM Friday** may result in temporary suspension.”
- “This link will expire in **14 days**.”
- “You have less than **24 hours** to pay.”
- “The card on file was rejected with the error code **card_declined**.”

### The reassurance line
Close the loop with one calm sentence:
- “If you’ve already updated your details, you can safely ignore this email.”
- “If you did not request this, you can safely ignore this message. Your account remains secure.”
- “No action is needed if your details are already correct.”
- “Payments may take up to 24 hours to be reflected on your account.”

### Closings
- `Kind regards,` / `Best regards,` / `Thank you,` / `Sincerely,`
- Then a human name and role, or a team name: `The [Brand] Team`, `[Brand] Security Team`, `IT Teams`, `Office of the Registrar`.
- Never end with a bare “Thanks” and no identity.

### Subject-line formula
`[Brand] + [action] + [object]`, 35–60 characters. Examples from the library:
- `Action required: Update your payment method`
- `Important: Action Required to Verify Your Barclays Account`
- `Microsoft — A document was shared with you`
- `Signature Required - DocuSign`
- `Payment Confirmation Required`
- `Invoice Payment`
- `Your auto generated bill is ready for review`
- `Account Security Update`
- `Staff Update - Urgent Action Required`
- `File Shared`
- `Meeting Invitation`
- `Final notice before penalty`

Use a colon or an em dash, not both. Do not put the whole body in the subject.

---

## 3. VISUAL SYSTEM

### Type
- System stack first: `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`.
- Body 14–16px, line-height 1.5–1.6.
- H1 22–26px, weight 600–700.
- Small print 12–13px, grey `#666`–`#999`.
- Labels 10–11px, uppercase, letter-spacing 1–1.4px.
- Amounts 24–28px, weight 700, tabular numerals.

### Colour
Use two brand colours and one tint:
- **Primary** — header band, CTA, links.
- **Accent** — a rule, icon, status or secondary highlight.
- **Tint** — pale background for alert or summary boxes.

Observed palettes:
| Brand | Primary | Accent / support | Background |
|---|---|---|---|
| Microsoft / Outlook | `#0078D4` or `#0F6CBD` | `#D83B01` (calendar), `#25B09B` | `#F3F2F1` |
| QuickBooks / Intuit | `#2CA01C` | `#D52B1E`, `#393A3D` | `#F4F4F4` |
| DocuSign | `#4C00FF` | `#FFCB00`, `#1A1A2E` | `#F5F4F7` |
| Adobe | `#FA0F00` | `#FF2A15`, `#100033` | `#F6F3F2` |
| Spotify | `#1DB954` | `#000000` header | `#F4F4F4` |
| Barclays | `#0033A0` | `#002D72` | `#F0F4F7` |
| Binance | `#F0B90B` | `#1B1B1B`, `#000000` | `#000000` |
| Chase | `#007C89` | `#0167BB` | `#FFFFFF` |
| Bill | `#2E46E6` | `#F6F8FA` | `#F6F8FA` |
| NFCU / AFCU | `#003366` | `#ED780F` CTA | `#FFFFFF` |
| Zoom | `#2D8CFF` | `#F4F5F8` | `#FFFFFF` |
| Venmo | `#049EFF` | `#2CB543` | `#F6F6F6` |
| EVRI | `#000C8C` | `#FFFFFF` | `#FFFFFF` |
| SAPO / CTT | `#0077C2` | `#078CC5`, `#006FCF` | `#FFFFFF` |

If the brand is unknown, use the Rubicon palette: deep ocean `#0A4F6B`, cyan `#12B8DC`, ink `#0B1F2A`, tint `#EEF7FB`.

### CTA button
- Solid primary colour, white bold label, 12–16px vertical padding, 24–36px horizontal, 5–8px radius (pill only for Spotify-style consumer brands).
- One primary CTA per letter. Secondary actions are plain text links.
- Label starts with a verb: `Review Account Details`, `Update payment method`, `View & Pay Invoice`, `Open Document`, `Verify My Records`, `Reschedule New Delivery`, `Join Zoom Meeting`, `Accept quote`.
- Keep the label under 28 characters where possible.

### Alert / callout
Pale red for failure or risk:
- background `#FEF2F2`, border `#FCA5A5`, left border `#DC2626`, title `#991B1B`, text `#7F1D1D`.
Pale amber for a deadline:
- background `#FFF3CD`, border `#FFEAA7`, text `#664D03`.
Pale blue for information:
- background `#EEF7FB`, border `#BFE3F0`, text `#0A4F6B`.

### Details / summary box
Two-column label/value rows on a tinted panel. Labels grey and small; values dark and bold. Use for:
- amount due, invoice number, due date, status;
- file name, file size, file type, sender;
- meeting title, date, time, location;
- tracking number, reason, new delivery window;
- account status, update required, deadline.

### Footer
12px grey, centred. Include:
- legal entity name and postal address;
- `© [year] [Brand]. All rights reserved.`;
- `Privacy Policy · Terms of Service · Contact Us`;
- `This is an automated message. Please do not reply.` when true;
- an unsubscribe line only for marketing, not for transactional notices.

---

## 4. LETTER RECIPES BY TYPE

### Formal notice
Reference + issue date row, headline, 2–3 paragraphs (matter, action, deadline), alert box, CTA `Open notice`, signature, footer. One page.

### Invoice
Bill-from block, invoice number, issue date, due date, line-item table (description / qty / amount), subtotal, tax, total, payment terms, CTA `View & Pay Invoice`. Amount is the largest number on the page.

### Statement
Statement period, opening balance, transaction table (date / description / amount), closing balance, CTA `View statement`.

### Quote
Reference, scope, itemised pricing, total, validity date, payment terms, CTA `Accept quote`.

### Receipt
Paid date, payment method, reference, itemised lines, total paid, short thank-you, CTA `View receipt`.

### Agreement
Parties, effective date, 4–6 numbered clauses, signature block, CTA `Review agreement`.

### Report
KPI summary, 3–5 findings with real-looking numbers, one recommendation, CTA `Read report`.

### Calendar invite
Title, date and time, duration, location or link, short agenda, CTA `Open invite`.

### Security alert
What happened, when, device/location if known, what to do, deadline, CTA `Review activity`. Reassurance line: “If this was you, no action is needed.”

### Document share
File name, file size, file type, sender, one-line reason, CTA `Open document`. Add “File can only be accessed on laptop or desktop” only when the source letter uses it.

### Payment request
Amount, invoice number, description, due date, CTA `Confirm payment` or `View & Pay Invoice`.

### Delivery notice
Tracking number, reason for failure, redelivery window, CTA `Reschedule delivery`.

### HR / staff notice
What changed, what the reader must update, deadline, CTA `Update my information`, signature from IT/HR, footer “automated notification”.

### Event invite
Host, date/time, location, what to expect, CTA `Join` or `Download invitation`.

---

## 5. HTML BUILD RULES (EMAIL-SAFE)

- Use tables for layout, not flex/grid, in the outer shell. Inline the critical styles on every `td`.
- Max width 600px; centre with `align="center"`; use `role="presentation"` on layout tables.
- Keep `<style>` for media queries and resets only. Do not depend on external CSS for the letter to look right.
- Images: absolute HTTPS URLs, explicit `width`/`height`, `display:block`, `border:0`, `alt` text. Never rely on a background image for meaning.
- Buttons: a real `<a>` with padding, background, radius and `mso-padding-alt` where possible.
- Dark mode: keep body text dark on white; if the brand uses a dark card, set both background and text explicitly.
- Mobile: single column at 600px, 20–24px side padding, CTA full-width or centred, font not below 14px.
- Accessibility: one H1, real link text, alt text, sufficient contrast, no text inside images.
- Do not use JavaScript in the letter. Links must work without it.
- Do not use `position:fixed`, `vh`, `vw`, or CSS variables in the email shell.

---

## 6. PDF BUILD RULES

- One page. A4 or US Letter. Margins 48–54pt.
- Header band 90–100pt tall, company name 20–22pt, document type 9–10pt.
- Reference and date row with small uppercase labels and bold values.
- Optional action-required overlay: pale tint, left accent, 9pt bold label.
- Body 10–11pt, line-height 1.35–1.5, maximum ~350 words.
- CTA button 40pt tall, brand fill, white 10–11pt bold label.
- Add a real PDF link annotation over the button with the exact URL. Verify `/URI` exists and matches.
- Footer band with company, reference, page marker and a short legal line.
- Use two brand colours plus one tint. Never more than three.
- Filename: `DocumentType-YYYY-MM-DD.pdf` (e.g. `Formal-Notice-2026-11-27.pdf`, `Invoice-2026-11-27.pdf`). Never `ai-document.pdf`.
- If the body would overflow, reduce to 9.5–10pt and tighten leading before adding a second page.

---

## 7. AI GENERATION RULES

- The AI writes the **body text only**. The page builder adds letterhead, reference, date, overlay, button and footer.
- Return plain text lines. No HTML, no markdown, no commentary, no “Here is your letter”.
- Use the letter's own subject, tone and facts. Do not invent a different company, amount or deadline.
- Placeholders: `[Firstname]`, `[Lastname]`, `[Company]`, `++rbc_number6++`, `++rbc_date++`, `++rbc_url++`. Never leave a placeholder visible in the rendered letter.
- If a first name is unknown, use `Dear Customer,` or `Hello,` — not `Dear [Firstname]` in the final render.
- Match the document type to the structure in section 4. A notice is not an invoice; a receipt is not a statement.
- Keep the subject and the H1 aligned. The subject is the inbox promise; the H1 is the page promise.
- Do not add fake logos, fake signatures or fake legal boilerplate that contradicts the brand.
- Do not add more than one CTA. Do not bury the CTA below the footer.
- For PDFs, keep the body under 350 words and leave room for the header, reference row, overlay, button and footer.

---

## 8. QUALITY CHECK BEFORE SENDING

1. Is the brand name, amount, reference and date correct and consistent?
2. Is there exactly one clear action, and does the button label start with a verb?
3. Does the deadline appear once, in the body or the alert, not three times?
4. Is the greeting personal where possible?
5. Is the footer complete (legal name, address, copyright, links)?
6. Does the letter render at 600px without horizontal scroll?
7. Does the PDF fit one page, with no clipped text and a working link?
8. Is the filename smart and human-readable?
9. Is the tone calm and specific, not shouty and generic?
10. Would a busy recipient understand the ask in under 10 seconds?

---

## 9. ANTI-PATTERNS

- A wall of text with no headline, no CTA and no summary.
- More than one primary button, or a button that says “Click here”.
- “Dear Customer” when a first name is available.
- Fake urgency with no date, amount or consequence.
- A logo image that is wider than the card, or a broken external image.
- White text on a white background after dark-mode inversion.
- A PDF with a second page that contains only a signature or footer.
- A PDF link that looks like a button but has no annotation.
- A subject line that repeats the whole body.
- Hidden placeholders such as `++rbc_url++` visible in the final letter.
- Rebuilding an existing draft when the ask was a small edit.

---

## 10. ONE-SENTENCE SUMMARY

A good letter is a 600px white card on a light page: brand header, one clear headline, a human greeting, three short paragraphs that state fact → consequence → action, one verb-led button, a compact details box, a human signature and a complete legal footer; the PDF is the same letter on one page with a coloured header, reference/date row, action overlay, clickable button and smart filename.
