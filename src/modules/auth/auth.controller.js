import AuthService from './auth.service.js';
import AuthRepository from './auth.repository.js';
import { successResponse } from '../../utils/response.js';

export class AuthController {
  static async register(req, res, next) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await AuthService.register(req.body, clientIp, userAgent);
      return successResponse(res, result, 'User registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await AuthService.login(req.body, clientIp, userAgent);

      if (result.mfaRequired) {
        return successResponse(res, result, 'MFA code required', 200);
      }

      return successResponse(res, result, 'Logged in successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const tokens = await AuthService.refreshToken(req.body.refreshToken);
      return successResponse(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getCurrentUser(req, res, next) {
    try {
      const user = await AuthRepository.findUserById(req.user.id);
      return successResponse(res, user, 'Current user profile');
    } catch (error) {
      next(error);
    }
  }

  static async setupMFA(req, res, next) {
    try {
      const result = await AuthService.setupMFA(req.user.id);
      return successResponse(res, result, 'MFA setup initiated. Scan QR code into your authenticator app.');
    } catch (error) {
      next(error);
    }
  }

  static async verifyMFA(req, res, next) {
    try {
      const result = await AuthService.verifyAndEnableMFA(req.user.id, req.body.token);
      return successResponse(res, result, 'MFA verified and enabled');
    } catch (error) {
      next(error);
    }
  }
}

export default AuthController;
