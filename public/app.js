const appState = {
  catalog: null,
  quote: null,
  currentRequestId: localStorage.getItem('arrivalride.requestId') || null,
  currentRequest: null,
  eligibility: null,
  offers: [],
  currentSupplierId: localStorage.getItem('arrivalride.supplierId') || null,
  currentBooking: null,
  toastTimer: null
};

const byId = (id) => document.getElementById(id);
const nodes = {
  appStatus: byId('appStatus'),
  travelerForm: byId('travelerForm'),
  travelerFormError: byId('travelerFormError'),
  flightSelect: byId('flightSelect'),
  hotelSelect: byId('hotelSelect'),
  travelerName: byId('travelerName'),
  adults: byId('adults'),
  childCount: byId('childCount'),
  childAgesContainer: byId('childAgesContainer'),
  largeBags: byId('largeBags'),
  smallBags: byId('smallBags'),
  carType: byId('carType'),
  pickup: byId('pickup'),
  travelerPrice: byId('travelerPrice'),
  quoteCard: byId('quoteCard'),
  quoteRange: byId('quoteRange'),
  quoteRoute: byId('quoteRoute'),
  postRequestButton: byId('postRequestButton'),
  loadMenonButton: byId('loadMenonButton'),
  trackRequestForm: byId('trackRequestForm'),
  trackRequestId: byId('trackRequestId'),
  travelerWorkspace: byId('travelerWorkspace'),
  workspaceTitle: byId('workspaceTitle'),
  requestSummary: byId('requestSummary'),
  eligibilitySummary: byId('eligibilitySummary'),
  refreshOffersButton: byId('refreshOffersButton'),
  offersList: byId('offersList'),
  offerTypeFilter: byId('offerTypeFilter'),
  offerSort: byId('offerSort'),
  supplierSelect: byId('supplierSelect'),
  refreshSupplierButton: byId('refreshSupplierButton'),
  supplierIdentity: byId('supplierIdentity'),
  supplierStats: byId('supplierStats'),
  supplierRequests: byId('supplierRequests'),
  supplierChanges: byId('supplierChanges'),
  supplierOffers: byId('supplierOffers'),
  lookupForm: byId('lookupForm'),
  bookingReferenceInput: byId('bookingReferenceInput'),
  lookupError: byId('lookupError'),
  lookupPlaceholder: byId('lookupPlaceholder'),
  bookingResult: byId('bookingResult'),
  toast: byId('toast'),
  toastIcon: byId('toastIcon'),
  toastTitle: byId('toastTitle'),
  toastMessage: byId('toastMessage')
};

class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `Request failed with status ${status}`);
    this.status = status;
    this.code = payload?.error?.code || 'REQUEST_FAILED';
    this.details = payload?.error?.details || null;
  }
}

async function api(path, options = {}) {
  const requestOptions = {
    method: options.method || 'GET',
    headers: { ...(options.headers || {}) }
  };
  if (options.body !== undefined) {
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, requestOptions);
  } catch (error) {
    throw new ApiError(0, {
      error: {
        code: 'NETWORK_ERROR',
        message: 'The backend is not reachable. Check that the Node.js server is running.'
      }
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    payload = { error: { message: 'The server returned an unreadable response.' } };
  }
  if (!response.ok || payload.success === false) {
    throw new ApiError(response.status, payload);
  }
  return payload.data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatLocal(value, options = {}) {
  if (!value) return '—';
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const config = options.timeOnly
    ? { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' };
  return new Intl.DateTimeFormat('en-IN', config).format(date);
}

function formatDateOnly(value) {
  if (!value) return '—';
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}

function flightLabel(flight) {
  return `${formatDateOnly(flight.arrival_local)} · ${flight.flight_number} · ${flight.from} → ${flight.to} · lands ${formatLocal(flight.arrival_local, { timeOnly: true })}`;
}

function statusClass(status) {
  return `status-${String(status || '').toLowerCase().replaceAll('_', '-')}`;
}

function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.originalLabel = button.innerHTML;
    if (label) button.textContent = label;
    button.classList.add('loading');
    button.disabled = true;
  } else {
    if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
    button.classList.remove('loading');
    button.disabled = false;
  }
}

function showInlineError(element, error) {
  element.textContent = error instanceof Error ? error.message : String(error);
  element.hidden = false;
}

function clearInlineError(element) {
  element.hidden = true;
  element.textContent = '';
}

function showToast(title, message, type = 'success') {
  clearTimeout(appState.toastTimer);
  nodes.toastTitle.textContent = title;
  nodes.toastMessage.textContent = message;
  nodes.toastIcon.textContent = type === 'error' ? '!' : '✓';
  nodes.toast.classList.toggle('error', type === 'error');
  nodes.toast.hidden = false;
  appState.toastTimer = setTimeout(() => {
    nodes.toast.hidden = true;
  }, 4800);
}

function switchView(viewName) {
  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === viewName;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });
  if (viewName === 'supplier' && appState.currentSupplierId) {
    loadSupplierDashboard().catch(handleBackgroundError);
  }
  window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
}

