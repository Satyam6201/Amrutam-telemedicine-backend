import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Role-Based Access Control middleware
 * @param {...string} allowedRoles - 'PATIENT', 'DOCTOR', 'ADMIN'
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required before role check'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden: Role '${req.user.role}' lacks required permissions for this action. Allowed: [${allowedRoles.join(', ')}]`
        )
      );
    }

    next();
  };
}

export default authorizeRoles;
