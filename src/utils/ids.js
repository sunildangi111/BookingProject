const crypto = require('crypto');

function nextEntityId(state, counterKey, prefix) {
  if (!state.counters) {
    state.counters = {};
  }

  const current = Number.isInteger(state.counters[counterKey])
    ? state.counters[counterKey]
    : 1000;
  const next = current + 1;
  state.counters[counterKey] = next;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function uniqueBookingReference(existingReferences) {
  const existing = new Set(existingReferences.map(String));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = String(crypto.randomInt(0, 10_000_000_000)).padStart(10, '0');
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not generate a unique booking reference.');
}

module.exports = {
  nextEntityId,
  uniqueBookingReference
};
