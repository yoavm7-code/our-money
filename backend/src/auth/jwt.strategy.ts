import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { DEFAULT_JWT_SECRET } from './constants';

export interface JwtPayload {
  sub: string;
  email: string;
  businessId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || DEFAULT_JWT_SECRET,
    });
  }

  /**
   * Called by Passport after JWT is decoded and verified.
   * Returns the user object that will be attached to request.user.
   */
  async validate(payload: JwtPayload) {
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // Return { userId, businessId } -- available via @CurrentUser() decorator
    return {
      userId: user.userId,
      email: user.email,
      businessId: user.businessId,
      isAdmin: user.isAdmin,
    };
  }
}
