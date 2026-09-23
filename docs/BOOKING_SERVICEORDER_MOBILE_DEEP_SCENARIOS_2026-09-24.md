# FixHome Mobile — Deep scenario audit: Customer ↔ Technician Booking → ServiceOrder

Date: 2026-09-24 early ICT. Project `fixhome-sep`. Supersedes **coverage**, not historic evidence, of first-pass 51-row Mobile audit checkpoint185. Read `CURRENT_STATE.md`, `NEXT.md`, checkpoint185 and the two Mobile docs before implementation. **READ-ONLY audit:** this document does not modify app/Backend/shared DB or prove E2E. User may do work alone or recruit *one* additional developer; NO task owner has yet been assigned. Geo-area-code Backend bug belongs to another teammate; only track Mobile contract/retest, do not duplicate that fix.

## 0. Source/baseline/claim discipline

- Mobile personal worktree `C:/Users/anhev/orca/workspaces/mobile/nguyenanh-booking-mobile-api`, branch `foxonworld/booking-mobile-serviceorder-20260922`, local HEAD `1f6c64a` when checked, `git status` CLEAN, source checkpoint `b54f0c2`, baseline `6a640f6`; no remote push/PR/merge. Native device and authenticated complete 2-role E2E NOT VERIFIED. Backend *source* checked at local `dev` commit `21646da` under `Fixhome-task/dev-main-smoke-20260923/backend`; source may change as teammates work. Canonical docs inspected: `docs/docs/FIXHOME-Master-Project-Specification-v1.4.md` §§7,8.6–8.9,8.15–8.23,9; user-approved newer exact **two** ordered technician User UUIDs supersedes older v1.4 max-five text, latest Backend invitation implementation confirms exactly two. Do not infer all Backend team changes since source snapshot.
- Labels: **F** directly confirmed by code/route and expected UI code flow; **G** concrete missing/unwired caller or legacy mock; **R** condition/bug candidate derived by comparing source; **U** needs actual test (do not call PASS); **P** owner/team/provider policy or access approval; **D** dependency on teammate (geo). Severity is execution priority, not proof of a live failure. A single line may contain several labels.
- Test evidence from prior checkpoint: 29 Jest suites/762 tests, typecheck and Expo PASS before doc commits; full `expo lint --max-warnings=0` FAIL 4 resolver import errors in `CustomerHomeScreen`, `TechnicianKycScreen`, `TechnicianProfileScreen`, `chat-socket.service` at that snapshot. Unit tests ≠ phone, payment, provider, multi-role, E2E or 62-file cross-slice independent source review. No new run in this audit. No invented completion %.
- Source anchors: Mobile `src/screens/customer/{CustomerServicesScreen,CustomerServiceDetailScreen,CustomerBookingCreateScreen,CustomerMatchingScreen,CustomerBookingsScreen,CustomerOrderDetailScreen,CustomerReviewScreen}.tsx`, `src/screens/technician/{TechnicianInvitationsScreen,TechnicianJobsScreen,TechnicianOrderDetailScreen,TechnicianNotificationsScreen}.tsx`; `src/utils/booking-candidate-selection.ts`, `src/screens/customer/customer-bookings-history.ts`, `src/navigation/AppNavigator.tsx`, `src/api/{bookings,orders,messaging,services}.api.ts`, backend `src/modules/bookings/{bookings.service,invitations.service,bookings.controller}.ts`, `src/modules/service-orders/{service-orders.service,service-orders.controller}.ts`, `src/modules/messaging/messaging.service.ts`. Exact source version matters; recheck before implementation.

## 1. Findings the first audit needed to correct/add

