# SPEC — Problem 2: Airport Taxi Ride Offers

**Status:** Assigned challenge — implementation target  
**Stack:** Node.js + Express backend; simple browser frontend  
**Priority:** Correct Must-Have end-to-end flow before Good-to-Have features  
**Source statement:** `hackathon_problems/problem-2/hackathon-problem-2-airport-taxi-offers/problem-2-airport-taxi-offers.md`

---

## 1. Product Goal

Build a two-sided airport taxi marketplace:

1. A traveler selects an arriving flight and hotel.
2. The platform shows the route's allowed price range.
3. The traveler posts a ride request with passengers, bags, pickup time, and their price.
4. Only eligible taxi suppliers see the request.
5. Suppliers assign fitting, available cars and their own prices.
6. The traveler books one offer or rejects offers.
7. A booking receives a unique 10-digit reference and survives backend restart.
8. After a flight/pickup change, the booked supplier accepts or rejects a change request.

### Success definition

A complete demo must support:

```text
Traveler posts request
→ Supplier sees request
→ Supplier submits valid offer
→ Invalid car/price is visibly refused
→ Traveler rejects one offer
→ Traveler books another
→ Booking summary opens by 10-digit reference
→ Traveler requests a change
→ Supplier accepts/rejects it
```

---

## 2. Scope Priority

### Must Have — build in this order

1. **M1:** Traveler request + route price range + validation.
2. **M2:** Supplier dashboard showing only serviceable requests.
3. **M3:** Supplier assigns a valid car and price.
4. **M4:** Traveler views, rejects, and books offers.
5. **M5:** Persistent 10-digit booking summary.
6. **M6:** Final no-double-booking check.
7. **M7:** Flight/pickup change request and supplier decision.

### Only after all Must-Haves work

- G1: Several cars from one supplier.
- G2: Requested car type.
- G4: Offer expiry.
- G5: Sort/filter offers.

### Explicit non-goals for the MVP

- Login/passwords
- Payment processing
- Maps or live GPS
- Real taxi APIs
- Simultaneous booking race protection beyond the required sequential recheck
- Shared rides
- AI/LLM calls inside the application

---

## 3. User Roles and Screens

No authentication is required. The landing screen lets the user select:

- **Traveler**
- **Supplier**, followed by a taxi company selector

### Traveler screens

1. Create Ride Request
2. Ride Request Status and Offers
3. Booking Summary / Lookup
4. Submit Change Request

### Supplier screens

1. Supplier Dashboard
2. Request Details + Assign Car
3. Offer Status
4. Pending Change Requests

---

## 4. Architecture

## 4.1 Request flow

```text
Browser form/button
      ↓ fetch()
Express route
      ↓
Input validation
      ↓
Use-case service
      ↓
Reusable rule functions
      ↓
Catalog repository + persistent state repository
      ↓
JSON response
      ↓
Browser renders success or exact rule failure
```

## 4.2 Recommended files

```text
project-root/
├── package.json
├── server.js
├── SPEC.md
├── REVIEW_NOTES.md
├── src/
│   ├── app.js
│   ├── routes/
│   │   ├── catalogRoutes.js
│   │   ├── rideRequestRoutes.js
│   │   ├── supplierRoutes.js
│   │   ├── offerRoutes.js
│   │   └── bookingRoutes.js
│   ├── services/
│   │   ├── rideRequestService.js
│   │   ├── supplierEligibilityService.js
│   │   ├── vehicleAvailabilityService.js
│   │   ├── offerService.js
│   │   ├── bookingService.js
│   │   └── changeRequestService.js
│   ├── rules/
│   │   └── taxiRules.js
│   ├── repositories/
│   │   ├── catalogRepository.js
│   │   └── stateRepository.js
│   └── utils/
│       ├── dates.js
│       └── ids.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── data/                         # Supplied files; read-only
├── storage/
│   └── state.json               # Our writable data
└── tests/
    └── taxiRules.test.js
```

Keep routes thin. A route should read HTTP input, call one service, and send the result. Business rules must not be hidden in browser JavaScript.

## 4.3 Responsibilities

