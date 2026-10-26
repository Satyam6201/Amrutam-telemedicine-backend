import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

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