| ID | Priority/status | Evidence-based finding | What to do / test |
|---|---|---|---|
| NEW-01 | P0 **F/G** | Customer `CustomerServicesScreen.tsx` uses hard-coded `getAllServices` IDs `1...`, `CustomerServiceDetailScreen.tsx` shows fixed service/price; real create form uses catalog UUID. Home→service→detail→diagnosis→form does not carry selected real ID. | Replace catalog/detail with API-backed IDs; preserve optional AI/manual route; assert each selected service reaches real Booking exactly once. Do not confuse *listed nonbinding labor price*, FIXED_PRICE fixed catalog price and official quotation. |
| NEW-02 | P0 **R/F** | **Replacement/rematch seam:** Backend `service-orders.service.ts#cancel` for Technician withdrawal pre-arrival may retain existing ServiceOrder, end active assignment and set Booking `MATCHING`; backend `bookings.service.ts#reschedule` similarly retains ServiceOrder and may rematch. `bookings.service.ts#findOne` exposes `serviceOrderId` even if no assignment. Mobile `canChooseTechnicians()` rejects **any** `serviceOrderId`; `CustomerMatchingScreen.tsx` treats MATCHING/serviceOrderId as waiting, `customer-bookings-history.ts#bookingResumeTarget` rejects every linked Booking. | Reproduce with pre-arrival withdrawal→remaining candidate declines/expires→Booking CLOSED but old ServiceOrder still linked; customer may be unable to reopen candidate selection despite server `invitations.service.ts#createShortlist` allowing existing ACCEPTED/EN_ROUTE order with **no active assignment**. Need contract for active assignment/replacement; don't simply remove `serviceOrderId` gate or create a second ServiceOrder. Add production-helper and 2-role E2E tests. This is source-derived **risk**, not observed UI failure yet. |
| NEW-03 | P0 **F/G** | Backend `POST /bookings/:id/matching/extend` allows at most one customer-confirmed extension of a valid **live** invitation group, constrained by arrival window. Mobile `bookings.api.ts`/screens have no caller or extension CTA. | Decide whether UX must surface the feature, show eligibility/actual expiry, one-time confirmation and 409/stale handling; do not blindly extend after expiry or past arrival time. |
| NEW-04 | P1 **F/G** | Backend `POST /bookings/:id/rebook` creates a **new Booking** from history; Mobile booking/history screens have no rebook caller/CTA. | Add repeat service/date/address review only if in MVP; never mutate original Booking or reuse old private-media access. |
| NEW-05 | P0 **F** | Master Spec v1.4 §8.6 **explicitly prohibits unrestricted chat before Booking submit**; two-way Booking-linked chat starts when invitation becomes PENDING (not just Accept); accepted thread follows ServiceOrder; loser threads become read-only. Backend `MessagingService.ensureConversation()` runs on activation. Previous audit ambiguously called pre-booking chat policy TBD; that was misleading. `D-07` older summary wording conflicts with §8.6 detailed CHAT-BR-01: use latest approved decision and escalate only genuine unresolved precedence. | Audit navigation/chat entry on both roles, active-vs-standby visibility, read-only loser/history and stale cached conversation IDs. Do not add pre-Booking free chat merely because a tab exists. |
| NEW-06 | P0 **F/G** | `CustomerReviewScreen.tsx#handleSubmit` only shows Alert success; does **not** call `ordersApi.submitReview`. Old `CustomerUnderRepairScreen.tsx` links to `CustomerCompleted` without Backend transition; registered demo routes must not be presented as real progress. | Remove from real navigation or bind to real ServiceOrder status/IDs; no fake success/completion, no accidental user route/deep-link. |
| NEW-07 | P0 **F/G** | Actual `ordersApi.confirmCompletion` and `payInvoice` exist, but no Mobile screen caller; Tech completion CTA is `__DEV__`-only. Backend request creates UNPAID invoice; Customer confirmation and verified PAID are separate conditions for COMPLETED. | Create distinct milestones/CTA and source-gated release story; Finance/provider owner to approve actual payment/cash. No `completeRepair()` bypass or client-set PAID. |
| NEW-08 | P1 **F/R** | `AppNavigator.tsx` registers Customer and Technician stack screens in **both** signed-in tech and guest/customer branches. Screen-local auth gates and Backend permissions reduce damage but navigation topology itself is not role-exclusive. | Negative tests direct/deep-link to opposite-role screen while guest, sign-out while detail open, session swap/restore. Server RBAC remains authority; don't claim proven data leak. |
| NEW-09 | P1 **F/G** | Mobile form date offsets `[0,1,2,3]`, start times 09/10/13/14/15/16, fixed 2-hour window, `quantity:1`,`urgency:NORMAL`; no user choice for alternate future dates, schedule, quantity or urgency despite DTO support. | Confirm MVP constraints with owner (do not invent 24/7 selection); avoid creating Booking before address/service/time is validated. Clock/timezone/day-boundary/DST test, no unintended past booking. |
| NEW-10 | P1 **F/U** | `CustomerMatching` uses initial `useEffect` GET then **manual** refresh; on Match success it prints selectable ServiceOrder ID but has no immediate order-detail CTA. Inbox ACCEPT goes to `TechnicianMain`, not immediately to newly returned order detail. | Test background→foreground/refocus, push deep-link, stale state, direct real serviceOrderId CTA and focus refresh. |
| NEW-11 | P1 **F/G** | `TechnicianNotificationsScreen.tsx` has static cards, `CustomerNotificationsScreen` GET but no verified order/Booking navigation. Chat list/thread exists separately without Booking/Order CTA cross-link checked. | Verify event-to-entity routing, unread/read, pending invitation activation, quote/cost decision and losing-thread read-only. Coordinate with messaging/notification owner. |
| NEW-12 | P1 **D/G** | Old saved addresses permit blank/placeholder/legacy district code; another developer handles Backend normalization. Mobile create form lists address without preflight service-area error; Expo Web map intentionally inert, unlike native. | Await Backend contract; Mobile show *why* address is unusable with recovery; existing test Booking snapshot won't auto-refresh on address edit. Test valid/invalid area/alias before new Booking; don't silently map whole district to one ward. |
| NEW-13 | P0 **R/U** | **Declined/expired/cancelled chat lifecycle needs Backend owner review.** Backend `MessagingService.ensureConversation()` creates ACTIVE conversation on PENDING; `MessagingService.loadWritable()` checks participant+ACTIVE status, not current invitation/assignment for every send. `InvitationsService.respond(DECLINE)`, invitation expiration and `BookingService.cancelBooking()` do not visibly set that conversation READ_ONLY; only `MessagingService.attachToServiceOrder()` sets losing chats READ_ONLY when **someone ACCEPTS**. A declined/expired tech might retain an ACTIVE thread between replacement activation and winner ACCEPT, or indefinitely when no one accepts. | Verify policy with Messaging owner; add read-only integration tests for DECLINE, EXPIRED, Booking CANCEL, Tech pre-arrival WITHDRAW, replacement and race between send vs invitation state. Do not claim a proven live privacy incident or silently modify another module. Mobile must not show/send old thread when official access ends; Backend remains authority. |