| Module | Responsibility |
|---|---|
| `catalogRepository` | Load flights, hotels, airports, routes, companies, seed requests, and seed bookings |
| `stateRepository` | Save app-created requests, offers, bookings, and changes |
| `rideRequestService` | Join flight/hotel/route, default pickup, validate, save request |
| `supplierEligibilityService` | Determine whether a supplier should see a request |
| `vehicleAvailabilityService` | Check passenger/bag fit and busy-time collision |
| `offerService` | Validate and save supplier car offers; reject offers |
| `bookingService` | Recheck availability, book one offer, close competing offers |
| `changeRequestService` | Create and decide post-booking changes |
| `taxiRules` | Pure reusable rule functions returning explicit reasons |
| `dates` | Local date-time math, service windows, interval overlap |
| `ids` | Stable app IDs and unique 10-digit booking references |

### Critical design rule

**Booking is the consistency boundary.** Even if a car was free when an offer was created, `bookingService` must check it again immediately before saving the booking.

---

## 5. Data Sources

All supplied data is read-only.

| File | Use |
|---|---|
| `data/catalog/flights.json` | Flight arrival airport and local landing time |
| `data/catalog/hotels.json` | Hotel city and area |
| `data/catalog/airports.json` | Verify airport serves hotel city |
| `data/problem-2/routes.json` | Route time, distance, minimum and maximum price |
| `data/problem-2/taxi_companies.json` | Supplier coverage, hours, and vehicles |
| `data/problem-2/open_requests.json` | Three initial supplier-dashboard requests |
| `data/problem-2/booked_rides.json` | Six baseline intervals that already make cars busy |

### Join chain to remember

```text
flight_id → flight.to (arrival airport)
hotel_id  → hotel.city + hotel.area
arrival airport + city + area → route
supplier.airports + supplier.areas → coverage
supplier.vehicles → capacity
vehicle_id + busy interval → availability
```

---

## 6. Persistent State

```json
{
  "rideRequests": [],
  "offers": [],
  "bookings": [],
  "changeRequests": []
}
```

### Restart rule

- Supplied `open_requests.json` records are baseline requests.
- Supplied `booked_rides.json` records are baseline busy intervals.
- App state is loaded from `storage/state.json`.
- Do not copy seed records into state on every restart, or they will duplicate.
- Catalog and app-created records are combined when reading.

### Safe write

Write updated state to a temporary file and rename it to `state.json`. A partially interrupted write must not corrupt all state.

---

## 7. Data Models Created by Our App

## 7.1 Ride request

```json
{
  "requestId": "REQ-1001",
  "flightId": "FL-401",
  "hotelId": "HTL-TYO-004",
  "adults": 2,
  "childAges": [6],
  "largeBags": 3,
  "smallBags": 2,
  "pickupLocal": "2027-04-10T11:30:00",
  "travelerPriceInr": 12000,
  "requestedCarType": null,
  "status": "OPEN",
  "createdAt": "2026-11-13T00:00:00.000Z"
}
```

Derived information such as airport, hotel city/area, drive time, and price range should come from catalog joins rather than untrusted browser input.

## 7.2 Offer

```json
{
  "offerId": "OFF-1001",
  "requestId": "REQ-1001",
  "companyId": "TX-JP-01",
  "vehicleId": "SC-2",
  "priceInr": 12500,
  "status": "OPEN",
  "createdAt": "2026-11-13T00:05:00.000Z"
}
```

Allowed statuses:

```text
OPEN → BOOKED
OPEN → REJECTED
OPEN → NOT_CHOSEN
```

## 7.3 Booking

```json
{
  "reference": "0048172635",
  "requestId": "REQ-1001",
  "offerId": "OFF-1001",
  "companyId": "TX-JP-01",
  "vehicleId": "SC-2",
  "priceInr": 12500,
  "pickupLocal": "2027-04-10T11:30:00",
  "busyFrom": "2027-04-10T11:30:00",
  "busyUntil": "2027-04-10T14:30:00",
  "status": "BOOKED"
}
```

The reference is a string so leading zeroes survive.

## 7.4 Change request

```json
{
  "changeId": "CHG-1001",
  "bookingReference": "0048172635",
  "newFlightId": "FL-402",
  "newPickupLocal": "2027-04-10T13:00:00",
  "status": "PENDING",
  "createdAt": "2026-11-13T00:10:00.000Z",
  "decidedAt": null
}
```

Allowed statuses:

```text
PENDING → ACCEPTED
PENDING → REJECTED
```

---

## 8. Business Rules

## R1 — Valid flight, hotel, and travelers

- Flight and hotel IDs must exist in supplied catalogs.
- Arrival airport is `flight.to`.
- Find the airport record whose `code` is the arrival airport.
- `airport.serves_cities` must contain `hotel.city`.
- `adults` must be an integer of at least 1.
- `childAges` must be an array; every age must be an integer from 0 through 17.
- Passenger count is `adults + childAges.length`.

