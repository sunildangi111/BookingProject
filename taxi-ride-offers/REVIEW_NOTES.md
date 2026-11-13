# REVIEW_NOTES — ArrivalRide Mentor Cheat Sheet

> Generated from the current implementation. Line numbers refer to this exact version and can move after edits. Re-run the file/function search before a mentor session if code changes.

---

# 1. The 60-Second Architecture Pitch (Check-in 1)

> “ArrivalRide is a two-sided airport taxi marketplace built with a vanilla browser client and an Express backend. A traveler chooses a catalog flight and hotel, and the backend joins the arrival airport, hotel city and area, and route record to calculate the earliest pickup, price range, and vehicle busy interval. Supplier eligibility then checks airport coverage, exact hotel area, service hours, passenger seats, large and small bag capacity, requested car type, and availability.
>
> I separated immutable challenge catalogs from our mutable marketplace state. Catalog files are loaded once through `catalogRepository`, while requests, offers, bookings, and change requests are persisted atomically in `storage/state.json`. Thin routes only translate HTTP input and output; services own workflows, and shared pure rule/date helpers prevent duplicated logic.
>
> The important consistency boundary is booking. An offer does not reserve a car, so when the traveler clicks Book, `bookingService` checks the car again against supplied booked rides and app-created bookings. Changes use the same checks and exclude the booking’s old interval so it does not conflict with itself. Stable error codes make every refusal explainable in the UI and easy to test.”

## Request flow to point at on screen

```text
public/app.js fetch()
  → src/routes/*.js
  → src/services/*.js
  → src/rules/taxiRules.js + src/utils/dates.js
  → catalogRepository (read only) + stateRepository (persistent writes)
  → JSON response
  → frontend renders success or exact failure
```

## Four phrases that sound senior but are true

- **“Booking is the consistency boundary.”** The car is rechecked at confirmation because an earlier offer can become stale.
- **“Catalog and transactional state have separate ownership.”** Supplied JSON is immutable; only our state file is written.
- **“The interval is half-open.”** `[start, end)` means a ride ending at 14:00 does not collide with one starting at 14:00.
- **“Changes use copy/validate/commit behavior.”** Current booking values remain untouched until an accepted proposal passes all checks.

---

# 2. File & Function Cheat Sheet

## 2.1 Startup and Express application

| File / line | Function or block | What it does | Variables to point at |
|---|---|---|---|
| `server.js:1–18` | Server startup / `shutdown()` | Binds Express to `0.0.0.0`, prints the port, and closes cleanly on SIGTERM/SIGINT | `port`, `host`, `server` |
| `src/app.js:15–16` | Middleware | Hides Express signature and parses JSON up to 250 KB | `express.json()` |
| `src/app.js:18–34` | `GET /api/health` | Shows catalog and mutable-state counts | `state`, `catalogRepository.getStats()` |
| `src/app.js:36–40` | Route registration | Mounts all route modules below `/api` | `catalogRoutes`, `bookingRoutes` |
| `src/app.js:42–51` | API 404 | Returns stable JSON rather than an HTML page | `req.method`, `req.originalUrl` |
| `src/app.js:53–60` | Static frontend | Serves `public/` and SPA fallback | `publicDirectory` |
| `src/app.js:62–94` | Error middleware | Converts invalid JSON, known `AppError`, and unexpected errors into consistent responses | `error.status`, `error.code`, `error.details` |

## 2.2 Every API route

All route paths below receive the `/api` prefix from `src/app.js`.

