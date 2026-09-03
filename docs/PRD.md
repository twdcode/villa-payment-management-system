# Juniper Villa Management PRD Addendum

## Dashboard

- The Dashboard is the operational portfolio summary and is calculated from the current repository data as at the workspace demo date. Cancelled villa programmes are excluded from every metric, priority list, note, and drill-down result.
- Users can view the full portfolio, choose a project, and then optionally choose a villa within that project. Changing the project resets the villa filter. Project and villa selections update all KPI cards, charts, attention counts, payment rows, outstanding rankings, and customer notes together.
- **Total project value** is the sum of ready payment-schedule principal for the selected active villas. **Total collected** is schedule principal paid to date. **Outstanding** is unpaid scheduled principal. **Currently due** is unpaid principal whose due date has arrived but whose grace period has not expired. **Overdue** is unpaid principal after the stage grace period. This keeps the dashboard reconciled with Villa and Customer financial views even when a historical receipt record is unavailable.
- **Interest & follow-up** shows unpaid accrued contractual interest, interest collected, the interest recovery rate, reminder-stage cases, and final-notice cases. Villa interest overrides and disabled-interest agreements are respected. Reminder and final-notice counts use the agreement's configured reminder-day thresholds.
- **Attention required** summarizes currently due principal, overdue principal, and unpaid interest. Its rows show overdue-payment, upcoming-60-day-payment, reminder-case, and final-notice counts and link to Collections.
- **Collection overview** separates collected principal, future unpaid principal, currently due principal, and overdue principal so its progress bar does not double count overlapping outstanding categories. The collection rate is collected principal divided by scheduled project value.
- **Upcoming payments** lists the earliest unpaid stages and labels them Overdue, Due now, Due soon, Scheduled, or Planned from their due date and grace status. Rows link to the relevant Villa profile. **Largest outstanding** ranks active villas by unpaid principal plus unpaid interest, and **Customer notes** shows the latest notes for customers linked to the selected scope.
- The layout uses five KPI cards followed by responsive main and attention columns. Tables scroll horizontally on narrow screens, filters stack, and all desktop content collapses into one mobile column with explicit loading, error, and empty states.
- The Dashboard is a read-only derived view, so Zod is not applicable. TanStack Query remains deferred while data is loaded once from the Phase 1 local repository without remote caching or background refresh. Zustand/Redux remains deferred because the linked project and villa filters are local to this route.

## Workspace account menu

- Clicking the chevron beside the signed-in user's name in the desktop sidebar opens an accessible account menu above the profile row. The menu closes on outside click or Escape and exposes a **Logout** command.
- In the Phase 1 mock, Logout returns the user to the login screen. Server-side session revocation remains part of the future authentication integration.

## Notification centre

- The shared header bell opens the Phase 1 in-app notification dropdown. It displays an unread-count badge only when unread items exist and provides grouped notification items, **Mark all read**, loading, error, and empty states. The panel is anchored below the bell on desktop and remains viewport-safe on mobile.
- Notifications are available only to active **Super Admin** and **Editor** users. Staff and View Only users receive no notifications.
- Phase 1 notification events are: payment entering the seven-day pre-due window; payment becoming due; payment becoming overdue after its stage grace period; the agreement final-notice threshold being reached; and a payment being recorded successfully. Rejected-reminder notifications and a complete notification-history page are not included.
- Schedule notifications are deduplicated by notification type, payment stage, and due date. Approaching-payment notifications expire on the due date, due notifications expire when the payment becomes overdue, and overdue and final-notice notifications expire when the stage is settled or its villa programme is cancelled. Payment-recorded notifications expire seven days after creation.
- Clicking a notification marks it as read and opens the related Villa profile or Collections screen. Read state and automatic expiry are persisted through the repository abstraction. Cancelled villas do not generate schedule notifications.
- The Phase 1 localStorage implementation refreshes notifications when the application loads and after repository mutations. It does not provide background processing while the application is closed, cross-device synchronization, browser push, email, or SMS delivery. Those capabilities require the future Supabase authentication, database, realtime, and scheduled-function integration.
- TanStack Query remains deferred because this phase uses local repository data without a server cache or background requests. Zod is not applicable because the notification centre has no form payload. Zustand/Redux remains deferred because dropdown state is local to the shared header.

## Villa payment schedule setup

This addendum updates the Villa Setup and Empty State requirements in the MVP PRD.

- Selecting **Payment schedule** creates the standard eight construction stages: Land Reservation; Land Allocation & Foundation; Concrete, Brickwork & Roof; Plumbing, Electrical & Plastering; Tiling, Doors & Painting; Window & Door Frames; Certificate of Completion; and Landscaping, Title & Handover.
- Default stage names and workspace grace-period days are pre-filled. Due dates and principal amounts remain blank until known.
- Users can add any number of additional payment stages. Each stage has: stage/deliverable, due date, principal amount, and grace-period days.
- During initial villa setup, a payment schedule is saved only when every stage is complete and the principal total equals the villa value.
- Users may continue and create a villa profile with an incomplete or absent schedule. In that case, no schedule records are created.
- The saved villa profile must show the setup checklist with **Payment schedule** incomplete until a valid schedule is added.
- When customer assignment and payment schedule are complete, the setup checklist is not shown.

