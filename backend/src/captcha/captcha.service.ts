import { Injectable } from '@nestjs/common';

@Injectable()
export class CaptchaService {
  private readonly secret = process.env.RECAPTCHA_SECRET_KEY;

  /** Verify reCAPTCHA v2 token. If no secret is configured in development, skip verification. */
  async verify(token: string | undefined): Promise<boolean> {
    if (!this.secret) {
      // Only skip in development; in production always require secret
      if (process.env.NODE_ENV === 'production') return false;
      return true;
    }
    if (!token || typeof token !== 'string' || !token.trim()) return false;
    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.secret, response: token.trim() }).toString(),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }
}