function handleBackgroundError(error) {
  console.error(error);
  showToast(error.code || 'Error', error.message, 'error');
}

async function checkHealth() {
  try {
    await api('/api/health');
    nodes.appStatus.classList.add('online');
    nodes.appStatus.classList.remove('offline');
    nodes.appStatus.querySelector('span:last-child').textContent = 'Backend online';
  } catch (error) {
    nodes.appStatus.classList.add('offline');
    nodes.appStatus.classList.remove('online');
    nodes.appStatus.querySelector('span:last-child').textContent = 'Backend offline';
    throw error;
  }
}

async function loadCatalog() {
  appState.catalog = await api('/api/catalog/bootstrap');
  populateFlights();
  populateSuppliers();
}

function populateFlights() {
  const options = appState.catalog.flights.map((flight) => (
    `<option value="${escapeHtml(flight.flight_id)}">${escapeHtml(flightLabel(flight))}</option>`
  )).join('');
  nodes.flightSelect.innerHTML = `<option value="">Select an arriving flight</option>${options}`;
}

function populateSuppliers() {
  const options = appState.catalog.suppliers.map((supplier) => (
    `<option value="${escapeHtml(supplier.company_id)}">${escapeHtml(supplier.name)} · ${supplier.rating.toFixed(1)} ★</option>`
  )).join('');
  nodes.supplierSelect.innerHTML = `<option value="">Choose a taxi company</option>${options}`;

  if (appState.currentSupplierId && appState.catalog.suppliers.some((supplier) => supplier.company_id === appState.currentSupplierId)) {
    nodes.supplierSelect.value = appState.currentSupplierId;
    loadSupplierDashboard().catch(handleBackgroundError);
  }
}

function selectedFlight() {
  return appState.catalog?.flights.find((flight) => flight.flight_id === nodes.flightSelect.value) || null;
}

function filterHotelsForFlight() {
  const flight = selectedFlight();
  appState.quote = null;
  renderEmptyQuote();
  if (!flight) {
    nodes.hotelSelect.innerHTML = '<option value="">Choose a flight first</option>';
    nodes.hotelSelect.disabled = true;
    return;
  }

  const airport = appState.catalog.airports.find((entry) => entry.code === flight.to);
  const servedCities = airport?.serves_cities || [];
  const hotels = appState.catalog.hotels
    .filter((hotel) => servedCities.includes(hotel.city))
    .sort((first, second) => first.city.localeCompare(second.city) || first.name.localeCompare(second.name));
  const options = hotels.map((hotel) => (
    `<option value="${escapeHtml(hotel.hotel_id)}">${escapeHtml(hotel.city)} · ${escapeHtml(hotel.area)} · ${escapeHtml(hotel.name)}</option>`
  )).join('');
  nodes.hotelSelect.innerHTML = `<option value="">Select a hotel</option>${options}`;
  nodes.hotelSelect.disabled = false;
}

function renderEmptyQuote() {
  nodes.quoteCard.className = 'quote-card empty';
  nodes.quoteRange.textContent = 'Choose a flight and hotel';
  nodes.quoteRoute.textContent = 'We will verify airport, city, and area.';
}

async function updateQuote() {
  const flightId = nodes.flightSelect.value;
  const hotelId = nodes.hotelSelect.value;
  if (!flightId || !hotelId) {
    renderEmptyQuote();
    return null;
  }

  nodes.quoteCard.className = 'quote-card';
  nodes.quoteRange.textContent = 'Checking route…';
  nodes.quoteRoute.textContent = 'Reading supplied route data.';
  try {
    const quote = await api(`/api/routes/quote?flightId=${encodeURIComponent(flightId)}&hotelId=${encodeURIComponent(hotelId)}`);
    appState.quote = quote;
    nodes.quoteCard.className = 'quote-card';
    nodes.quoteRange.textContent = `${formatInr(quote.price_min_inr)} – ${formatInr(quote.price_max_inr)}`;
    nodes.quoteRoute.textContent = `${quote.airport} → ${quote.hotel.area}, ${quote.hotel.city} · ${quote.distance_km} km · ${quote.drive_minutes} min`;
    nodes.travelerPrice.min = String(quote.price_min_inr);
    nodes.travelerPrice.max = String(quote.price_max_inr);
    nodes.pickup.min = quote.earliest_pickup_local.slice(0, 16);
    if (!nodes.pickup.value) nodes.pickup.value = quote.earliest_pickup_local.slice(0, 16);
    return quote;
  } catch (error) {
    appState.quote = null;
    nodes.quoteCard.className = 'quote-card error';
    nodes.quoteRange.textContent = error.code || 'Route unavailable';
    nodes.quoteRoute.textContent = error.message;
    throw error;
  }
}