## Payment schedule editing

- Super Admins and Editors can open **Edit payment schedule** from a villa profile.
- The editor opens as a responsive modal with a fixed action footer, so long schedules remain scrollable while **Cancel** and **Save schedule** stay available.
- Each stage supports a name, due date, principal amount, and optional construction deliverables. The paid-to-date amount is read-only.
- A villa with no schedule starts with the standard eight-stage construction template. Users can add extra project-specific stages.
- The profile editor can save an incomplete schedule so teams can capture known stages before all dates and amounts are available. It remains visibly incomplete and cannot be used for collections until every stage is complete and the stage total equals the villa value. The schedule total cannot exceed the villa value. Stages with recorded payments cannot be removed, and their amount cannot be reduced below the paid-to-date amount.
- A successful save refreshes the profile and shows the standard success alert: **Successfully updated payment schedule.**

## Interest terms editing

- Super Admins and Editors can open **Edit interest terms** from a villa profile.
- The responsive editor pre-fills the villa's saved terms, falling back to workspace defaults when the villa has no overrides.
- Users can enable or disable late-payment interest and configure the monthly rate, grace period, pro-rata divisor, chargeable-day start, reminder days, final-notice day, and collection allocation order.
- Disabling late-payment interest preserves the configured terms for later use but prevents interest from being accrued or allocated to future collections.
- A successful save refreshes the profile and shows the standard success alert: **Successfully updated interest terms.**

## Villa programme controls

- The Villa profile **Settings** tab provides Super Admin villa programme controls for cancellation and permanent deletion. This tab is not shown to Editors or View Only users.
- Cancelling a villa requires a reason. It changes the operational status to **Cancelled**, records the reason in the villa audit notes, stops new collections, and preserves receipts, payment history, documents, and notes.
- Permanently deleting a villa requires a reason and is permitted only when the villa has no financial history. It removes the villa and its non-financial setup records and cannot be undone.
- Both confirmation dialogs keep their action button disabled until a reason is entered and show the standard success alert after the action completes.

## Villa documents and notes

- The Villa profile **Document** tab lists saved links to villa documents and provides an **Add document link** form. The form validates document name, document date, and a valid external URL; no file is uploaded to Juniper.
- The Villa profile **Note** tab contains the dated villa-note timeline and a villa-specific note composer. Notes are visible only on the related villa, require non-empty content, and record the current user and timestamp.
- Super Admin, Editor, and View Only users may add villa notes, matching the Phase 2 role model. Document-management permissions remain available for the later document-link creation flow.
- The current mock implementation uses local React state and the repository layer. TanStack Query, Zod, and Zustand/Redux are intentionally deferred under the decision criteria in `docs/FRONTEND-CHECKLIST.md`.

## Customer management

- The Customers list has responsive customer cards and a New customer form. Customer name, mobile number, and email are required; NIC/passport and address are optional. Creating or editing a customer shows a success alert.
- The Customer profile has Overview and Note tabs. Overview shows aggregated property value, collected, outstanding, and overdue totals; a horizontally scrollable payment-stage progress component drawn from the customer's linked villas; and a summary card for each linked villa.
- The Customer Note tab uses the same timeline and note-composer behavior as the Villa profile. Customer notes are visible only on that customer.
- Add collection from a customer profile preselects and locks the current customer and linked villa. The remaining collection data is completed in the dialog and saved through the standard collection flow.
- Customer and customer-profile collection forms use Zod for client-side multi-field validation. TanStack Query and Zustand/Redux remain deferred because this Phase 1 implementation reads from the local repository without shared remote-cache or cross-route interaction requirements.

## Collections and reminder approvals

- The Collections page lists recorded customer payments with search and project, customer, and status filters. The table horizontally scrolls on smaller screens, while its Action column remains sticky on the right so collection actions stay visible.
- On the **All** tab only, a collection summary is calculated from linked Villa schedules, Villa interest terms, and confirmed collection records using the workspace demo date. It shows confirmed collections received during the current calendar month, unpaid principal due within the next 60 days, overdue unpaid principal after each stage's grace period, and accrued but unpaid interest. Cancelled villas are excluded. The summary is not shown on Reminder approvals.
- Collection creation remains available from a related Villa or Customer profile; the global list CTA is intentionally unavailable until its dedicated creation flow is specified.
- Super Admins can access the **Reminder approvals** tab. It provides an approval queue with search plus month, project, and status filters; status labels; View villa links; and a sticky Review action column.
- Review opens the responsive **Reminder details** modal. A Super Admin can edit the send date, subject, message, and supporting-document filename. **Save as draft** stores the review as Ready to send. **Send now** is enabled only while the send date has not changed; changing it requires Save as draft before the reminder can be sent. Sending records the reminder as Sent and confirms success. Phase 1 stores the selected attachment filename only; document binary storage and email delivery are deferred.
- Cancelling a villa programme cancels its unsent reminder approvals and removes its schedules and collection records from operational Collection and Customer views. Villa profile history remains available for audit.
- The list-only feature uses local React state and repository reads. TanStack Query, Zod, and Zustand/Redux remain deferred because this phase has no mutations or shared remote-cache requirements.