| File / line | Route | Purpose | Important input |
|---|---|---|---|
| `src/app.js:18` | `GET /api/health` | Runtime/catalog/state health | None |
| `src/routes/catalogRoutes.js:21` | `GET /api/catalog/bootstrap` | One frontend bootstrap containing flights, hotels, airports, suppliers, and car types | None |
| `src/routes/catalogRoutes.js:35` | `GET /api/catalog/flights` | Relevant arrival flights, optionally filtered by airport | `req.query.airport` |
| `src/routes/catalogRoutes.js:43` | `GET /api/catalog/hotels` | Hotels, optionally limited to cities served by an airport | `req.query.airport` |
| `src/routes/catalogRoutes.js:51` | `GET /api/catalog/suppliers` | Supplier selector and fleet details | None |
| `src/routes/catalogRoutes.js:58` | `GET /api/routes/quote` | Validates flight/hotel pair and returns route range + earliest pickup | `req.query.flightId`, `req.query.hotelId` |
| `src/routes/rideRequestRoutes.js:8` | `POST /api/ride-requests` | Creates a validated persistent traveler request | `req.body` |
| `src/routes/rideRequestRoutes.js:13` | `GET /api/ride-requests/:requestId/offers` | Traveler request plus every supplier offer | `req.params.requestId` |
| `src/routes/rideRequestRoutes.js:19` | `GET /api/ride-requests/:requestId/eligibility` | Eligible supplier count and exact unavailable reasons | `req.params.requestId` |
| `src/routes/rideRequestRoutes.js:24` | `GET /api/ride-requests/:requestId` | Reloads one request after refresh | `req.params.requestId` |
| `src/routes/supplierRoutes.js:9` | `GET /api/suppliers/:companyId/dashboard` | Serviceable requests, supplier offers, and changes in one response | `req.params.companyId` |
| `src/routes/supplierRoutes.js:14` | `GET /api/suppliers/:companyId/requests` | Serviceable request list only | `req.params.companyId` |
| `src/routes/supplierRoutes.js:25` | `GET /api/suppliers/:companyId/offers` | Supplier’s offer history | `req.params.companyId` |
| `src/routes/supplierRoutes.js:30` | `GET /api/suppliers/:companyId/changes` | Supplier’s pending/decided change requests | `req.params.companyId` |
| `src/routes/offerRoutes.js:7` | `POST /api/ride-requests/:requestId/offers` | Validates and saves a supplier car/price offer | `requestId`, `company_id`, `vehicle_id`, `price_inr` |
| `src/routes/offerRoutes.js:12` | `PATCH /api/offers/:offerId/reject` | Makes an open offer permanently rejected | `req.params.offerId` |
| `src/routes/bookingRoutes.js:8` | `POST /api/offers/:offerId/book` | Rechecks vehicle, creates reference, closes competitors | `req.params.offerId` |
| `src/routes/bookingRoutes.js:13` | `GET /api/bookings/:reference` | Persistent complete ride summary | `req.params.reference` |
| `src/routes/bookingRoutes.js:18` | `POST /api/bookings/:reference/changes` | Creates one pending flight/pickup proposal | `new_flight_id`, `new_pickup` |
| `src/routes/bookingRoutes.js:23` | `PATCH /api/change-requests/:changeId` | Supplier accepts or rejects proposal | `decision`, `company_id` |

### Express values to remember

- `req.params.requestId` comes from the `:requestId` URL segment.
- `req.query.flightId` comes after `?` and is always a string.
- `req.body` is the parsed JSON body.
- A numeric HTTP value can arrive as a string, so validation deliberately calls `Number(value)` before checking `Number.isInteger(...)`.

## 2.3 Repository functions

### `src/repositories/catalogRepository.js`

