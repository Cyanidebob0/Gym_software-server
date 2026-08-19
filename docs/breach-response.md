# Personal data breach response

Required by Section 8(6) of the Digital Personal Data Protection Act, 2023 and
Rule 6 of the DPDP Rules, 2025. Failure to notify carries a maximum penalty of
**₹200 crore**, so the deadline below is not advisory.

**The clock starts when the gym becomes aware of the breach, not when it is
understood.** Notify first with what is known; complete the detail afterwards.

## What counts as a breach

Any unauthorised processing, accidental disclosure, acquisition, sharing, use,
alteration, destruction, or loss of access to member personal data. Examples in
this system:

- The Supabase service-role key or database credentials leaking
- A member's ID document being served to the wrong person
- Member records exported or emailed to someone outside the gym
- The owner account being taken over
- Storage buckets or database tables being made publicly readable
- Losing data with no backup (loss of access is a breach, not just disclosure)

A near miss with no actual access is not a breach, but write down why you
concluded that.

## Immediate actions

1. **Contain.** Rotate `SUPABASE_SERVICE_ROLE_KEY` and any exposed credential,
   revoke sessions, close the public access path.
2. **Preserve evidence.** Do not delete logs. Capture Supabase auth and Postgres
   logs before their retention window rolls over.
3. **Record the time you became aware.** This timestamp determines the deadline.

## Notify the Data Protection Board — within 72 hours

Submit through the Board's portal. Include, to the extent known:

- Nature, extent and timing of the breach, and where it happened
- Categories and approximate number of Data Principals affected
- Likely consequences for them
- Measures taken or proposed to contain it and prevent recurrence
- Contact details of the person who can answer follow-up questions

If the full picture is not available within 72 hours, **notify anyway** and
follow up. A late complete report is worse than a prompt incomplete one.

## Notify affected members — without delay

In clear language, tell each affected member:

- What happened and what data of theirs was involved
- The likely consequences for them
- What the gym has done about it
- What they should do — for example, change their password, watch for phishing
- Who to contact (the grievance contact in `client/src/data/legal.js`)

Members can be reached by email from the `members` table. Use the broadcast
feature only for general notices; individual breach notices should be direct.

## Afterwards

- Record the incident, the decisions made, and the reasoning. This log is the
  evidence that the obligation was discharged.
- Fix the root cause. Use the systematic-debugging approach: find why it was
  possible, not just how it happened.
- Note that the Board weighs promptness of remediation and cooperation when
  setting a penalty (Section 33(2)), so the record of what was done matters.

## Data held in this system

Useful when scoping what a breach exposed:

| Table / store | Personal data |
| --- | --- |
| `users` | email, name, phone, role |
| `members` | name, phone, email, address, gender, ID type, ID document path |
| `attendance` | dates and check-in/check-out times |
| `payments`, `refunds` | amounts, methods, invoice numbers, refund reasons |
| `workout_sessions`, `workout_sets` | training logs, notes, progress photo URLs |
| `data_requests` | rights requests and the responses given |
| Storage `member-id-documents` | scanned government ID documents |
| Storage (workout photos) | member-uploaded progress photos |

Auth credentials are held by Supabase Auth; the application never stores
passwords.