function renderChildAgeFields() {
  const previousValues = [...nodes.childAgesContainer.querySelectorAll('input')].map((input) => input.value);
  const rawCount = Number(nodes.childCount.value);
  const count = Number.isInteger(rawCount) ? Math.max(0, Math.min(8, rawCount)) : 0;
  nodes.childCount.value = String(count);
  nodes.childAgesContainer.innerHTML = Array.from({ length: count }, (_, index) => `
    <label class="child-age-field">
      <span>Child ${index + 1} age</span>
      <input class="child-age-input" type="number" min="0" max="17" step="1" value="${escapeHtml(previousValues[index] ?? '')}" required aria-label="Child ${index + 1} age">
    </label>
  `).join('');
}

function getChildAges() {
  return [...nodes.childAgesContainer.querySelectorAll('.child-age-input')].map((input) => input.value);
}

async function loadMenonDemo() {
  nodes.travelerName.value = 'Menon family';
  nodes.flightSelect.value = 'FL-401';
  filterHotelsForFlight();
  nodes.hotelSelect.value = 'HTL-TYO-004';
  nodes.adults.value = '2';
  nodes.childCount.value = '1';
  renderChildAgeFields();
  nodes.childAgesContainer.querySelector('input').value = '6';
  nodes.largeBags.value = '3';
  nodes.smallBags.value = '2';
  nodes.carType.value = '';
  nodes.pickup.value = '2027-04-10T11:30';
  nodes.travelerPrice.value = '12000';
  await updateQuote();
  showToast('Demo loaded', 'Menon family data is ready. The backend will still validate every field.');
  nodes.travelerForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitTravelerForm(event) {
  event.preventDefault();
  clearInlineError(nodes.travelerFormError);
  setLoading(nodes.postRequestButton, true, 'Posting request');
  try {
    const payload = {
      traveler_name: nodes.travelerName.value.trim(),
      flight_id: nodes.flightSelect.value,
      hotel_id: nodes.hotelSelect.value,
      adults: nodes.adults.value,
      child_ages: getChildAges(),
      large_bags: nodes.largeBags.value,
      small_bags: nodes.smallBags.value,
      pickup: nodes.pickup.value || null,
      car_type: nodes.carType.value || null,
      price_inr: nodes.travelerPrice.value
    };
    const result = await api('/api/ride-requests', { method: 'POST', body: payload });
    appState.currentRequestId = result.request.request_id;
    localStorage.setItem('arrivalride.requestId', appState.currentRequestId);
    nodes.trackRequestId.value = appState.currentRequestId;
    await loadTravelerWorkspace(appState.currentRequestId, result);
    showToast('Request posted', `${appState.currentRequestId} is now visible to eligible suppliers.`);
    nodes.travelerWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showInlineError(nodes.travelerFormError, error);
    showToast(error.code || 'Request refused', error.message, 'error');
  } finally {
    setLoading(nodes.postRequestButton, false);
  }
}

async function trackRequest(event) {
  event.preventDefault();
  const requestId = nodes.trackRequestId.value.trim().toUpperCase();
  if (!requestId) return;
  try {
    appState.currentRequestId = requestId;
    localStorage.setItem('arrivalride.requestId', requestId);
    await loadTravelerWorkspace(requestId);
    nodes.travelerWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.code || 'Request not found', error.message, 'error');
  }
}

async function loadTravelerWorkspace(requestId, suppliedResult = null) {
  const [requestResult, offerResult] = await Promise.all([
    suppliedResult || api(`/api/ride-requests/${encodeURIComponent(requestId)}/eligibility`),
    api(`/api/ride-requests/${encodeURIComponent(requestId)}/offers`)
  ]);
  appState.currentRequest = requestResult.request;
  appState.eligibility = requestResult.supplier_eligibility;
  appState.offers = offerResult.offers;
  nodes.travelerWorkspace.hidden = false;
  nodes.workspaceTitle.textContent = `${appState.currentRequest.traveler_name} · ${appState.currentRequest.request_id}`;
  renderRequestSummary();
  renderEligibility();
  renderOffers();
}

