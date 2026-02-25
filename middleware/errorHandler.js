/**
 * Centralized error handling middleware.
 * Normalizes error responses to { success: false, message, code, details }.
 * Should be registered after all routes.
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  const code = err.code || (statusCode === 400 ? 'BAD_REQUEST' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR');

  if (statusCode >= 500) {
    console.error('[errorHandler]', statusCode, message, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    ...(err.details && { details: err.details }),
  });
}

/**
 * Wraps an async route handler so thrown errors are passed to errorHandler.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