## 2. Scenario matrix: every major lifecycle state and branch (100 cases, not infinite combinations)

Format: `case — trigger → expected behavior; source state / test gate`. 'Expected' from current Backend/spec where verified; when not verified label U/P explicitly. Cases marked **G** need UI implementation; **U** means run actual scenario before calling done.

### A. Discovery, address and create (A01–A14)

| ID | Trigger / expected UI + backend invariant | Assessment |
|---|---|---|
| A01 | Guest browses catalog: only real public services/price type, Booking protected by Customer sign-in. | G/F; catalog old static, test guest routes U. |
| A02 | Customer chooses catalog service then returns/enters AI: selected catalog UUID survives service detail→AI(optional)→Booking form; manual override possible. | G/U; real form supports catalog, entry path broken. |
| A03 | AI fails/denied/empty recommendation: user can still choose a manual service; no automatic Booking. | F/U. |
| A04 | AI photo preview selected: image is NOT Booking private evidence until separate upload successful/authorized. | F/G/U; Booking photo UI missing. |
| A05 | Customer has zero saved addresses: form offers safe create/edit route without losing draft, not a dead end. | G/U. |
| A06 | Saved address uses placeholders or lacks canonical service-area code: reject before Booking with specific repair action; never treat display strings as codes. | G/D/U. |
| A07 | Address at province/district alias vs current ward code: no mismatched candidate filtering; backend source teammate handles normalization, Mobile reacts to contract. | D/U. |
| A08 | Address outside service coverage: distinguish *valid address, no eligible thợ* from invalid address and network error. | G/U. |
| A09 | Customer edits/deletes address AFTER Booking: old Booking snapshot remains immutable unless explicit authorized reschedule/address-change flow. | F/U; do not silently rewrite historical Booking. |
| A10 | Service unpublished/deactivated/price changed while form open: submit must revalidate catalog and show changed data; no false quote/fee. | U; backend authoritative, no on-wire QA. |
| A11 | Date today already passed or crosses timezone/day boundary; preferredStartAt<preferredEndAt/future; window within accepted business rules. | F/U; limited 4 day/2h UI needs policy check. |
| A12 | Customer changes quantity/urgency or wants >4 days: UI currently hardcodes 1/NORMAL and 4-day presets; decide scope and show honest constraints. | G/P. |
| A13 | Double tap create / timeout after DB commit / app killed or reopened: one Booking only; find actual existing Booking before retry, never duplicate blind POST. | F per-screen lock, U across restarts/multiple devices. |
| A14 | `createBooking` returns 401/403/404/409/422/500/network or malformed success envelope: no false success; draft preserved or safe recovery with explicit status. | U; generic error copy today. |

