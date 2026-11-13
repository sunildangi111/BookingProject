const { badRequest } = require('./errors');

function requiredString(value, field, code = 'MISSING_FIELD') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(code, `${field} is required.`, { field });
  }

  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value).trim() || null;
}

function integer(value, field, options = {}) {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, code = 'INVALID_NUMBER' } = options;

  if (value === '' || value === null || value === undefined) {
    throw badRequest(code, `${field} must be an integer between ${min} and ${max}.`, { field, value });
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest(code, `${field} must be an integer between ${min} and ${max}.`, { field, value });
  }

  return parsed;
}

function wholeMoney(value, field = 'Price') {
  if (value === '' || value === null || value === undefined) {
    throw badRequest('INVALID_PRICE', `${field} must be a positive whole INR amount.`, { field, value });
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw badRequest('INVALID_PRICE', `${field} must be a positive whole INR amount.`, { field, value });
  }

  return parsed;
}

function childAges(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw badRequest('INVALID_CHILD_AGE', 'Child ages must be provided as a list.', { value });
  }

  return value.map((age, index) => integer(age, `Child ${index + 1} age`, {
    min: 0,
    max: 17,
    code: 'INVALID_CHILD_AGE'
  }));
}

function enumValue(value, field, allowed, options = {}) {
  const { optional = false, code = 'INVALID_OPTION' } = options;
  if (optional && (value === undefined || value === null || value === '')) {
    return null;
  }

  const normalized = requiredString(value, field, code).toUpperCase();
  if (!allowed.includes(normalized)) {
    throw badRequest(code, `${field} must be one of: ${allowed.join(', ')}.`, {
      field,
      value,
      allowed
    });
  }

  return normalized;
}

module.exports = {
  requiredString,
  optionalString,
  integer,
  wholeMoney,
  childAges,
  enumValue
};
