# ArrivalRide — Airport Taxi Ride Offers

A complete Node.js + Express implementation of **HackCellence Problem 2**. Travelers post flight-aware airport taxi requests, eligible suppliers assign fitting cars, and the backend prevents invalid prices and double bookings.

## Quick start

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm test          # Run rule and end-to-end API tests
npm run reset     # Restore the three supplied open requests and clear app state
npm run dev       # Restart automatically while editing backend files
```

## Demo shortcut

1. Open **Traveler** and click **Load Menon demo**.
2. Post the request. Copy its request ID.
3. Open **Supplier**, choose **Sakura Cabs**, and find the new request.
4. Try `SC-1` to demonstrate a rejected car (insufficient large-bag capacity).
5. Offer `SC-3` at an in-range price.
6. Return to **Traveler**, refresh offers, and book it.
7. The app opens the persistent 10-digit booking summary.
8. Send a changed pickup time.
9. Return to Sakura Cabs and accept or reject the pending change.

Run `npm run reset` before a fresh judged demo.

## Must-Have coverage

| Requirement | Implementation |
|---|---|
| M1 Ride request | Catalog flight/hotel inputs, suggested route range, default pickup, R1–R3 validation |
| M2 Supplier dashboard | Shows only requests where the supplier has airport/area/hour coverage and at least one fitting free car |
| M3 Assign a car | Revalidates company ownership, coverage, capacity, bags, type, availability, and price |
| M4 Book or reject | Traveler sees every offer; rejected offers stay rejected; booking closes competing offers |
| M5 Booking summary | Unique 10-digit string lookup persisted in `storage/state.json` |
| M6 No double booking | Final availability recheck against supplied and app-created busy intervals |
| M7 Flight change | Pending change workflow with supplier accept/reject and same-car revalidation |

The app also supports several cars per supplier, optional requested car type, and traveler offer sorting/filtering.

## Architecture

```text
Browser (public/app.js)
        ↓ fetch JSON
Thin Express routes (src/routes)
        ↓
Use-case services (src/services)
        ↓
Pure rules + date helpers
        ↓
Read-only catalog repository + writable state repository
```

### Key design decisions

- **Immutable catalogs:** all seven supplied data files remain unchanged.
- **Persistent marketplace state:** requests, offers, bookings, and changes use an atomic JSON-file write.
- **Single business-rule path:** supplier dashboard, offer creation, booking, and change acceptance reuse the same coverage/fit/availability checks.
- **Booking consistency boundary:** availability is checked again when Book is clicked, because an offer can become stale.
- **Half-open intervals:** a ride ending at 14:00 does not conflict with one starting at 14:00.
- **Local neutral date math:** all compared taxi timestamps are local to the arrival location, so no cross-time-zone conversion is needed.

## Important files

```text
server.js                                   Starts the HTTP server
src/app.js                                  Express setup and error responses
src/repositories/catalogRepository.js       Reads supplied JSON only
src/repositories/stateRepository.js         Atomic persistent app state
src/services/rideContextService.js          Joins flight, hotel, airport, route, and timing
src/services/supplierEligibilityService.js  R4/R5/R6 checks
src/services/offerService.js                Supplier car offers
src/services/bookingService.js              Final recheck and 10-digit booking
src/services/changeRequestService.js        Pending/accepted/rejected changes
src/rules/taxiRules.js                      Price, fit, and coverage rules
src/utils/dates.js                          Service windows and busy overlap
public/                                     Responsive single-page interface
tests/                                      Boundary and end-to-end API tests
```

## API summary

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Runtime and record counts |
| GET | `/api/catalog/bootstrap` | Frontend flights, hotels, suppliers, airports |
| GET | `/api/routes/quote?flightId=...&hotelId=...` | Suggested range and earliest pickup |
| POST | `/api/ride-requests` | Create a validated traveler request |
| GET | `/api/ride-requests/:id/eligibility` | Request plus eligible/unavailable suppliers |
| GET | `/api/ride-requests/:id/offers` | Traveler's offer list |
| GET | `/api/suppliers/:id/dashboard` | Serviceable requests, offers, and changes |
| POST | `/api/ride-requests/:id/offers` | Supplier assigns car and price |
| PATCH | `/api/offers/:id/reject` | Traveler rejects an offer |
| POST | `/api/offers/:id/book` | Final recheck and booking |
| GET | `/api/bookings/:reference` | Persistent summary |
| POST | `/api/bookings/:reference/changes` | Traveler sends a change |
| PATCH | `/api/change-requests/:id` | Supplier accepts/rejects |

Success responses use:

```json
{ "success": true, "data": {} }
```

Failures use stable codes:

```json
{
  "success": false,
  "error": {
    "code": "PRICE_OUT_OF_RANGE",
    "message": "Price must be between ₹10,200 and ₹16,800.",
    "details": {}
  }
}
```

## Persistence

`storage/state.json` is created automatically. Every mutation writes a temporary file and renames it, reducing the chance of a half-written state file. Supplied open requests are seeded exactly once. Supplied booked rides remain read-only baseline busy intervals.

Booking references are strings, so a value such as `0048172635` keeps its leading zeroes.

## Tests

`npm test` currently covers:

- Normal and overnight service windows
- Inclusive price boundaries
- Pickup +60-minute calculation
- Exact-capacity car fit
- Separate large/small bag checks
- Touching vs. overlapping busy intervals
- Menon catalog route values
- Full request → invalid car → valid offer → booking → accepted change API flow
- State written to disk

## Catalog counts checked at startup/API

- 469 total flights; 240 relevant arrival flights
- 49 hotels
- 10 airports
- 33 routes
- 11 suppliers
- 28 vehicles
- 3 supplied open requests
- 6 supplied busy rides

## Known limitations

- The required sequential final availability check is implemented; database-level locking for two truly simultaneous bookings is intentionally not included.
- JSON persistence is suitable for the hackathon laptop/demo, not a multi-server production deployment.
- No authentication, payment, map, live GPS, shared ride, or real taxi integration is included.
- Offer expiry is not implemented.

## Submission notes

Do not include `node_modules` in the submitted ZIP. Include source, `package.json`, `package-lock.json`, supplied data, `README.md`, `SPEC.md`, and tests.