| Line | Function | Plain-English meaning | Key variables |
|---:|---|---|---|
| 7 | `readJson()` | Reads one supplied file at startup | `relativePath`, `absolutePath` |
| 12 | `deepFreeze()` | Prevents accidental in-memory mutation of catalog objects | `value` |
| 39 | `getAirport()` | Finds airport by IATA code | `airportByCode`, `code` |
| 43 | `getFlight()` | Finds one dated flight by stable ID | `flightById`, `flightId` |
| 47 | `getHotel()` | Finds a hotel by ID | `hotelById`, `hotelId` |
| 51 | `getCompany()` | Finds a supplier by company ID | `companyById`, `companyId` |
| 55 | `getVehicle()` | Proves a car belongs to the selected supplier | `company.vehicles`, `.find()` |
| 60 | `getRoute()` | Joins arrival airport + hotel city + exact area | `airport`, `city`, `area` |
| 68 | `listHotelsForAirport()` | Filters hotels to cities listed in `serves_cities` | `airport.serves_cities`, `.filter()` |
| 77 | `countVehicles()` | Totals nested supplier fleets | `.reduce()` |
| 81 | `getStats()` | Returns expected data counts for health/debugging | `arrivalFlights.length` |

### `src/repositories/stateRepository.js`

| Line | Function | Plain-English meaning | Key variables |
|---:|---|---|---|
| 9 | `clone()` | Gives callers a copy so they cannot mutate live state accidentally | `JSON.parse/stringify` |
| 13 | `seedRideRequests()` | Converts the three supplied requests into persistent `OPEN` records | `status`, `source` |
| 23 | `defaultState()` | Defines arrays and ID counters | `ride_requests`, `offers`, `bookings`, `change_requests` |
| 38 | `normalizeState()` | Repairs missing arrays and adds missing seeds once | `alreadyLoaded` |
| 59 | `atomicWrite()` | Writes temp file, then renames it to avoid half-written JSON | `temporaryFile`, `renameSync` |
| 66 | `loadState()` | Loads restart-safe state or creates the first file | `STATE_FILE`, `parsed` |
| 87 | `read()` | Returns a safe state snapshot | `currentState` |
| 91 | `mutate()` | Copy → mutate → atomic write → commit | `draft`, `mutator`, `result` |
| 99 | `reset()` | Restores only the three supplied open requests | `defaultState()` |
| 106 | `getStateFilePath()` | Exposes path for diagnostics | `STATE_FILE` |

## 2.4 Core service functions

### `src/services/rideContextService.js`

| Line | Function | What it proves/calculates | Variables to point at |
|---:|---|---|---|
| 9 | `buildRideContext()` | Central join for flight, hotel, airport, route, earliest pickup, busy interval, passengers | `flight.to`, `hotel.city`, `route`, `earliestPickup`, `busyUntil` |

Read these lines aloud:

- Lines 24–35: airport `serves_cities` must contain hotel city.
- Lines 37–44: route is exact airport + city + area.
- Lines 46–50: landing + 60, with optional later pickup.
- Lines 60–70: rejects earlier pickup.
- Line 72: car is busy for `2 × drive_minutes`.

### `src/services/rideRequestService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 20 | `pick()` | Accepts snake_case or camelCase API bodies | `snakeCase`, `camelCase` |
| 24 | `publicFlight()` | Returns only frontend-safe/useful flight fields | `flight` |
| 39 | `publicHotel()` | Returns useful hotel fields | `hotel` |
| 50 | `normalizeCreateInput()` | Converts strings to validated integers, ages, enum, and money | `adults`, `parsedChildAges`, `price` |
| 93 | `getRequestFromState()` | Finds request or returns 404 | `.find()`, `requestId` |
| 103 | `enrichRequest()` | Adds flight, hotel, route, pickup, passenger, and busy facts | `context` |
| 127 | `quote()` | Builds a temporary request to validate a flight/hotel pair | `temporaryRequest`, `context.route` |
| 155 | `createRideRequest()` | Validate → range check → persistent create → supplier summary | `input`, `priceFailure`, `stateRepository.mutate()` |
| 187 | `summarizeEligibility()` | Keeps eligibility response concise | `eligible_count`, `reasons` |
| 204 | `getRideRequest()` | Reloads one enriched request | `requestId` |
| 209 | `getRideRequestWithEligibility()` | Request plus current marketplace eligibility | `state`, `marketplaceEligibility()` |
| 218 | `listRideRequests()` | Enriches every state request | `.map(enrichRequest)` |