### B. Candidate, invitations, matching and chat (B01–B21)

| ID | Trigger / expected behavior | Assessment |
|---|---|---|
| B01 | Booking `SUBMITTED` with valid future window: GET candidates matches service, ward/area, availability, verified skill, schedule and dues. | F/U; geo fix D. |
| B02 | Candidates `200 []`: show distinct valid-no-coverage vs bad-code vs no-shift vs suspended/no-availability; don't advise indefinite refresh. | G/U; API may not expose reason, need contract. |
| B03 | Only 0 or 1 eligible candidate: exactly-two requirement blocks shortlist; provide change time/address/service, cancel or support route. | F/G/U. |
| B04 | Two+ eligible: select distinct technician **User UUIDs**, reorder/remove, 3rd blocked; display listed labor price, typical warranty (reference) if permitted. | F/G/U; price/warranty card missing. |
| B05 | Candidate becomes unavailable/suspended between GET and POST: Backend rechecks; UI reads error, refetches candidates, does not send stale invitation. | F Backend/U Mobile. |
| B06 | Double tap shortlist / request timeout / app background or crash: one live invitation group, no blind replay; GET actual round status before another attempt. | F controller/session; U multi-device/restart. |
| B07 | After shortlist: Booking `MATCHING`, #1 PENDING, #2 STANDBY invisible to #2; customer sees truthful order/expiry; do not claim ServiceOrder exists. | F Backend, G customer timeline, U E2E. |
| B08 | #1 ACCEPT before expiry: exactly one ServiceOrder + active assignment; other pending/standby cancelled; Customer/Tech land on *real* order detail. | F Backend, G CTA, U E2E. |
| B09 | #1 DECLINE while #2 still eligible: activate #2; no strike merely for declining invitation. | F Backend/U two-role. |
| B10 | #1 expires at boundary while #2 standby: GET refresh advances queue; expired #1 cannot accept; client removes stale card. | F Backend/U time. |
| B11 | #1 and #2 both decline/expire: Booking becomes CLOSED; customer gets actionable reselect/rebook/cancel rather than endless waiting. | F Backend, G/U recovery UX. |
| B12 | Customer sees `CLOSED` but preferredEndAt passed: cannot re-shortlist stale arrival window; reschedule/create new Booking via approved path. | F mobile canChoose/U. |
| B13 | Customer confirms **one** live invitation-group extension when allowed: GET and visible TTL change once; disallow second, after expiry, or invalid arrival-window extension. | G/F Backend/U. |
| B14 | Customer edits description without moving window in active MATCHING round: keep same invitation and expiry; new description visibility matches Backend. | F Backend, G Mobile reschedule UI, U. |
| B15 | Customer truly reschedules during PENDING/STANDBY: Backend cancels old invitations/rematches when allowed; both devices drop stale notification and reload. | F Backend, G Mobile UI, U. |
| B16 | Technician ACCEPT and customer CANCEL concurrently: only one authoritative outcome, no second ServiceOrder, both screens reconcile via GET. | F Backend transaction design, U race E2E. |
| B17 | Two clients/devices for same Tech ACCEPT same invitation: allow idempotent still-assigned winner only; losing/old Tech sees no new private data. | F Backend, U concurrent on wire. |
| B18 | Chat before Booking vs after PENDING: **no unrestricted pre-Booking chat**; active invited technician can chat through Booking-bound conversation, standby/uninvited cannot; only official action changes schedule/quote. | F Backend/spec; G Mobile booking→chat deep-link, U. |
| B19 | After Accept, winner thread follows ServiceOrder; loser thread becomes read-only; after replacement, old technician cannot message/see private media. | F Backend intent; U historic/read-only E2E, possible replacement integration. |
| B20 | Push notification/deep-link arrives on logged-out/other-role/expired/matched Booking: navigate only after auth+GET, never expose wrong account/old ID. | G/U; navigation both roles registered. |
| B21 | Tech DECLINE, invite EXPIRES, Customer CANCEL, or Tech WITHDRAWS while conversation is ACTIVE but there is not yet an accepted replacement: old actor must not gain new conversation privileges beyond approved scope; BE must confirm whether/when thread becomes READ_ONLY. | **R/U** NEW-13, Messaging owner policy/Backend test; don't rely on Mobile hiding the chat as authorization. |