## Reminder preparation and collection recording

- The Collection row action menu provides **Prepare reminder**, **Record payment**, and **View villa**. View villa routes directly to the linked villa profile.
- Prepare reminder pre-fills an active reminder template, proposed send date, subject, and message. A manually selected invoice PDF is required; automatic invoice generation is deferred to Phase 2. Submitting creates an **Awaiting approval** record in the Reminder approvals queue and confirms: **Reminder submitted for approval successfully.** No email is sent at this step.
- Record payment locks the linked customer and villa. It displays the live principal balance, interest due, total payable, and agreement allocation order. The user supplies payment date, amount, method, reference, and a valid external document link. Saving uses the existing oldest-installment payment allocation and confirms: **Payment recorded successfully.**
- In the Phase 1 localStorage mock, payment supporting documents are saved only as external-link metadata. Receipt uploads and durable storage are deferred so the product can remain within the Supabase free-tier constraints; outbound email delivery also requires the Phase 2 messaging integration.

## Workspace settings

- The global **Settings** page is available only to users with workspace-settings permission and uses a responsive left-side section navigator on desktop that becomes horizontally scrollable on smaller screens.
- **Application** allows the company name and date display format to be changed. Currency is fixed to **LKR** and cannot be changed.
- **User access** displays active-user, Super Admin, and disabled-user totals together with the current user list and role/status labels. Super Admins can add, edit, enable, disable, and permanently remove users. Supported roles are **Super Admin**, **Editor**, **Staff**, and **View Only**.
- Adding a user requires a unique valid email address, a full name, a role, and a temporary password of at least eight characters. Editing pre-fills the saved profile and role; entering a replacement temporary password is optional. Temporary passwords are validated but are never stored in the Phase 1 localStorage database.
- Disabled users remain visible in the user list with a muted row, a **Disabled** status, and an **Enable** action. Hovering or focusing Enable explains that the action reactivates the user. Add, edit, enable/disable, and delete actions show the standard success alert.
- Deleting a user requires confirmation and cannot be undone. The signed-in user cannot disable or delete their own account, and the workspace must always retain at least one active Super Admin.
- **Reminder templates** displays reusable Upcoming payment, Payment overdue, Payment received, Final notice, and custom templates in a responsive three-column card layout. Every card exposes Edit, Disable/Enable, and Delete actions, while disabled templates remain visible with a muted state.
- Super Admins can create and edit a template through one pre-filled form. A unique template name, email subject of up to 120 characters, and customer-facing message are required. The form supports `{customer_name}`, `{villa_number}`, `{amount}`, `{due_date}`, and `{company_name}` fields and provides a live email preview.
- New templates are active immediately. Active template names and content are sourced from the shared repository and appear in the Collections **Prepare reminder** selector; disabled or deleted templates are not selectable. Add, edit, enable/disable, and delete actions show the standard success alert, and permanent deletion requires confirmation.
- **Grace periods** manages reusable payment-extension rules. Each rule stores a unique name, a non-negative whole number of days, an optional description, active/disabled status, and whether it is the workspace default. New rules are active immediately; add and edit use the same pre-filled form, and all create, update, enable/disable, and delete actions show the standard success alert.
- Exactly one active grace-period rule remains the default for future payment agreements. Selecting **Use as the default** activates that rule, removes the default designation from the previous rule, and synchronizes its day count with the grace-period field in Interest defaults. Updating Interest defaults synchronizes the selected rule in the opposite direction. These changes never modify existing Villa schedules or agreements.
- Disabled grace periods remain visible and can be re-enabled. A default rule cannot be disabled or permanently deleted until another rule is selected as the default. Deletion requires confirmation and does not affect agreements that already copied the rule's day count.
- **Interest defaults** controls whether late-payment interest is enabled for new agreements and stores the monthly rate, grace period, pro-rata divisor, interest start, first reminder day, second reminder day, final notice day, and collection-allocation order. Saving validates the reminder-day sequence. Existing villas and customers are not changed.
- **Payment schedule** stores a separate default stage list for each project. Each template stage contains a name, optional deliverables, and grace-period days; due dates and principal amounts are intentionally absent because they are entered for each villa. New projects fall back to the standard eight stages: Land Reservation; Land Allocation & Foundation; Concrete, Brickwork & Roof; Plumbing, Electrical & Plastering; Tiling, Doors & Painting; Window & Door Frames; Certificate of Completion; and Landscaping, Title & Handover.
- Project payment-schedule changes apply only when a new villa starts its payment schedule. Existing villa schedules remain unchanged and may be edited only from the related Villa profile.
- Application, user-access, reminder-template, grace-period, interest-default, and project payment-schedule forms use Zod validation and persist through the repository abstraction. TanStack Query remains deferred because the Phase 1 workspace has no remote cache or background refresh. Zustand/Redux remains deferred because dialog and form state is local to the Settings screen.