### `src/services/supplierEligibilityService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 11 | `vehicleOption()` | Combines car fit and current busy-time result | `fitFailures`, `availability` |
| 39 | `checkSupplierForRequest()` | R4 aggregate check and list of eligible vehicles | `coverageFailures`, `vehicleOptions`, `freeFittingVehicles` |
| 81 | `checkSpecificVehicle()` | Validates the exact selected car at offer/book/change time | `company`, `vehicle`, `state` |
| 93 | `marketplaceEligibility()` | Runs supplier check across all 11 companies | `.map()`, `.filter()` |
| 104 | `supplierDashboard()` | Shows only `OPEN` requests that this supplier can serve | `.filter(request.status)`, `.filter(eligibility.eligible)` |

### `src/services/vehicleAvailabilityService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 4 | `getBusyIntervals()` | Combines six baseline rides with app-created bookings | `baseline`, `appBookings`, `excludeBookingReference` |
| 33 | `checkVehicleAvailability()` | Finds the first overlapping busy interval | `blockingInterval`, `intervalsOverlap()` |

### `src/services/offerService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 10 | `enrichOffer()` | Adds supplier/rating and vehicle details | `company`, `vehicle` |
| 24 | `createOffer()` | Validates open request, ownership, car, range, duplicate, then saves | `companyId`, `vehicleId`, `selection`, `priceFailure` |
| 112 | `listRequestOffers()` | Traveler offers sorted cheapest first | `.filter()`, `.sort()` |
| 121 | `listSupplierOffers()` | Supplier history newest first | `created_at` |
| 135 | `rejectOffer()` | Only `OPEN` can become `REJECTED` | `offer.status` |

### `src/services/bookingService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 8 | `getBookingFromState()` | Looks up the exact 10-digit string | `String(reference)`, `.find()` |
| 20 | `createBooking()` | Final consistency transaction | `offer`, `request`, `selection`, `bookingReference` |
| 109 | `getBookingSummary()` | Joins booking with traveler, flight, hotel, supplier, car, changes | `booking`, `changes` |

Inside `createBooking()` point to:

- Lines 26–41: state-machine guards.
- Lines 53–61: final car recheck.
- Lines 64–66: collision-checked 10-digit string.
- Lines 91–100: selected offer → `BOOKED`; other open offers → `NOT_CHOSEN`.

### `src/services/changeRequestService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 12 | `createChangeRequest()` | Validates proposal and saves it without changing booking | `newFlightId`, `newPickup`, `candidate`, `PENDING` |
| 88 | `enrichChange()` | Adds current/proposed flight display data | `currentFlight`, `proposedFlight` |
| 98 | `listSupplierChanges()` | Returns only changes for booked supplier | `companyId`, `.filter()` |
| 123 | `decideChange()` | Reject leaves old booking; accept rechecks and commits | `decision`, `excludeBookingReference`, `selection` |

Important line: `excludeBookingReference` at lines 170–172 prevents the changed booking from colliding with its own old interval.

### `src/services/supplierService.js`

| Line | Function | Meaning | Key variables |
|---:|---|---|---|
| 7 | `getSupplierDashboard()` | Combines serviceable requests, offer history, changes, and four counts | `dashboard`, `offers`, `changes`, `stats` |

## 2.5 Rule and utility functions

### `src/rules/taxiRules.js`

| Line | Function | Rule |
|---:|---|---|
| 3 | `ruleFailure()` | Standard `{code, message, details}` object |
| 7 | `priceRangeFailure()` | Inclusive route min/max and whole positive INR |
| 31 | `vehicleFitFailures()` | Requested type, passengers, large bags, and small bags independently |
| 70 | `supplierCoverageFailures()` | Airport, exact city/area, and service hours |

### `src/utils/dates.js`

