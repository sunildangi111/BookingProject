const fs = require('fs');
const path = require('path');
const catalogRepository = require('./catalogRepository');

const STATE_FILE = process.env.STATE_FILE
  ? path.resolve(process.env.STATE_FILE)
  : path.resolve(__dirname, '../../storage/state.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedRideRequests() {
  return catalogRepository.getSeedRequests().map((request) => ({
    ...clone(request),
    status: 'OPEN',
    source: 'SEED',
    created_at: null,
    updated_at: null
  }));
}

function defaultState() {
  return {
    version: 1,
    ride_requests: seedRideRequests(),
    offers: [],
    bookings: [],
    change_requests: [],
    counters: {
      request: 1000,
      offer: 1000,
      change: 1000
    }
  };
}

function normalizeState(candidate) {
  const state = candidate && typeof candidate === 'object' ? candidate : {};
  state.version = 1;
  state.ride_requests = Array.isArray(state.ride_requests) ? state.ride_requests : [];
  state.offers = Array.isArray(state.offers) ? state.offers : [];
  state.bookings = Array.isArray(state.bookings) ? state.bookings : [];
  state.change_requests = Array.isArray(state.change_requests) ? state.change_requests : [];
  state.counters = state.counters && typeof state.counters === 'object'
    ? state.counters
    : { request: 1000, offer: 1000, change: 1000 };

  for (const seedRequest of seedRideRequests()) {
    const alreadyLoaded = state.ride_requests.some((request) => request.request_id === seedRequest.request_id);
    if (!alreadyLoaded) {
      state.ride_requests.push(seedRequest);
    }
  }

  return state;
}

function atomicWrite(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temporaryFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, STATE_FILE);
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    const initial = defaultState();
    atomicWrite(initial);
    return initial;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`State file is not valid JSON: ${STATE_FILE}. ${error.message}`);
  }

  const normalized = normalizeState(parsed);
  atomicWrite(normalized);
  return normalized;
}

let currentState = loadState();

function read() {
  return clone(currentState);
}

function mutate(mutator) {
  const draft = clone(currentState);
  const result = mutator(draft);
  atomicWrite(draft);
  currentState = draft;
  return clone(result);
}

function reset() {
  const initial = defaultState();
  atomicWrite(initial);
  currentState = initial;
  return read();
}

function getStateFilePath() {
  return STATE_FILE;
}

module.exports = {
  read,
  mutate,
  reset,
  getStateFilePath
};