function renderRequestSummary() {
  const request = appState.currentRequest;
  nodes.requestSummary.innerHTML = `
    <div class="overview-cell primary">
      <span>Request</span>
      <strong>${escapeHtml(request.request_id)}</strong>
      <small>${escapeHtml(request.traveler_name)}</small>
      <span class="status-chip ${statusClass(request.status)}">${escapeHtml(request.status)}</span>
    </div>
    <div class="overview-cell">
      <span>Arrival</span>
      <strong>${escapeHtml(request.flight.flight_number)} · ${escapeHtml(request.flight.to)}</strong>
      <small>${escapeHtml(formatLocal(request.flight.arrival_local))}</small>
    </div>
    <div class="overview-cell">
      <span>Hotel</span>
      <strong>${escapeHtml(request.hotel.name)}</strong>
      <small>${escapeHtml(request.hotel.area)}, ${escapeHtml(request.hotel.city)}</small>
    </div>
    <div class="overview-cell">
      <span>Pickup</span>
      <strong>${escapeHtml(formatLocal(request.pickup))}</strong>
      <small>${request.route.drive_minutes} min each way</small>
    </div>
    <div class="overview-cell">
      <span>Travel party</span>
      <strong>${request.passenger_count} people · ${request.large_bags + request.small_bags} bags</strong>
      <small>${request.car_type ? escapeHtml(request.car_type) : 'Any car type'}</small>
    </div>
  `;
}

function renderEligibility() {
  const eligibility = appState.eligibility;
  if (eligibility.eligible_count > 0) {
    nodes.eligibilitySummary.className = 'eligibility-box';
    nodes.eligibilitySummary.innerHTML = `
      <strong>${eligibility.eligible_count} supplier${eligibility.eligible_count === 1 ? '' : 's'} can currently serve this request.</strong>
      <div class="eligibility-suppliers">
        ${eligibility.eligible_suppliers.map((supplier) => `<span>${escapeHtml(supplier.name)} · ${supplier.eligible_vehicle_count} car${supplier.eligible_vehicle_count === 1 ? '' : 's'}</span>`).join('')}
      </div>
    `;
    return;
  }

  const reasons = eligibility.unavailable_suppliers
    .slice(0, 5)
    .map((supplier) => `${supplier.name}: ${supplier.reasons[0]?.message || 'No fitting free car'}`);
  nodes.eligibilitySummary.className = 'eligibility-box none';
  nodes.eligibilitySummary.innerHTML = `
    <strong>No supplier can currently serve this request.</strong>
    <div class="eligibility-suppliers">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
  `;
}

function renderOffers() {
  const type = nodes.offerTypeFilter.value;
  const sort = nodes.offerSort.value;
  let offers = appState.offers.filter((offer) => !type || offer.vehicle?.type === type);
  offers = [...offers].sort((first, second) => (
    sort === 'rating'
      ? (second.company?.rating || 0) - (first.company?.rating || 0)
      : first.price_inr - second.price_inr
  ));

  if (offers.length === 0) {
    nodes.offersList.innerHTML = `
      <div class="empty-state">
        <strong>No matching offers yet</strong>
        Suppliers can now see the request. Refresh after they assign a car.
      </div>
    `;
    return;
  }

  nodes.offersList.innerHTML = offers.map((offer) => {
    const open = offer.status === 'OPEN';
    return `
      <article class="offer-card ${open ? '' : 'disabled'}">
        <div class="offer-card-head">
          <div><h4>${escapeHtml(offer.company?.name || offer.company_id)}</h4><span class="status-chip ${statusClass(offer.status)}">${escapeHtml(offer.status.replaceAll('_', ' '))}</span></div>
          <span class="rating">★ ${offer.company?.rating?.toFixed(1) || '—'}</span>
        </div>
        <span class="vehicle-type">${escapeHtml(offer.vehicle?.type || 'CAR')} · ${escapeHtml(offer.vehicle_id)}</span>
        <div class="offer-capacity">
          <span>${offer.vehicle?.seats || '—'} seats</span>
          <span>${offer.vehicle?.large_bags || '—'} large</span>
          <span>${offer.vehicle?.small_bags || '—'} small</span>
        </div>
        <div class="offer-price"><span>Supplier price</span><strong>${formatInr(offer.price_inr)}</strong></div>
        ${open ? `<div class="offer-actions">
          <button class="button danger small" data-action="reject-offer" data-offer-id="${escapeHtml(offer.offer_id)}">Reject</button>
          <button class="button primary small" data-action="book-offer" data-offer-id="${escapeHtml(offer.offer_id)}">Book car</button>
        </div>` : ''}
      </article>
    `;
  }).join('');
}