### C. Assignment, arrival, schedule and cancellation (C01–C13)

| ID | Trigger / expected behavior | Assessment |
|---|---|---|
| C01 | Tech ACCEPT returns real serviceOrderId but app shows stale Jobs/Home: focus refetch and direct detail link, never placeholder ID. | G/U; route currently TechnicianMain first. |
| C02 | Customer matching becomes MATCHED: one tap opens ServiceOrder detail, no obsolete TechFound/Tracking mock and no extra customer confirmation of technician. | G/U. |
| C03 | Tech EN_ROUTE once: Backend state changes and Customer sees it; repeated/stale tap no false transition. | F/U. |
| C04 | Tech CANCEL/withdraw pre-arrival: keep existing ServiceOrder, end assignment, continue next invitation candidate when available; customer sees matching/replacement status. | F Backend; G UI, U. |
| C05 | Replacement candidate also fails and old ServiceOrder exists: Customer must be able to reselect when server permits; do not block merely because `serviceOrderId` is non-null. | **R/P0** source seam NEW-02, add RED regression and E2E. |
| C06 | Customer reschedules after Accept but before repair, same Tech still available: same ServiceOrder and assignment, new scheduledAt visible both roles. | F Backend, G Mobile UI, U. |
| C07 | Customer reschedules after Accept, Tech unavailable: unassign, rematch in same ServiceOrder; avoid second order and leaked old assignment data. | F Backend, G Mobile UI, U. |
| C08 | Customer reschedules after UNDER_REPAIR or an incompatible state: reject with clear reason, preserve old order/time. | F Backend, G UI, U. |
| C09 | Tech arrives without foreground GPS permission/location services: clear denial/retry/help route, no fabricated check-in. | F controller intent, U Android/iPhone. |
| C10 | GPS returns LOW_ACCURACY/OUT_OF_GEOFENCE (even HTTP200): BEFORE evidence/start repair remain locked; manual exception via SM if policy permits. | F Backend/client intent, U native. |
| C11 | GPS VALID, then user moves app to background or loses connection: verify stored arrival; do not reuse stale lat/lng or enable wrong order actions. | U. |
| C12 | Customer cancels before valid arrival vs after valid arrival: different Backend/SM path, no immediate fake refund/strike. | G/U; BE cancel service has different gates. |
| C13 | Tech cancels AFTER VALID check-in or when UNDER_REPAIR: Backend asks SM exception; UI must surface contact/dispute case, not show generic success. | F Backend, G UI, U. |

### D. Evidence, quote, parts and additional cost (D01–D18)

| ID | Trigger / expected behavior | Assessment |
|---|---|---|
| D01 | BEFORE photo before valid check-in or while not EN_ROUTE: no POST; Backend rejects if bypassed. | F/U. |
| D02 | AFTER/ADDITIONAL photo before UNDER_REPAIR or after completion requested: no POST; disabled UI and server validation. | F/U. |
| D03 | Camera permission denied/limited; image picker canceled; file size=0/>10MB, MIME unsupported or no size: descriptive error without upload. | F controller/U native. |
| D04 | Provider returns 503, upload timeout, response has `storage://` private ref: no expose private ref, reconcile via fresh authorized signed GET; no blind duplicate upload. | F controller/U real provider. |
| D05 | Signed photo URL expired on background/refocus, account switch or old assignment: refetch; no old customer's photo in new session. | F per-order controls/U real E2E. |
| D06 | Fixed-price service: show immutable catalog service subtotal/scope snapshot, allow start repair only with valid arrival/BEFORE; don't force inappropriate quote. | F Backend, U. |
| D07 | Inspection-required service: quote with valid labor lines+tech part lines, quantity/price/source/warranty; Customer can inspect all line items. | F/U. |
| D08 | Quote invalid negative/zero/overflow/duplicate/unknown part or forged warranty options: client rejects or Backend validates; no silent monetary mutation. | F controller test earlier, U API negative cases. |
| D09 | Tech offers FIXHOME-supplied part: only approved catalog price/warranty; confirm pickup/received/used vs unused; current Mobile editor supports tech parts, not complete FixHome Parts UI. | G/P/U. |
| D10 | Tech external part defaults NO_WARRANTY; paid warranty explicit customer opt-in with fee+term; not equal to labor warranty. | F source/P specs, U quote round-trip. |
| D11 | Customer APPROVE quote: verified server APPROVED, price/parts/warranty snapshots; separate from payment; start-repair gate opens only if all other requirements pass. | F/U. |
| D12 | Customer REJECT official quote: **whole ServiceOrder** closes under current Backend behavior; Tech cannot continue working and UI explains consequence before confirm. | F/U. |
| D13 | Quote sent but Customer leaves app/offline; Tech resubmits newer quote/SUPERSEDED: old quote CTA must disable, no decision on stale quote ID. | F controller guard, U concurrent E2E. |
| D14 | Additional cost while UNDER_REPAIR: only authorized tech, reason+item lines, fresh TTL; does not increase final due until Customer APPROVE. | F labor-only, G parts, U. |
| D15 | Customer APPROVE pending labor-only cost before expiry: only that request adds server-derived delta, not immediate payment. | F/U. |
| D16 | Customer REJECT additional cost: only the proposal is rejected, **base ServiceOrder remains UNDER_REPAIR**; Tech can continue base scope or escalate if impossible. | F/U; distinguish quote reject. |
| D17 | Cost request expires/cancelled/revised/part warranty changes while detail cached: stale buttons disappear, one-off read-back, no infinite retry on 409/422. | F controller subset, G revise/parts policy, U. |
| D18 | Start repair tap twice/timeout before server response: no duplicate status history/replay; fresh same-order GET required to unlock retries; reject if unapproved quote/pending cost/BEFORE missing. | F source/test guards, U backend on-wire. |