| Line | Function | Meaning |
|---:|---|---|
| 4 | `normalizeLocalDateTime()` | Strictly validates and adds seconds |
| 30 | `localDateTimeToMs()` | Converts a local-neutral value into comparable milliseconds |
| 35 | `addMinutesLocal()` | Adds pickup buffer/drive time |
| 44 | `clockToMinutes()` | Converts `HH:MM` to minutes after midnight |
| 63 | `clockMinutesFromLocalDateTime()` | Extracts pickup clock time |
| 72 | `isWithinServiceHours()` | Handles normal and past-midnight service windows |
| 88 | `intervalsOverlap()` | Half-open overlap: `aStart < bEnd && bStart < aEnd` |
| 101 | `isAtOrAfter()` | Inclusive pickup boundary |

### `src/utils/validation.js`

| Line | Function | Meaning |
|---:|---|---|
| 3 | `requiredString()` | Rejects null/undefined/blank IDs |
| 11 | `optionalString()` | Converts blank optional input to `null` |
| 19 | `integer()` | Uses `Number(value)` then integer/min/max guards |
| 34 | `wholeMoney()` | Positive safe whole INR amount |
| 47 | `childAges()` | Array where every child is integer 0–17 |
| 63 | `enumValue()` | Uppercases and validates car type/decision |

### `src/utils/ids.js`

| Line | Function | Meaning |
|---:|---|---|
| 3 | `nextEntityId()` | Persistent counters such as `REQ-1001` |
| 16 | `uniqueBookingReference()` | Random 10-digit string with collision retry |

### `src/utils/errors.js`

| Line | Function | Meaning |
|---:|---|---|
| 11 | `badRequest()` | 400 invalid input/rule |
| 15 | `notFound()` | 404 unknown ID/reference |
| 19 | `conflict()` | 409 state changed or action no longer allowed |
| 23 | `routeHandler()` | Sends thrown sync/async errors to Express middleware |

## 2.6 Frontend function map (`public/app.js`)

### API, formatting, and navigation

| Line | Function | Purpose |
|---:|---|---|
| 71 | `api()` | Shared fetch wrapper; throws structured `ApiError` |
| 105 | `escapeHtml()` | Prevents user/catalog text becoming HTML |
| 114 | `formatInr()` | Indian currency display |
| 122 | `formatLocal()` | Displays supplied local time without timezone shifting |
| 133 | `formatDateOnly()` | Friendly local arrival date |
| 143 | `flightLabel()` | Dropdown label |
| 147 | `statusClass()` | Maps state to CSS badge |
| 151 | `setLoading()` | Disables action and shows spinner |
| 165/170 | `showInlineError()` / `clearInlineError()` | Form feedback |
| 175 | `showToast()` | Global success/error feedback |
| 187 | `switchView()` | Traveler/Supplier/Booking role tabs |
| 207 | `checkHealth()` | Green backend indicator |
| 221 | `loadCatalog()` | One bootstrap fetch |

### Traveler flow

| Line | Function | Purpose |
|---:|---|---|
| 227 | `populateFlights()` | Renders 240 relevant arrivals |
| 246 | `selectedFlight()` | Current catalog object |
| 250 | `filterHotelsForFlight()` | Uses airport `serves_cities` |
| 272 | `renderEmptyQuote()` | Initial quote state |
| 278 | `updateQuote()` | Fetches route range and earliest pickup |
| 309 | `renderChildAgeFields()` | One age input per child |
| 322 | `getChildAges()` | Builds request age array |
| 326 | `loadMenonDemo()` | Fills example only; backend still validates dynamically |
| 345 | `submitTravelerForm()` | POST request and opens tracker |
| 377 | `trackRequest()` | Opens request by ID |
| 391 | `loadTravelerWorkspace()` | Refreshes eligibility + offers |
| 406 | `renderRequestSummary()` | Timeline facts and status |
| 438 | `renderEligibility()` | Eligible names or exact no-supplier reasons |
| 461 | `renderOffers()` | Client sort/filter + action cards |
| 505 | `handleOfferAction()` | Reject or final Book request |

