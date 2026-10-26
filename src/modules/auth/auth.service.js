import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import config from '../../../config/index.js';
import AuthRepository from './auth.repository.js';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../utils/errors.js';
import { logAuditEvent } from '../../middlewares/auditLogger.js';

export class AuthService {

  static async register(data, clientIp, userAgent) {
    const existing = await AuthRepository.findUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const user = await AuthRepository.createUserWithProfile({
      ...data,
      passwordHash,
    });

    const tokens = AuthService.generateTokens(user);

    await logAuditEvent({
      userId: user.id,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: clientIp,
      userAgent,
      previousState: null,
      newState: { email: user.email, role: user.role },
    });

    return { user, tokens };
  }

  static async login({ email, password, mfaCode }, clientIp, userAgent) {
    const user = await AuthRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (user.is_mfa_enabled) {
      if (!mfaCode) {
        return {
          mfaRequired: true,
          userId: user.id,
          message: 'Multi-Factor Authentication code required.',
        };
      }

      const isValidToken = authenticator.check(mfaCode, user.mfa_secret);
      if (!isValidToken) {
        throw new UnauthorizedError('Invalid MFA verification code.');
      }
    }

    const tokens = AuthService.generateTokens(user);

    await logAuditEvent({
      userId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: clientIp,
      userAgent,
      previousState: null,
      newState: { isMfaUsed: user.is_mfa_enabled },
    });

    const userProfile = {
      id: user.id,
      email: user.email,
      role: user.role,
      phone: user.phone,
      isMfaEnabled: user.is_mfa_enabled,
      firstName: user.first_name,
      lastName: user.last_name,
    };

    return { user: userProfile, tokens, mfaRequired: false };
  }

  static generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    return { accessToken, refreshToken, expiresIn: config.jwt.expiresIn };
  }

  static async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      const user = await AuthRepository.findUserById(decoded.id);

      if (!user) {
        throw new UnauthorizedError('User associated with token no longer exists.');
      }

      const tokens = AuthService.generateTokens(user);
      return tokens;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }
  }

  static async setupMFA(userId) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, config.mfa.issuer, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    await AuthRepository.updateMfaSecret(userId, secret);

    return { secret, qrCodeDataUrl, otpauth };
  }

  static async verifyAndEnableMFA(userId, token) {
    const user = await AuthRepository.findUserByEmail(
      (await AuthRepository.findUserById(userId)).email
    );

    if (!user || !user.mfa_secret) {
      throw new BadRequestError('MFA setup must be initiated before verification.');
    }

    const isValid = authenticator.check(token, user.mfa_secret);
    if (!isValid) {
      throw new BadRequestError('Invalid verification code.');
    }

    await AuthRepository.enableMfa(userId);
    return { success: true, message: 'MFA successfully verified and enabled.' };
  }
}

export default AuthService;