### E. Completion, invoicing, payment and finance (E01–E17)

| ID | Trigger / expected behavior | Assessment |
|---|---|---|
| E01 | Tech cannot request completion before UNDER_REPAIR, BEFORE/AFTER minimum, approved quote if required, or while unresolved SENT quote/PENDING cost. | F Backend/client intent, U. |
| E02 | Tech uploads AFTER, completion note optional according to current DTO; customer/tech sees authoritative evidence count. Current Mobile requestCompletion passes **no note**. | F/G/P; confirm desired MVP note requirement. |
| E03 | Tech taps request completion twice/after timeout/app restart: one completionRequestedAt and one UNPAID invoice, no duplicate; release currently `__DEV__`-gated CTA. | F backend transaction/client, U E2E across restart and release plan P. |
| E04 | Invoice not yet created: GET returns null; render 'Chưa có hóa đơn', not 0đ/PAID. | F/U. |
| E05 | Invoice generated: labor+parts+paid-warranty totals and 10% labor commission snapshot are server-derived; no client calculation/charge. | F Backend/U finance source/protocol. |
| E06 | Customer sees AFTER photos, actual invoice, Tech request time and explicit separate 'Nghiệm thu' control; current Mobile has no confirm CTA. | G/U. |
| E07 | Customer confirms once, with allowed feedback/rating/signature if approved; this **does not collect money or mark PAID**. | F Backend, G screen, P optional UX, U. |
| E08 | Customer disputes 'chưa sửa xong'/declines acceptance: no automatic confirmation/completion; determine SM exception/response UX with team. | P/G; Backend confirm is positive action, refusal policy not inferred. |
| E09 | Online invoice payment initiation 409 duplicate/503 provider off/redirect cancelled/pending or callback delayed: no fake paid screen; read server payment after webhook verification. | G/P/U. |
| E10 | Online payment succeeds but Customer confirmation absent (or reversed order): remains not COMPLETED until **both** predicates are true; verify order+invoice PAID. | F Backend/U provider. |
| E11 | Provider webhook duplicate/failed/replayed/mismatched amount: Backend finance owner must prove idempotency; Mobile only reflects authoritative final state. | P/U no provider E2E. |
| E12 | Cash Technician DECLARE vs Customer CONFIRM vs Customer DISPUTE: distinct states, amount evidence, mismatch and timeout; never auto-confirm silently. | F BE/spec concept, G Mobile, P/U finance/SM. |
| E13 | Cash pending, one side offline, Manager resolution: keep pending until audited confirmation; never force PAID from timer or local UI. | P/G/U. |
| E14 | Tech PlatformDue unpaid blocks new invitation but not login/history/payment access; detail explains reason without exposing finances to unrelated users. | F spec/eligibility, G UI, U. |
| E15 | At finalization, warranty coverage must follow invoice item source/paid option and start date from Backend; client may display only server-issued coverage. | F Backend/P/U. |
| E16 | Invoice already PAID vs already customer-confirmed after app resume: show correct pending/completed milestone, don't allow duplicate 'confirm' or payment order creation. | G/U; all combinations needed. |
| E17 | Tech request-completion visible in dev only but absent in production: release must not ship an impossible lifecycle; require owner-approved release UX + complete finance validation before enabling. | F/P release blocker. |