## R2 — Pickup

```text
earliestPickup = flight.arrival_local + 60 minutes
```

- If pickup is omitted, use `earliestPickup`.
- A pickup exactly 60 minutes after landing is valid.
- An earlier pickup is invalid.

## R3 — Price range

Find one route matching:

```text
route.airport === flight.to
route.city === hotel.city
route.area === hotel.area
```

Both traveler and supplier prices must satisfy:

```text
price_min_inr <= price <= price_max_inr
```

Convert HTTP inputs using `Number(...)`, then reject `NaN`, infinity, non-positive values, and values outside the inclusive range.

## R4 — Supplier visibility

A supplier sees a request only if all are true:

1. `supplier.airports` includes arrival airport.
2. `supplier.areas` contains the exact hotel city and area.
3. Pickup clock time is inside supplier service hours.
4. At least one vehicle fits passengers and both bag counts.
5. At least one fitting vehicle is free for the whole busy interval.

Keep internal failure reasons so the traveler can see why no supplier can serve the request.

## R5 — Car fit

```text
vehicle.seats >= adults + childAges.length
vehicle.large_bags >= largeBags
vehicle.small_bags >= smallBags
```

Check large and small bags separately. Spare small-bag capacity cannot replace large-bag capacity.

## R6 — Car availability

```text
busyFrom  = pickup
busyUntil = pickup + (2 × route.drive_minutes)
```

Two half-open intervals overlap when:

```text
newStart < existingEnd && existingStart < newEnd
```

Therefore:

- `11:00–14:00` and `14:00–16:00` do not overlap.
- `11:00–14:01` and `14:00–16:00` overlap.

Check against both supplied booked rides and app-created bookings.

## R7 — Assign car

Before saving an offer, confirm:

- Request exists and is open.
- Company exists.
- Vehicle belongs to that company.
- Supplier has airport/area/hour coverage.
- Vehicle fits.
- Vehicle is currently free.
- Supplier price is inside the route range.

Return the exact failed reason.

## R8 — Book or reject

- Only an `OPEN` offer can be rejected or booked.
- A rejected offer cannot later be booked.
- Recheck vehicle availability immediately before booking.
- On success, generate a unique 10-digit reference.
- Selected offer becomes `BOOKED`.
- Other open offers for the request become `NOT_CHOSEN`.
- Request becomes `BOOKED`.
- Booked vehicle's interval is now included in future availability checks.

## R9 — Change request

- Only an existing booked ride can receive a change request.
- New flight and/or pickup is stored as `PENDING`; it does not modify the booking yet.
- The booked supplier decides.
- On rejection, keep the booking unchanged.
- On acceptance, revalidate airport/hotel compatibility, pickup +60 rule, route, and same-car availability.
- While testing changed availability, exclude the booking's own old interval to avoid self-conflict.
- Only after all checks pass should the booking be updated and the change marked `ACCEPTED`.

---

## 9. Shared Date/Time Helpers

## 9.1 Service hours

For ordinary hours such as `06:00–23:00`:

```text
start <= current <= end
```

For overnight hours such as `05:00–01:00`:

```text
current >= start OR current <= end
```

Both boundaries are included.

## 9.2 Date-time handling

All relevant arrival, pickup, service, and busy times are local to the arrival location. Do not perform cross-time-zone subtraction for this problem.

Use one helper for adding minutes and one helper for interval overlap. Do not duplicate date logic across services.

---

## 10. Proposed API Contract

All successful responses:

```json
{
  "success": true,
  "data": {}
}
```

All failures:

```json
{
  "success": false,
  "error": {
    "code": "PRICE_OUT_OF_RANGE",
    "message": "Price must be between ₹10,200 and ₹16,800.",
    "details": {
      "minimum": 10200,
      "maximum": 16800
    }
  }
}
```

## 10.1 Catalog and quote

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/catalog/flights` | Return valid arriving flights |
| `GET` | `/api/catalog/hotels` | Return hotels |
| `GET` | `/api/catalog/suppliers` | Supplier role selector |
| `GET` | `/api/routes/quote?flightId=FL-401&hotelId=HTL-TYO-004` | Validate pair and return route/range |

Quote response data:

```json
{
  "airport": "NRT",
  "hotelCity": "Tokyo",
  "hotelArea": "Ueno",
  "driveMinutes": 90,
  "distanceKm": 70,
  "priceMinInr": 10200,
  "priceMaxInr": 16800,
  "landingLocal": "2027-04-10T10:30:00",
  "earliestPickupLocal": "2027-04-10T11:30:00"
}
```

## 10.2 Ride requests

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/ride-requests` | Validate and create request |
| `GET` | `/api/ride-requests/:requestId` | Traveler request details/status |
| `GET` | `/api/ride-requests/:requestId/offers` | Traveler offer list |

