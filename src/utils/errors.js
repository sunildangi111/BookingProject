class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function badRequest(code, message, details = null) {
  return new AppError(400, code, message, details);
}

function notFound(code, message, details = null) {
  return new AppError(404, code, message, details);
}

function conflict(code, message, details = null) {
  return new AppError(409, code, message, details);
}

function routeHandler(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  AppError,
  badRequest,
  notFound,
  conflict,
  routeHandler
};