### F. After service, help, privacy and recovery (F01–F18)

| ID | Trigger / expected behavior | Assessment |
|---|---|---|
| F01 | ServiceOrder `COMPLETED` from Backend: both actors see correct summary, not a demo route that advances status on tap. | G/U. |
| F02 | Customer review only actual completed owned ServiceOrder, submit once, handle already-reviewed/conflict, no prefilled fake text/success Alert. | G/F old demo, U. |
| F03 | Rating optionally recorded at customer confirmation vs unique post-job review: decide authoritative UX to avoid two rating signals. | P/G/U. |
| F04 | Warranty labor vs FixHome part vs paid technician part: only eligible coverage, provider, date/term known; new unrelated issue requires new paid quote if approved. | G/P/U. |
| F05 | Claim submission after coverage expired, wrong owner/tech replacement or unapproved part: deny safely and offer SM support; don't promise free labor by default. | G/P/U. |
| F06 | Cancel Booking before assignment vs cancel ServiceOrder after ACCEPT vs cancel during repair: different entities/statuses/reasons/permissions/SM; no one generic 'hủy' endpoint. | F Backend, G Mobile, U. |
| F07 | Tech declines invite (no strike) vs withdraws after ACCEPT (possible audit/rematch) vs after-arrival exception: distinct copy and events, never auto-penalize mere decline. | F Backend/spec, G UI, U. |
| F08 | App signed out while order detail/preview/chat/media cached: purge old private data and disable pending action; subsequent different user never sees old content. | F source guards subset, U runtime/global nav. |
| F09 | Guest or Customer deep-links to TechnicianMain/Tech detail or vice versa: screen guard and Backend RBAC must both deny; `AppNavigator` currently registers opposite-role screens. | R/U; no proven server leak. |
| F10 | Old Tech replaced/assignment ended: historical view sanitized, private address/phone/photo/chat disabled, pending POST cannot execute with old token/session. | F guards, U two-actor E2E. |
| F11 | 401/403/404/409/422/500/503 per screen and per action: error describes wrong role/deleted/stale/validation/provider failure and safe next action. | U; some generic copies G. |
| F12 | Full offline, slow network, process crash during create/shortlist/accept/photo/quote/cost/completion/payment: verify authoritative server once before any replay; no duplicate invoice/order/charge. | U; single-screen source guards insufficient for cross-device/restart. |
| F13 | Device clock wrong, midnight/daylight shift, timezone, expired invitation/quote/cost and stale signed URLs: server timestamps authoritative, show local times clearly. | U. |
| F14 | Customer/Tech Home, History, Jobs, Notifications, Chat all show consistent order ID/status after each transition, including focus/restart and paginated >20 rows. | G/U. |
| F15 | Web/Expo Web/native parity: Chrome map placeholder cannot choose location; sessionStorage vs native SecureStore; GPS/photo/push need Android+iPhone dev build checks. | F/U. |
| F16 | Provider configuration missing (photo/payment/location/chat) returns explicit temporary error, no fake photo stored, no fallback to private `storage://` reference or fake PAID. | U/P. |
| F17 | Historical/sanitized GET may return 200 with summary rather than 403: Tech detail must not interpret as full active order or show private actions. | F helper/U. |
| F18 | Accessibility/localization/long names, tiny viewport, screen readers, disabled/loading controls, modal back, tap targets, navigation history and payment return URLs; no accidental second POST. | U design/device QA, not proven blocker by source alone. |

### Counting caveat

The intended finite matrix is A14+B21+C13+D18+E17+F18 = **101 scenarios** (14+21+13+18+17+18); verify headings and IDs programmatically before reporting this count. Case IDs are unique by section; phase IDs Cxx here are not the same as first-pass audit `Cxx` Customer IDs. This is a systematic **test-plan inventory**, not proof that 100 tests ran or that no other corner case exists. New API/business decisions, additional roles, payment providers or updated Backend source require new cases.

## 3. Minimal invariants / release gate