Create request body:

```json
{
  "flightId": "FL-401",
  "hotelId": "HTL-TYO-004",
  "adults": 2,
  "childAges": [6],
  "largeBags": 3,
  "smallBags": 2,
  "pickupLocal": "2027-04-10T11:30:00",
  "travelerPriceInr": 12000
}
```

## 10.3 Supplier and offers

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/suppliers/:companyId/requests` | Only currently serviceable open requests |
| `POST` | `/api/ride-requests/:requestId/offers` | Assign one company car and price |
| `PATCH` | `/api/offers/:offerId/reject` | Traveler rejects open offer |

Create offer body:

```json
{
  "companyId": "TX-JP-01",
  "vehicleId": "SC-2",
  "priceInr": 12500
}
```

## 10.4 Booking

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/offers/:offerId/book` | Final availability check and booking |
| `GET` | `/api/bookings/:reference` | Persistent booking summary |

Use `409 Conflict` if a valid open offer cannot now be booked because the car became busy.

## 10.5 Change request

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/bookings/:reference/changes` | Traveler submits pending change |
| `GET` | `/api/suppliers/:companyId/changes` | Supplier sees its pending changes |
| `PATCH` | `/api/change-requests/:changeId` | Supplier accepts/rejects |

Decision body:

```json
{
  "decision": "ACCEPT"
}
```

or

```json
{
  "decision": "REJECT"
}
```

---

## 11. Validation Error Codes

Use stable codes and clear messages:

| Code | Meaning |
|---|---|
| `FLIGHT_NOT_FOUND` | Unknown flight ID |
| `HOTEL_NOT_FOUND` | Unknown hotel ID |
| `AIRPORT_CITY_MISMATCH` | Arrival airport does not serve hotel city |
| `ADULT_REQUIRED` | Fewer than one adult |
| `INVALID_CHILD_AGE` | Child age outside 0–17 or not integer |
| `INVALID_BAG_COUNT` | Negative/non-integer bags |
| `PICKUP_TOO_EARLY` | Pickup before landing +60 minutes |
| `ROUTE_NOT_FOUND` | No airport/city/area route |
| `PRICE_OUT_OF_RANGE` | Traveler or offer price outside inclusive range |
| `SUPPLIER_NOT_ELIGIBLE` | Supplier lacks coverage/hours/free fitting car |
| `VEHICLE_NOT_FOUND` | Unknown car or not owned by supplier |
| `VEHICLE_TOO_SMALL` | Seats or bag capacity insufficient |
| `VEHICLE_BUSY` | Busy interval overlaps another booking |
| `OFFER_NOT_OPEN` | Offer already rejected/booked/not chosen |
| `REQUEST_ALREADY_BOOKED` | Request already has a booking |
| `BOOKING_NOT_FOUND` | Wrong 10-digit reference |
| `CHANGE_NOT_PENDING` | Change already decided |

---

## 12. Manual Test Matrix

| Case | Input | Expected |
|---|---|---|
| Menon happy path | FL-401, HTL-TYO-004, pickup 11:30, 2 adults, child 6, 3 large, 2 small, ₹12,000 | Request created; range ₹10,200–₹16,800 |
| Earliest boundary | Landing 10:30, pickup 11:30 | Accepted |
| Too early | Landing 10:30, pickup 11:29 | `400 PICKUP_TOO_EARLY` |
| Minimum price | ₹10,200 | Accepted |
| Below minimum | ₹10,199 | `400 PRICE_OUT_OF_RANGE` |
| Maximum price | ₹16,800 | Accepted |
| Above maximum | ₹16,801 | `400 PRICE_OUT_OF_RANGE` |
| Missing adult | adults `0` | `400 ADULT_REQUIRED` |
| Child lower boundary | age `0` | Accepted |
| Child upper boundary | age `17` | Accepted |
| Invalid child | age `18` or `-1` | `400 INVALID_CHILD_AGE` |
| Car exactly fits | capacities equal counts | Accepted |
| One bag too many | large bags exceeds car by 1 | `400 VEHICLE_TOO_SMALL` |
| Touching intervals | old ends 14:00, new starts 14:00 | Available |
| True overlap | old ends 14:01, new starts 14:00 | Busy |
| Stale offer | car becomes booked after offer but before Book | `409 VEHICLE_BUSY` |
| Rejected offer | reject then attempt booking | `409 OFFER_NOT_OPEN` |
| Wrong reference | unknown 10 digits | `404 BOOKING_NOT_FOUND` |
| Rejected change | supplier rejects | Original booking remains exactly unchanged |
| Accepted valid change | new pickup satisfies R2 and car is free | Booking interval updated |
| Invalid accepted change | new time overlaps another ride | Refuse acceptance; old booking remains |
| Restart persistence | create booking, restart backend, look up reference | Same summary returned |

---

## 13. Implementation Order

### Phase 1 — Skeleton and data

- Express starts with one command.
- Static frontend is served.
- `/api/health` works.
- Catalog repository loads all seven supplied files.
- Verify expected counts: 11 suppliers, 28 cars, 33 routes, 6 booked rides, 3 open requests, 469 flights, 49 hotels, 10 airports.

### Phase 2 — Pure rules

Implement and test:

- Number/integer validation
- Earliest pickup
- Route lookup
- Price range
- Service-hour window including overnight
- Vehicle fit
- Busy interval
- Interval overlap

### Phase 3 — Traveler request

- Catalog dropdowns
- Quote endpoint
- Request form
- Persistent request creation
- Exact no-supplier reasons

### Phase 4 — Supplier offer

- Supplier selector/dashboard
- Eligible-request filtering
- Vehicle list
- Valid/invalid offer creation

### Phase 5 — Booking

- Traveler offer cards
- Reject action
- Final availability recheck
- 10-digit reference
- Other offer status updates
- Persistent summary/lookup

### Phase 6 — Change request

- Traveler pending change
- Supplier change dashboard
- Accept/reject
- Self-exclusion during availability check
- Old booking preserved on failure/rejection

### Phase 7 — Polish and proof

- Empty/loading/error states
- Demo scenario reset/readiness
- Restart test
- Boundary tests
- README commands and known limitations
- REVIEW_NOTES generated from actual final code

---

## 14. Team Split Without Creating Merge Chaos

### Developer A — backend/rules

- Catalog/state repositories
- Rule helpers
- Traveler request endpoints
- Supplier eligibility
- Offer/booking/change services

### Developer B — frontend/integration

- Role selection
- Traveler form and price range
- Supplier dashboard and offer form
- Traveler offers/booking summary
- Change-request UI

Agree on API bodies in this document before parallel work. Commit small working changes and pull before editing shared files.

---

## 15. Demo Script Target

1. Select Traveler.
2. Choose `FL-401` and `HTL-TYO-004`.
3. Show suggested ₹10,200–₹16,800 range.
4. Enter the Menon details and ₹12,000; post request.
5. Switch to one supplier and show the request.
6. Attempt a car that fails capacity or an invalid price; show exact error.
7. Assign valid cars as two suppliers.
8. Switch to Traveler; reject one offer and book the other.
9. Show the 10-digit reference and summary lookup.
10. Submit a flight/pickup change.
11. Switch to booked supplier; accept it.
12. Show updated booking.

---

## 16. Changed-Requirement Safety

When an organizer announces a changed requirement:

1. Identify which rule/service/state/API/UI is affected.
2. Update this `SPEC.md` first with three bullets.
3. Make the smallest code change possible.
4. Reuse existing rule helpers rather than duplicating logic.
5. Run one happy-path and one edge-case test.
6. Re-run the end-to-end Menon flow if booking logic changed.

Do not rewrite the project to accommodate a small change.

---

## 17. Architecture Pitch Draft

> “We separate immutable catalog data from persistent marketplace state. Thin Express routes call services for ride requests, supplier eligibility, offers, bookings, and changes. Reusable rule helpers own price, capacity, service-hour, and interval checks. Most importantly, booking is our consistency boundary: the backend rechecks the selected vehicle against both supplied and app-created busy intervals before writing the booking and closing competing offers. This keeps the UI simple and makes every rejection explainable.”

---

## 18. Open Item Before Coding

The actual starter codebase must be inspected before finalizing filenames and route placement. Once it is provided, this specification will be mapped to the existing structure rather than rewriting working code.
