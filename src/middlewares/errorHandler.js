import { AppError } from '../utils/errors.js';
import { errorResponse } from '../utils/response.js';
import logger from '../utils/logger.js';
import config from '../../config/index.js';

export function errorHandler(err, req, res, _next) {
  const requestId = req.headers['x-request-id'] || 'req-unknown';

  if (err instanceof AppError) {
    logger.warn(
      {
        requestId,
        path: req.originalUrl,
        method: req.method,
        statusCode: err.statusCode,
        code: err.errorCode,
        message: err.message,
        details: err.details,
      },
      'Operational error handled'
    );

    return errorResponse(res, err.message, err.statusCode, err.errorCode, err.details);
  }

  if (err.code === '23505') {
    logger.warn({ requestId, detail: err.detail }, 'Postgres unique constraint violation');
    return errorResponse(res, 'A duplicate record already exists with the provided information.', 409, 'DUPLICATE_ENTRY');
  }

  if (err.code === '23503') {
    logger.warn({ requestId, detail: err.detail }, 'Postgres foreign key violation');
    return errorResponse(res, 'Referenced record was not found or has dependent references.', 400, 'FOREIGN_KEY_VIOLATION');
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'Malformed JSON payload in request body', 400, 'INVALID_JSON');
  }

  logger.error(
    {
      requestId,
      path: req.originalUrl,
      method: req.method,
      error: err.message,
      stack: err.stack,
    },
    'Unhandled server exception'
  );

  const message = config.env === 'production' ? 'Internal server error' : err.message;
  return errorResponse(res, message, 500, 'INTERNAL_SERVER_ERROR');
}

export default errorHandler;