async function handleOfferAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const offerId = button.dataset.offerId;
  if (button.dataset.action === 'reject-offer') {
    if (!window.confirm('Reject this taxi offer? A rejected offer cannot be booked later.')) return;
    setLoading(button, true, 'Rejecting');
    try {
      await api(`/api/offers/${encodeURIComponent(offerId)}/reject`, { method: 'PATCH', body: {} });
      showToast('Offer rejected', `${offerId} can no longer be booked.`);
      await loadTravelerWorkspace(appState.currentRequestId);
    } catch (error) {
      showToast(error.code || 'Could not reject', error.message, 'error');
    } finally {
      setLoading(button, false);
    }
    return;
  }

  if (button.dataset.action === 'book-offer') {
    if (!window.confirm('Book this car? Other open offers will become not chosen.')) return;
    setLoading(button, true, 'Rechecking car');
    try {
      const summary = await api(`/api/offers/${encodeURIComponent(offerId)}/book`, { method: 'POST', body: {} });
      const reference = summary.booking.booking_reference;
      localStorage.setItem('arrivalride.bookingReference', reference);
      nodes.bookingReferenceInput.value = reference;
      appState.currentBooking = summary;
      renderBookingSummary(summary);
      showToast('Ride booked', `Booking ${reference} is saved and the car is now busy.`);
      await loadTravelerWorkspace(appState.currentRequestId);
      switchView('booking');
    } catch (error) {
      showToast(error.code || 'Booking refused', error.message, 'error');
    } finally {
      setLoading(button, false);
    }
  }
}

async function loadSupplierDashboard() {
  const companyId = nodes.supplierSelect.value || appState.currentSupplierId;
  if (!companyId) {
    renderSupplierEmpty();
    return;
  }
  appState.currentSupplierId = companyId;
  nodes.supplierSelect.value = companyId;
  localStorage.setItem('arrivalride.supplierId', companyId);
  setLoading(nodes.refreshSupplierButton, true, 'Refreshing');
  try {
    const dashboard = await api(`/api/suppliers/${encodeURIComponent(companyId)}/dashboard`);
    renderSupplierDashboard(dashboard);
  } catch (error) {
    showToast(error.code || 'Supplier dashboard error', error.message, 'error');
  } finally {
    setLoading(nodes.refreshSupplierButton, false);
  }
}

function renderSupplierEmpty() {
  nodes.supplierIdentity.innerHTML = '<div class="empty-state compact"><strong>Choose a supplier</strong>Select a taxi company to open its dashboard.</div>';
  nodes.supplierStats.innerHTML = '';
  nodes.supplierRequests.innerHTML = '<div class="empty-state"><strong>No supplier selected</strong></div>';
  nodes.supplierChanges.innerHTML = '<div class="empty-state compact">No supplier selected.</div>';
  nodes.supplierOffers.innerHTML = '<div class="empty-state compact">No supplier selected.</div>';
}

function renderSupplierDashboard(dashboard) {
  const company = dashboard.company;
  nodes.supplierIdentity.innerHTML = `
    <div class="supplier-name">
      <span class="supplier-avatar">${escapeHtml(company.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join(''))}</span>
      <div><h3>${escapeHtml(company.name)} · ★ ${company.rating.toFixed(1)}</h3><p>${escapeHtml(company.company_id)} · Service ${escapeHtml(company.service_from)}–${escapeHtml(company.service_until)} · ${company.vehicles.length} vehicles</p></div>
    </div>
    <div class="supplier-coverage">
      ${company.airports.map((airport) => `<span>${escapeHtml(airport)} airport</span>`).join('')}
      <span>${company.areas.length} hotel areas</span>
    </div>
  `;

  const metrics = [
    ['Serviceable', dashboard.stats.serviceable_requests],
    ['Open offers', dashboard.stats.open_offers],
    ['Booked', dashboard.stats.booked_offers],
    ['Pending changes', dashboard.stats.pending_changes]
  ];
  nodes.supplierStats.innerHTML = metrics.map(([label, value]) => `
    <div class="metric-card"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
  `).join('');

  renderSupplierRequests(dashboard.requests, company);
  renderSupplierChanges(dashboard.changes, company);
  renderSupplierOffers(dashboard.offers);
}