### Supplier flow

| Line | Function | Purpose |
|---:|---|---|
| 234 | `populateSuppliers()` | Role selector |
| 545 | `loadSupplierDashboard()` | Fetches current company dashboard |
| 565 | `renderSupplierEmpty()` | No-company state |
| 573 | `renderSupplierDashboard()` | Identity, stats, three dashboard sections |
| 601 | `renderSupplierRequests()` | Request details + every valid/invalid car option |
| 639 | `renderSupplierChanges()` | Pending decision cards |
| 663 | `renderSupplierOffers()` | Offer status history |
| 677 | `submitSupplierOffer()` | POST selected car/price |
| 708 | `decideSupplierChange()` | PATCH ACCEPT/REJECT |

### Booking flow

| Line | Function | Purpose |
|---:|---|---|
| 729 | `lookupBooking()` | Opens 10-digit reference |
| 745 | `renderBookingSummary()` | Ticket, change form, change history |
| 801 | `submitBookingChange()` | Creates pending proposal |
| 832 | `bindEvents()` | Connects static and delegated UI events |
| 860 | `initialize()` | Binds, loads health/catalog, restores local tracker IDs |

---

# 3. “Why Did You Do It This Way?” — Design Choices

## Choice 1 — Immutable catalog vs. mutable state

**Answer:** “The challenge data is authoritative and judges reuse it, so I freeze and only read it through `catalogRepository`. User-generated requests, offers, bookings, and changes have a different lifecycle and live in our state repository. That separation prevents accidental catalog corruption and makes restart persistence clear.”

## Choice 2 — One shared eligibility path

**Answer:** “Airport coverage, area, service hours, fit, car type, and availability are reused for the supplier dashboard, offer creation, final booking, and accepted changes. This avoids a dangerous situation where the UI says a car is valid but booking applies different rules.”

## Choice 3 — Recheck at booking rather than reserve at offer time

**Answer:** “The requirements allow one car to be offered to multiple requests. An offer is therefore only a proposal. The Book operation is the consistency boundary and checks all baseline and app bookings again. If the car became busy, it returns 409 instead of double-booking.”

## Choice 4 — Atomic JSON persistence

**Answer:** “For a sequential laptop demo, JSON is simpler and faster than database setup. I still write a temporary file and rename it, which reduces corruption risk. The repository is isolated, so replacing it with SQLite would not change route or rule code.”

## Choice 5 — Half-open intervals

**Answer:** “I model busy time as `[start, end)`. That matches the statement: one ride ending at 14:00 does not overlap another starting at 14:00. The exact expression is `newStart < existingEnd && existingStart < newEnd`.”

## Choice 6 — Stable error codes plus human messages

**Answer:** “A code such as `PICKUP_TOO_EARLY` is reliable for tests/UI behavior, while the message tells the user the actual earliest pickup. This is better than returning a generic invalid request.”

---

# 4. Top 5 Predicted Live-Coding Changes (Check-in 2)

> These are predicted mentor tweaks, not current requirements. Use the stated insertion point and make only the surgical change.

## Change 1 — Increase arrival buffer from 60 to 90 minutes

**Target:** `src/services/rideContextService.js`, above `buildRideContext()` and around lines 46–48.

```js
// Store the changed requirement in one named constant.
const MIN_PICKUP_DELAY_MINUTES = 90;
// Calculate the first legal pickup from that constant.
const earliestPickup = addMinutesLocal(landing, MIN_PICKUP_DELAY_MINUTES);
// Keep the displayed reason synchronized with the calculation.
const pickupRuleText = `Pickup must be at least ${MIN_PICKUP_DELAY_MINUTES} minutes after landing.`;
```

