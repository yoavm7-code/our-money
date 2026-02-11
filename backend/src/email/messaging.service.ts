import { Injectable, Logger } from '@nestjs/common';

/**
 * Unified messaging service for WhatsApp and SMS notifications.
 *
 * Supported providers:
 * 1. WhatsApp via Meta Cloud API (WHATSAPP_PHONE_ID + WHATSAPP_TOKEN)
 *    - Free: service conversations (user-initiated). Auth templates: ~$0.03/msg
 *    - Setup: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
 * 2. SMS via Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE)
 *    - Free trial: $15.50 credit. Then ~$0.0079/SMS
 *    - Setup: https://www.twilio.com/docs/sms/quickstart/node
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  // WhatsApp Cloud API config
  private readonly waPhoneId: string | undefined;
  private readonly waToken: string | undefined;
  private readonly waApiUrl = 'https://graph.facebook.com/v21.0';

  // Twilio SMS config
  private readonly twilioSid: string | undefined;
  private readonly twilioToken: string | undefined;
  private readonly twilioPhone: string | undefined;

  constructor() {
    this.waPhoneId = process.env.WHATSAPP_PHONE_ID;
    this.waToken = process.env.WHATSAPP_TOKEN;
    this.twilioSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhone = process.env.TWILIO_PHONE;

    if (this.waPhoneId && this.waToken) {
      this.logger.log('WhatsApp Cloud API configured');
    }
    if (this.twilioSid && this.twilioToken && this.twilioPhone) {
      this.logger.log('Twilio SMS configured');
    }
    if (!this.waPhoneId && !this.twilioSid) {
      this.logger.warn(
        'No messaging provider configured. Set WHATSAPP_PHONE_ID+WHATSAPP_TOKEN for WhatsApp, or TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN+TWILIO_PHONE for SMS.',
      );
    }
  }

  /** Check which messaging channels are available */
  getAvailableChannels(): { whatsapp: boolean; sms: boolean } {
    return {
      whatsapp: !!(this.waPhoneId && this.waToken),
      sms: !!(this.twilioSid && this.twilioToken && this.twilioPhone),
    };
  }

  /**
   * Send a verification code via WhatsApp or SMS.
   * Tries WhatsApp first, then falls back to SMS.
   */
  async sendVerificationCode(
    phone: string,
    code: string,
    locale: string,
  ): Promise<{ channel: 'whatsapp' | 'sms' | 'none'; success: boolean }> {
    // Try WhatsApp first
    if (this.waPhoneId && this.waToken) {
      const success = await this.sendWhatsAppOtp(phone, code, locale);
      if (success) return { channel: 'whatsapp', success: true };
    }

    // Fallback to SMS
    if (this.twilioSid && this.twilioToken && this.twilioPhone) {
      const success = await this.sendSms(
        phone,
        locale === 'he'
          ? `קוד האימות שלך ב-Our Money: ${code}`
          : `Your Our Money verification code: ${code}`,
      );
      if (success) return { channel: 'sms', success: true };
    }

    this.logger.warn(`No messaging channel available to send code to ${phone}`);
    return { channel: 'none', success: false };
  }

  /**
   * Send a notification message via WhatsApp or SMS.
   */
  async sendNotification(
    phone: string,
    message: string,
  ): Promise<{ channel: 'whatsapp' | 'sms' | 'none'; success: boolean }> {
    // Try WhatsApp first
    if (this.waPhoneId && this.waToken) {
      const success = await this.sendWhatsAppText(phone, message);
      if (success) return { channel: 'whatsapp', success: true };
    }

    // Fallback to SMS
    if (this.twilioSid && this.twilioToken && this.twilioPhone) {
      const success = await this.sendSms(phone, message);
      if (success) return { channel: 'sms', success: true };
    }

    this.logger.warn(`No messaging channel available for notification to ${phone}`);
    return { channel: 'none', success: false };
  }

  /* ─── WhatsApp Cloud API ─── */

  private async sendWhatsAppOtp(phone: string, code: string, locale: string): Promise<boolean> {
    try {
      const url = `${this.waApiUrl}/${this.waPhoneId}/messages`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/[^0-9]/g, ''),
          type: 'template',
          template: {
            name: 'otp_verification',
            language: { code: locale === 'he' ? 'he' : 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      });

      if (!resp.ok) {
        const error = await resp.text();
        this.logger.error(`WhatsApp OTP failed: ${resp.status} ${error}`);
        return false;
      }

      this.logger.log(`WhatsApp OTP sent to ${phone}`);
      return true;
    } catch (err) {
      this.logger.error(`WhatsApp OTP error: ${err}`);
      return false;
    }
  }

  private async sendWhatsAppText(phone: string, message: string): Promise<boolean> {
    try {
      const url = `${this.waApiUrl}/${this.waPhoneId}/messages`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { body: message },
        }),
      });

      if (!resp.ok) {
        const error = await resp.text();
        this.logger.error(`WhatsApp message failed: ${resp.status} ${error}`);
        return false;
      }

      this.logger.log(`WhatsApp message sent to ${phone}`);
      return true;
    } catch (err) {
      this.logger.error(`WhatsApp message error: ${err}`);
      return false;
    }
  }

  /* ─── Twilio SMS ─── */

  private async sendSms(phone: string, message: string): Promise<boolean> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioSid}/Messages.json`;
      const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');

      const body = new URLSearchParams({
        To: phone,
        From: this.twilioPhone!,
        Body: message,
      });

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!resp.ok) {
        const error = await resp.text();
        this.logger.error(`Twilio SMS failed: ${resp.status} ${error}`);
        return false;
      }

      this.logger.log(`SMS sent to ${phone}`);
      return true;
    } catch (err) {
      this.logger.error(`Twilio SMS error: ${err}`);
      return false;
    }
  }
}