function renderSupplierRequests(requestEntries, company) {
  if (requestEntries.length === 0) {
    nodes.supplierRequests.innerHTML = '<div class="empty-state"><strong>No serviceable open requests</strong>Requests outside your coverage, hours, capacity, or free-car availability are hidden.</div>';
    return;
  }

  nodes.supplierRequests.innerHTML = requestEntries.map((entry) => {
    const request = entry.request;
    const vehicleOptions = entry.vehicle_options.map((option) => {
      const firstFailure = option.failures[0];
      const suffix = option.eligible ? '✓ eligible' : `✕ ${firstFailure?.message || 'not eligible'}`;
      return `<option value="${escapeHtml(option.vehicle.vehicle_id)}" class="${option.eligible ? 'vehicle-valid' : 'vehicle-warning'}" ${option.eligible ? 'data-eligible="true"' : ''}>${escapeHtml(option.vehicle.vehicle_id)} · ${escapeHtml(option.vehicle.type)} · ${option.vehicle.seats} seats · ${escapeHtml(suffix)}</option>`;
    }).join('');
    const firstEligible = entry.vehicle_options.find((option) => option.eligible)?.vehicle.vehicle_id;
    return `
      <article class="request-card" data-request-card="${escapeHtml(request.request_id)}">
        <div class="request-card-top">
          <div><span class="request-id">${escapeHtml(request.request_id)}</span><h4>${escapeHtml(request.traveler_name)}</h4></div>
          <div class="request-price"><span>Traveler price</span><strong>${formatInr(request.price_inr)}</strong></div>
        </div>
        <p class="request-route"><b>${escapeHtml(request.flight.to)}</b> → ${escapeHtml(request.hotel.name)}, ${escapeHtml(request.hotel.area)} · Pickup ${escapeHtml(formatLocal(request.pickup))}</p>
        <div class="request-facts">
          <div class="fact"><span>Passengers</span><strong>${request.passenger_count}</strong></div>
          <div class="fact"><span>Large bags</span><strong>${request.large_bags}</strong></div>
          <div class="fact"><span>Small bags</span><strong>${request.small_bags}</strong></div>
          <div class="fact"><span>Range</span><strong>${formatInr(request.route.price_min_inr)}–${formatInr(request.route.price_max_inr)}</strong></div>
        </div>
        <form class="offer-form" data-offer-form="${escapeHtml(request.request_id)}">
          <label>Assign car<select name="vehicleId">${vehicleOptions}</select></label>
          <label>Your price<input name="priceInr" type="number" min="${request.route.price_min_inr}" max="${request.route.price_max_inr}" step="1" value="${request.price_inr}"></label>
          <button class="button primary small" type="submit">Send offer</button>
        </form>
        <div class="card-error" hidden></div>
      </article>
    `.replace(`value="${escapeHtml(firstEligible)}"`, `value="${escapeHtml(firstEligible)}" selected`);
  }).join('');
}

function renderSupplierChanges(changes, company) {
  const pending = changes.filter((change) => change.status === 'PENDING');
  if (pending.length === 0) {
    nodes.supplierChanges.innerHTML = '<div class="empty-state compact"><strong>No pending changes</strong>Accepted and rejected decisions remain in booking history.</div>';
    return;
  }
  nodes.supplierChanges.innerHTML = pending.map((change) => `
    <article class="change-card">
      <div class="history-head"><h4>${escapeHtml(change.traveler_name)} · ${escapeHtml(change.vehicle_id)}</h4><span class="status-chip status-pending">PENDING</span></div>
      <p>${escapeHtml(change.hotel?.name || 'Hotel')} · ${escapeHtml(change.change_id)}</p>
      <div class="change-time">
        <span>${escapeHtml(change.current_flight?.flight_number || change.current_flight_id)}<br><b>${escapeHtml(formatLocal(change.current_pickup))}</b></span>
        <b>→</b>
        <span>${escapeHtml(change.proposed_flight?.flight_number || change.proposed_flight_id)}<br><b>${escapeHtml(formatLocal(change.proposed_pickup))}</b></span>
      </div>
      ${change.preview_eligible ? '<p class="vehicle-valid">✓ The same car is currently valid and free.</p>' : `<p class="vehicle-warning">⚠ ${escapeHtml(change.preview_failures[0]?.message || 'Recheck required')}</p>`}
      <div class="change-actions">
        <button class="button danger small" data-change-action="REJECT" data-change-id="${escapeHtml(change.change_id)}">Reject</button>
        <button class="button success small" data-change-action="ACCEPT" data-change-id="${escapeHtml(change.change_id)}">Accept</button>
      </div>
    </article>
  `).join('');
}

function renderSupplierOffers(offers) {
  if (offers.length === 0) {
    nodes.supplierOffers.innerHTML = '<div class="empty-state compact">No offers sent yet.</div>';
    return;
  }
  nodes.supplierOffers.innerHTML = offers.slice(0, 12).map((offer) => `
    <article class="history-card">
      <div class="history-head"><h4>${escapeHtml(offer.vehicle_id)} · ${formatInr(offer.price_inr)}</h4><span class="status-chip ${statusClass(offer.status)}">${escapeHtml(offer.status.replaceAll('_', ' '))}</span></div>
      <p>${escapeHtml(offer.request_id)} · ${escapeHtml(offer.offer_id)}</p>
      <small>${escapeHtml(new Date(offer.created_at).toLocaleString('en-IN'))}</small>
    </article>
  `).join('');
}