Also replace the hard-coded message at line 63 with `pickupRuleText`.

**Verification:** landing 10:30 → 12:00 accepted; 11:59 rejected.

## Change 2 — Supplier price cannot exceed traveler price

**Target:** `src/services/offerService.js`, after the existing route price check around lines 75–78.

```js
// Compare the supplier offer against the traveler's stated price.
if (price > request.price_inr) {
// Refuse the new offer with a clear client error.
  throw badRequest('ABOVE_TRAVELER_PRICE', 'Supplier price cannot exceed the traveler price.');
// End the new guard block.
}
```

**Verification:** traveler ₹12,000 → offer ₹12,000 accepted; ₹12,001 rejected.

## Change 3 — Sort supplier requests by earliest pickup

**Target:** `src/services/supplierEligibilityService.js`, in `supplierDashboard()` after the eligibility filter.

```js
// Put the most urgent serviceable pickup first.
requests.sort((first, second) => {
// Compare canonical local timestamps lexicographically.
  return first.request.pickup.localeCompare(second.request.pickup);
// End the sort callback.
});
```

If keeping the existing chained expression, assign it to `const requests` before returning.

**Verification:** a 09:00 request appears above an 11:30 request.

## Change 4 — Require at least a 4.2 supplier rating

**Target:** `src/services/supplierEligibilityService.js`, immediately after `const context = buildRideContext(request);` inside `checkSupplierForRequest()`.

```js
// Define the changed minimum supplier quality threshold.
const minimumRating = 4.2;
// Detect a company below that threshold.
if (company.rating < minimumRating) {
// Return a rule-shaped reason that the UI can explain.
  return { company, eligible: false, failures: [ruleFailure('RATING_TOO_LOW', 'Supplier rating is below 4.2.')], vehicle_options: [], eligible_vehicles: [], context };
// End the rating guard.
}
```

A cleaner final implementation would add the rating failure to `aggregateFailures`, but the guard is easy to type live.

**Verification:** 4.2 passes; 4.1 fails.

## Change 5 — Limit each supplier to one open offer per request

**Target:** `src/services/offerService.js`, before the existing duplicate-car check around lines 86–98.

```js
// Find any open offer from this supplier for this request.
const existingCompanyOffer = state.offers.find((offer) => offer.request_id === requestId && offer.company_id === companyId && offer.status === 'OPEN');
// Stop a second open company offer under the changed rule.
if (existingCompanyOffer) {
// Return conflict because valid state already exists.
  throw conflict('COMPANY_OFFER_EXISTS', 'This supplier already has an open offer for the request.');
// End the duplicate-company guard.
}
```

**Verification:** first company offer succeeds; second car from same company returns 409.

---

# 5. Testing & Edge-Case Script (Check-in 3)

## Spoken testing explanation

> “I test inclusive boundaries and the value immediately outside each boundary. I keep the highest-risk rules as pure functions, then run one complete API workflow. The suite currently has 13 passing tests. I also manually tested the browser flow from Menon request through invalid car, valid offer, booking, pending change, and accepted change.”

## Test 1 — Pickup boundary

**Happy boundary:** exactly 60 minutes after landing.

```json
{
  "flight_id": "FL-401",
  "hotel_id": "HTL-TYO-004",
  "adults": 2,
  "child_ages": [6],
  "large_bags": 3,
  "small_bags": 2,
  "pickup": "2027-04-10T11:30",
  "price_inr": 12000
}
```

Expected: `201`.

**Broken boundary:** change pickup to `2027-04-10T11:29`.

Expected: `400 PICKUP_TOO_EARLY`, with earliest pickup `11:30`.

## Test 2 — Inclusive route price

Menon range is ₹10,200–₹16,800.

- `10200` → accepted.
- `16800` → accepted.
- `10199` → `PRICE_OUT_OF_RANGE`.
- `16801` → `PRICE_OUT_OF_RANGE`.
- `0` or `-1` → `INVALID_PRICE`, before range comparison.