1. Only Backend transitions Booking/ServiceOrder/Invoice/Payment; client never creates fake ServiceOrder on shortlist or fake COMPLETED on request/confirmation.
2. Customer sends exactly two distinct ordered tech User UUIDs; backend rechecks eligibility and invitations, one active assignment and one ServiceOrder per Booking even on replacement.
3. **Replacement seam NEW-02** must be resolved and proven on source+E2E before calling matching complete; normal shortlist source tests do not cover it.
4. Every write is bound to current authenticated actor, active focused real entity, allowed state, server-confirmed result; retry on ambiguous result must be safe across refresh/restart and where relevant multiple devices.
5. Chat only Booking-linked once invitation activated, only winner remains writable after ACCEPT, role/old-tech privacy enforced; chat never updates official schedule/quote/status.
6. Pricing source/parts/warranty amount must be server-backed, labor commission snapshot current approved 10% rule; no old fixed-fee/deposit/wallet model from superseded project memory.
7. Dev-only completion cannot count as shippable Mobile lifecycle; finalization requires request+customer confirmation+verified invoice/order PAID; cash is an audited alternative, never auto-confirmed.
8. A scenario is DONE only with source implementation + focused regression + independent review + real QA evidence for the relevant risk; PAYMENT/GPS/PHOTO need provider/native validation and owner gates.

## 4. Immediate audit remediation backlog (without writing app code)

- **P0-1:** Resolve NEW-02 replacement/rematch booking link mismatch with a bounded source-backed RED case using current backend contract. Do not shortcut by deleting `serviceOrderId` from Booking or creating another ServiceOrder.
- **P0-2:** Confirm role navigation/deep-link matrix, source-only paths into demo screens and NEW-13 decline/expiry/cancel conversation write permissions with Messaging owner; forbid fake Review/Completed actions. Preserve teammate AI/chat work.
- **P0-3:** One documented two-account state trace from valid Booking → one ACCEPT → Tech execution → UNPAID invoice; do not use bogus geo fixtures. Finance tests separate.
- **P0-4:** Plan distinct Customer confirm vs payment/cash vs COMPLETED and Technician completion release gate. Finance/provider owner must review; don't implement payment by guessing.
- **P1-1:** Add extend invitation and rebook decisions/CTA as bounded tickets; customer cancel/reschedule/recovery, empty candidates, status notifications/deep links, chat policy §8.6 explicit.
- **P1-2:** Test Android/iPhone camera/GPS/native sessions; Chrome cannot verify these. Geo bug is owned by other teammate, track handoff only.

## 5. How to execute with one developer or one additional developer

**No staffing decision has been made.** `docs/BOOKING_SERVICEORDER_MOBILE_TASK_BOARD_2026-09-23.md` contains 10 candidate tasks for flexible assignment, not a demand for 10 developers. Two workable modes:

| Mode | Sequence / role boundary | Shared-file safety |
|---|---|---|
| **Only user** | 1) independent cumulative review + fix NEW-02; 2) catalog/Booking/CTA+cancel/reschedule/replacement; 3) 2-account matching→execution E2E; 4) customer confirmation + finance-owner payment/cash gate; 5) review/warranty/notifications/native QA; 6) PRs in dependency order. Can reuse Codex/OpenCode one writer + separate read-only reviewer but don't duplicate agents. | One writer at a time, source checkpoint `b54f0c2` remains reachable; reviewable commits/PRs, no `main` writes. |
| **User + 1 dev** | **User = integrator/Tech+shared ServiceOrder lifecycle** (`AppNavigator`, `orders.api.ts`, both OrderDetail screens, existing Tech execution, reconciliation/release). **Dev2 = Customer discovery + pre-accept Booking UX** (catalog/detail service, customer booking create/matching/history, owner-specific controllers/tests/negative matrix). Both start with same approved base when shared; Dev2 first delivers read-only audit+spec, then independent branch for nonshared files. User integrates shared route/API changes after code review; later dev2 may take review/warranty UI when Booking merged and owner releases files. | No concurrent writes to shared `AppNavigator.tsx`, `orders.api.ts`, `bookings.api.ts`, `CustomerOrderDetailScreen.tsx`, `TechnicianOrderDetailScreen.tsx`. If Dev2 needs them, submit contract/patch request to user as integrator; do not edit those files in parallel. Need approve branch availability before remote push. |

For either mode, first produce dependency graph, source baseline + single-actor owner per file, cumulative review of local WIP `6a640f6..b54f0c2`, and integration QA. **No push/PR/merge/deploy is implied by audit or this plan.** Existing Backend geo fix belongs to teammate; Finance/SM/Chat ownership may remain external even if only one Mobile dev. Never consume reset/extra allowance to bypass model quota.
