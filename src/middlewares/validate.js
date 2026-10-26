import { UnprocessableEntityError } from '../utils/errors.js';

/**
 * Validate incoming request body, query, and params against a Zod schema
 * @param {object} schemas - { body, query, params }
 */
export function validate(schemas) {
  return (req, res, next) => {
    const validationErrors = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        validationErrors.body = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        validationErrors.query = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
      } else {
        req.query = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        validationErrors.params = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
      } else {
        req.params = result.data;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      return next(new UnprocessableEntityError('Request validation failed', validationErrors));
    }

    next();
  };
}

export default validate;
