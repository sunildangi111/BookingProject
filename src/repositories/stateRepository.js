const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const catalogRepository = require('./catalogRepository');

// Load environment variables from .env if present
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      } else {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const [key, ...rest] = trimmed.split('=');
          if (key && !process.env[key.trim()]) {
            process.env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch (_) {}
  }
}
loadEnv();

const STATE_FILE = process.env.STATE_FILE
  ? path.resolve(process.env.STATE_FILE)
  : null;

let mongoClient = null;
let mongoDb = null;
let isConnected = false;
let pendingMongoWrite = Promise.resolve();

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
  if (!STATE_FILE) return;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const temporaryFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryFile, STATE_FILE);
  } catch (error) {
    // When run in environments without write access to local disk, ignore
  }
}

function loadState() {
  if (!STATE_FILE || !fs.existsSync(STATE_FILE)) {
    return defaultState();
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (error) {
    return defaultState();
  }

  return normalizeState(parsed);
}

let currentState = loadState();

function isMongoConnected() {
  return isConnected && mongoDb !== null;
}

async function persistStateToMongo(state) {
  if (!mongoDb) return;

  try {
    // 1. Metadata and counters
    await mongoDb.collection('metadata').updateOne(
      { _id: 'state_metadata' },
      {
        $set: {
          version: state.version,
          counters: state.counters,
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    // 2. Ride requests
    if (state.ride_requests && state.ride_requests.length > 0) {
      const ops = state.ride_requests.map((doc) => ({
        replaceOne: {
          filter: { request_id: doc.request_id },
          replacement: { ...doc, _id: doc.request_id },
          upsert: true
        }
      }));
      await mongoDb.collection('ride_requests').bulkWrite(ops, { ordered: false });
    }

    // 3. Offers
    if (state.offers && state.offers.length > 0) {
      const ops = state.offers.map((doc) => ({
        replaceOne: {
          filter: { offer_id: doc.offer_id },
          replacement: { ...doc, _id: doc.offer_id },
          upsert: true
        }
      }));
      await mongoDb.collection('offers').bulkWrite(ops, { ordered: false });
    }

    // 4. Bookings
    if (state.bookings && state.bookings.length > 0) {
      const ops = state.bookings.map((doc) => ({
        replaceOne: {
          filter: { booking_reference: doc.booking_reference },
          replacement: { ...doc, _id: doc.booking_reference },
          upsert: true
        }
      }));
      await mongoDb.collection('bookings').bulkWrite(ops, { ordered: false });
    }

    // 5. Change requests
    if (state.change_requests && state.change_requests.length > 0) {
      const ops = state.change_requests.map((doc) => ({
        replaceOne: {
          filter: { change_id: doc.change_id },
          replacement: { ...doc, _id: doc.change_id },
          upsert: true
        }
      }));
      await mongoDb.collection('change_requests').bulkWrite(ops, { ordered: false });
    }
  } catch (error) {
    console.error('Error persisting state to MongoDB Atlas:', error.message);
  }
}

async function initMongo(explicitUri = null, explicitDb = null) {
  loadEnv();
  const rawUri = explicitUri || process.env.MONGODB_URI;
  const dbName = explicitDb || process.env.MONGODB_DB || 'arrivalride';

  if (!rawUri) {
    return false;
  }

  let uri = String(rawUri).replace(/^['"]|['"]$/g, '').trim();
  if (!uri.includes('retryWrites=')) {
    uri += (uri.includes('?') ? '&' : '/?') + 'retryWrites=true&w=majority';
  }

  try {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
    isConnected = true;

    // Create unique indexes
    await Promise.all([
      mongoDb.collection('ride_requests').createIndex({ request_id: 1 }, { unique: true, sparse: true }),
      mongoDb.collection('offers').createIndex({ offer_id: 1 }, { unique: true, sparse: true }),
      mongoDb.collection('bookings').createIndex({ booking_reference: 1 }, { unique: true, sparse: true }),
      mongoDb.collection('change_requests').createIndex({ change_id: 1 }, { unique: true, sparse: true })
    ]).catch((err) => {
      console.warn('MongoDB index note:', err.message);
    });

    // Check if Atlas already has stored state or is empty
    const metaDoc = await mongoDb.collection('metadata').findOne({ _id: 'state_metadata' });
    const requestCount = await mongoDb.collection('ride_requests').countDocuments();

    if (!metaDoc && requestCount === 0) {
      // Atlas is empty: seed it from default state
      const initial = defaultState();
      await persistStateToMongo(initial);
      currentState = initial;
      atomicWrite(initial);
    } else {
      // Atlas has existing data: load into memory
      const [requests, offers, bookings, changes] = await Promise.all([
        mongoDb.collection('ride_requests').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('offers').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('bookings').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('change_requests').find({}, { projection: { _id: 0 } }).toArray()
      ]);

      const stateFromMongo = {
        version: metaDoc ? metaDoc.version || 1 : 1,
        ride_requests: requests,
        offers,
        bookings,
        change_requests: changes,
        counters: metaDoc && metaDoc.counters ? metaDoc.counters : { request: 1000, offer: 1000, change: 1000 }
      };

      const normalized = normalizeState(stateFromMongo);
      currentState = normalized;
      atomicWrite(normalized);
    }

    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas:', error.message);
    isConnected = false;
    mongoDb = null;
    return false;
  }
}

async function closeMongo() {
  if (pendingMongoWrite) {
    try {
      await pendingMongoWrite;
    } catch (_) {}
  }
  if (mongoClient) {
    try {
      await mongoClient.close();
    } catch (_) {}
    mongoClient = null;
    mongoDb = null;
    isConnected = false;
  }
}

function read() {
  return clone(currentState);
}

function mutate(mutator) {
  const draft = clone(currentState);
  const result = mutator(draft);
  atomicWrite(draft);
  currentState = draft;

  if (isMongoConnected()) {
    const snapshot = clone(draft);
    pendingMongoWrite = pendingMongoWrite
      .then(() => persistStateToMongo(snapshot))
      .catch((err) => console.error('MongoDB sync error:', err.message));
  }

  return clone(result);
}

function reset() {
  const initial = defaultState();
  atomicWrite(initial);
  currentState = initial;

  if (isMongoConnected()) {
    pendingMongoWrite = pendingMongoWrite
      .then(async () => {
        if (!mongoDb) return;
        await Promise.all([
          mongoDb.collection('ride_requests').deleteMany({}),
          mongoDb.collection('offers').deleteMany({}),
          mongoDb.collection('bookings').deleteMany({}),
          mongoDb.collection('change_requests').deleteMany({})
        ]);
        await persistStateToMongo(initial);
      })
      .catch((err) => console.error('MongoDB reset error:', err.message));
  }

  return read();
}

function getStateFilePath() {
  return STATE_FILE;
}

module.exports = {
  read,
  mutate,
  reset,
  getStateFilePath,
  initMongo,
  closeMongo,
  isMongoConnected
};