async function submitSupplierOffer(event) {
  const form = event.target.closest('[data-offer-form]');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('.request-card');
  const errorBox = card.querySelector('.card-error');
  errorBox.hidden = true;
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true, 'Checking');
  try {
    const requestId = form.dataset.offerForm;
    const formData = new FormData(form);
    const result = await api(`/api/ride-requests/${encodeURIComponent(requestId)}/offers`, {
      method: 'POST',
      body: {
        company_id: appState.currentSupplierId,
        vehicle_id: formData.get('vehicleId'),
        price_inr: formData.get('priceInr')
      }
    });
    showToast('Offer sent', `${result.vehicle_id} was offered at ${formatInr(result.price_inr)}.`);
    await loadSupplierDashboard();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    showToast(error.code || 'Offer refused', error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function decideSupplierChange(event) {
  const button = event.target.closest('[data-change-action]');
  if (!button) return;
  const decision = button.dataset.changeAction;
  const changeId = button.dataset.changeId;
  if (!window.confirm(`${decision === 'ACCEPT' ? 'Accept' : 'Reject'} change ${changeId}?`)) return;
  setLoading(button, true, decision === 'ACCEPT' ? 'Rechecking' : 'Rejecting');
  try {
    const result = await api(`/api/change-requests/${encodeURIComponent(changeId)}`, {
      method: 'PATCH',
      body: { decision, company_id: appState.currentSupplierId }
    });
    showToast(`Change ${result.change.status.toLowerCase()}`, decision === 'ACCEPT' ? 'The booking now uses the new flight/pickup.' : 'The original booking remains unchanged.');
    await loadSupplierDashboard();
  } catch (error) {
    showToast(error.code || 'Decision refused', error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function lookupBooking(event) {
  event.preventDefault();
  clearInlineError(nodes.lookupError);
  const reference = nodes.bookingReferenceInput.value.trim();
  try {
    const summary = await api(`/api/bookings/${encodeURIComponent(reference)}`);
    localStorage.setItem('arrivalride.bookingReference', reference);
    appState.currentBooking = summary;
    renderBookingSummary(summary);
  } catch (error) {
    nodes.bookingResult.hidden = true;
    nodes.lookupPlaceholder.hidden = false;
    showInlineError(nodes.lookupError, error);
  }
}

function renderBookingSummary(summary) {
  const { booking, traveler, flight, hotel, supplier, vehicle, changes } = summary;
  nodes.lookupPlaceholder.hidden = true;
  nodes.bookingResult.hidden = false;
  nodes.bookingReferenceInput.value = booking.booking_reference;
  const hasPending = changes.some((change) => change.status === 'PENDING');

  nodes.bookingResult.innerHTML = `
    <article class="ticket">
      <header class="ticket-head">
        <div class="ticket-reference"><span>Booking reference</span><strong>${escapeHtml(booking.booking_reference)}</strong></div>
        <span class="ticket-status">CONFIRMED</span>
      </header>
      <div class="ticket-route">
        <div class="ticket-place"><span>Arrival</span><strong>${escapeHtml(flight.to)}</strong><small>${escapeHtml(flight.airline)} ${escapeHtml(flight.flight_number)} · ${escapeHtml(formatLocal(flight.arrival_local))}</small></div>
        <span class="ticket-arrow">→</span>
        <div class="ticket-place"><span>Drop-off</span><strong>${escapeHtml(hotel.area)}</strong><small>${escapeHtml(hotel.name)}, ${escapeHtml(hotel.city)}</small></div>
      </div>
      <div class="ticket-details">
        <div class="ticket-detail"><span>Traveler</span><strong>${escapeHtml(traveler.traveler_name)}</strong></div>
        <div class="ticket-detail"><span>Pickup</span><strong>${escapeHtml(formatLocal(booking.pickup))}</strong></div>
        <div class="ticket-detail"><span>Supplier</span><strong>${escapeHtml(supplier.name)}</strong></div>
        <div class="ticket-detail"><span>Car</span><strong>${escapeHtml(vehicle.vehicle_id)} · ${escapeHtml(vehicle.type)}</strong></div>
        <div class="ticket-detail"><span>Price</span><strong>${formatInr(booking.price_inr)}</strong></div>
      </div>
    </article>

    <div class="booking-bottom">
      <section class="panel change-form-panel">
        <h3>Flight or pickup changed?</h3>
        <p>Send one pending request to ${escapeHtml(supplier.name)}. Your current booking stays unchanged until acceptance.</p>
        ${hasPending ? '<div class="eligibility-box none"><strong>A change is already pending.</strong><br>Wait for the supplier decision before sending another.</div>' : `
          <form id="changeForm">
            <div class="field-grid two-columns">
              <label class="field"><span>New flight <em>optional</em></span><select name="newFlightId"><option value="">Keep ${escapeHtml(flight.flight_number)}</option>${appState.catalog.flights.map((item) => `<option value="${escapeHtml(item.flight_id)}">${escapeHtml(flightLabel(item))}</option>`).join('')}</select></label>
              <label class="field"><span>New pickup <em>optional</em></span><input name="newPickup" type="datetime-local" step="60"></label>
            </div>
            <div class="inline-error" data-change-error hidden></div>
            <button class="button primary" type="submit">Send change request</button>
          </form>
        `}
      </section>
      <section class="panel change-history-panel">
        <h3>Change history</h3>
        <p>Pending, accepted, and rejected supplier decisions.</p>
        ${changes.length === 0 ? '<div class="empty-state compact">No changes requested.</div>' : changes.map((change) => `
          <article class="history-card">
            <div class="history-head"><h4>${escapeHtml(change.change_id)}</h4><span class="status-chip ${statusClass(change.status)}">${escapeHtml(change.status)}</span></div>
            <p>${escapeHtml(change.current_flight_id)} at ${escapeHtml(formatLocal(change.current_pickup))}<br>→ ${escapeHtml(change.proposed_flight_id)} at ${escapeHtml(formatLocal(change.proposed_pickup))}</p>
          </article>
        `).join('')}
      </section>
    </div>
  `;
}

async function submitBookingChange(event) {
  const form = event.target.closest('#changeForm');
  if (!form) return;
  event.preventDefault();
  const errorBox = form.querySelector('[data-change-error]');
  errorBox.hidden = true;
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  setLoading(button, true, 'Sending');
  try {
    const reference = appState.currentBooking.booking.booking_reference;
    const result = await api(`/api/bookings/${encodeURIComponent(reference)}/changes`, {
      method: 'POST',
      body: {
        new_flight_id: data.get('newFlightId') || null,
        new_pickup: data.get('newPickup') || null
      }
    });
    showToast('Change sent', `${result.change_id} is waiting for the supplier.`);
    const summary = await api(`/api/bookings/${encodeURIComponent(reference)}`);
    appState.currentBooking = summary;
    renderBookingSummary(summary);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    showToast(error.code || 'Change refused', error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });
  nodes.flightSelect.addEventListener('change', () => {
    filterHotelsForFlight();
  });
  nodes.hotelSelect.addEventListener('change', () => {
    updateQuote().catch(() => {});
  });
  nodes.childCount.addEventListener('input', renderChildAgeFields);
  nodes.loadMenonButton.addEventListener('click', () => loadMenonDemo().catch(handleBackgroundError));
  nodes.travelerForm.addEventListener('submit', submitTravelerForm);
  nodes.trackRequestForm.addEventListener('submit', trackRequest);
  nodes.refreshOffersButton.addEventListener('click', () => {
    if (appState.currentRequestId) loadTravelerWorkspace(appState.currentRequestId).catch(handleBackgroundError);
  });
  nodes.offerTypeFilter.addEventListener('change', renderOffers);
  nodes.offerSort.addEventListener('change', renderOffers);
  nodes.offersList.addEventListener('click', handleOfferAction);
  nodes.supplierSelect.addEventListener('change', loadSupplierDashboard);
  nodes.refreshSupplierButton.addEventListener('click', loadSupplierDashboard);
  nodes.supplierRequests.addEventListener('submit', submitSupplierOffer);
  nodes.supplierChanges.addEventListener('click', decideSupplierChange);
  nodes.lookupForm.addEventListener('submit', lookupBooking);
  nodes.bookingResult.addEventListener('submit', submitBookingChange);
}

async function initialize() {
  bindEvents();
  renderChildAgeFields();
  renderSupplierEmpty();
  try {
    await Promise.all([checkHealth(), loadCatalog()]);
    if (appState.currentRequestId) {
      nodes.trackRequestId.value = appState.currentRequestId;
      loadTravelerWorkspace(appState.currentRequestId).catch(() => {
        localStorage.removeItem('arrivalride.requestId');
      });
    }
    const storedReference = localStorage.getItem('arrivalride.bookingReference');
    if (storedReference) nodes.bookingReferenceInput.value = storedReference;
  } catch (error) {
    handleBackgroundError(error);
  }
}

document.addEventListener('DOMContentLoaded', initialize);