Talking point: “Zero is not below-range business data; it is invalid money input, so validation fails earlier and more specifically.”

## Test 3 — Express string coercion

Express query/body values can be strings. Current IDs such as:

```text
/api/routes/quote?flightId=FL-401&hotelId=HTL-TYO-004
```

must remain strings because they are stable text IDs.

For a numeric query introduced later, such as `?maxPrice=12000`, use:

```js
// Convert the Express query string into a number.
const maxPrice = Number(req.query.maxPrice);
// Reject NaN, infinity, decimals, zero, and negatives.
if (!Number.isSafeInteger(maxPrice) || maxPrice <= 0) {
// Return a client error instead of silently coercing bad input.
  return res.status(400).json({ success: false, error: { code: 'INVALID_MAX_PRICE' } });
// End the validation guard.
}
```

Never write only `if (req.query.maxPrice < 0)` because JavaScript coercion can hide invalid text.

## Test 4 — Busy interval boundary

Baseline:

```text
Existing: 11:00–14:00
Candidate A: 14:00–16:00 → allowed
Candidate B: 13:59–16:00 → overlap/refused
```

Exact rule in `src/utils/dates.js:88`:

```text
firstStart < secondEnd AND secondStart < firstEnd
```

## Test 5 — Car capacity and independent bag sizes

Menon needs 3 seats, 3 large bags, and 2 small bags.

- `SC-3`: 6 seats, 4 large, 3 small → valid.
- `SC-1`: 4 seats, 2 large, 2 small → invalid large-bag capacity.

Talking point: “Extra small-bag capacity cannot replace missing large-bag capacity because the problem explicitly checks each separately.”

## Test 6 — Child age boundaries

- Age `0` → valid child and one passenger seat.
- Age `17` → valid child and one passenger seat.
- Age `-1` → `INVALID_CHILD_AGE`.
- Age `18` → `INVALID_CHILD_AGE`.
- Missing age when child count is one → form/backend refusal.

## Test 7 — Stale offer / final recheck

1. Supplier offers a currently free car.
2. Another request books that car for the overlapping interval.
3. First traveler tries to book the stale offer.
4. Expected: `409 VEHICLE_BUSY`; no second booking is written.

Talking point: “That is why booking is the consistency boundary.”

## Test 8 — Rejected change preserves old booking

1. Record original flight and pickup.
2. Send new pickup.
3. Supplier rejects.
4. Reload 10-digit reference.
5. Expected: original flight, pickup, and busy interval are byte-for-byte unchanged; history shows `REJECTED`.

## Commands to prove it

```bash
npm test
npm run reset
npm start
```

Expected automated result: **13 tests, 13 pass, 0 fail**.

---

# Fast Mentor Q&A

**Why JSON instead of a database?**  
Sequential correctness is explicitly sufficient. The repository abstraction and atomic writes give restart persistence without spending hackathon time on migrations. SQLite can replace it later.

**Why can one car have multiple open offers?**  
An offer is not a booking. The car is consumed only at final Book; that is why stale offers are rechecked.

**Why no timezone conversion?**  
The supplied flight arrival, pickup, supplier hours, and ride intervals are all local to the arrival location. We compare local-neutral values only within that location.

**Why exclude the current booking during a change?**  
Without exclusion, the proposed interval would collide with its own old interval and every valid change could be falsely refused.

**What survives restart?**  
Requests, offers, bookings, offer statuses, and change requests in `storage/state.json`. Catalog data remains supplied and read-only.

**What happens after one offer is booked?**  
Selected offer → `BOOKED`; other open offers → `NOT_CHOSEN`; request → `BOOKED`; car interval joins availability checks.

**What is not implemented?**  
Real auth/payment/GPS, offer expiry, shared rides, and database-level simultaneous race locking. None is required for Must-Haves.
