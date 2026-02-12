import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resend: Resend | null = null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM || 'Our Money <onboarding@resend.dev>';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Priority 1: Resend API (easiest setup - just set RESEND_API_KEY)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.logger.log('Email via Resend API configured');
      return;
    }

    // Priority 2: SMTP (nodemailer)
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: parseInt(port, 10) === 465,
        auth: { user, pass },
      });
      this.logger.log(`Email via SMTP configured: ${host}:${port}`);
      return;
    }

    this.logger.warn(
      'No email provider configured. Set RESEND_API_KEY (free: 100 emails/day at resend.com) or SMTP_HOST/PORT/USER/PASS. Emails will be logged to console.',
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    // Try Resend first
    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: this.fromAddress,
          to,
          subject,
          html,
        });
        this.logger.log(`Email sent via Resend to ${to}: ${subject}`);
        return;
      } catch (err) {
        this.logger.error(`Failed to send email via Resend to ${to}: ${err}`);
        return;
      }
    }

    // Try SMTP
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
        });
        this.logger.log(`Email sent via SMTP to ${to}: ${subject}`);
        return;
      } catch (err) {
        this.logger.error(`Failed to send email via SMTP to ${to}: ${err}`);
        return;
      }
    }

    // Fallback: log to console
    this.logger.log(`[EMAIL - not sent, no provider configured] To: ${to}`);
    this.logger.log(`[EMAIL] Subject: ${subject}`);
    this.logger.log(`[EMAIL] Body:\n${html}`);
  }

  async sendVerificationEmail(to: string, token: string, locale: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;
    const isHe = locale === 'he';

    const subject = isHe ? 'אימות כתובת אימייל - Our Money' : 'Verify your email - Our Money';
    const html = isHe
      ? `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>ברוכים הבאים ל-Our Money!</h2>
          <p>אנא אמתו את כתובת האימייל שלכם על ידי לחיצה על הקישור הבא:</p>
          <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">אימות אימייל</a></p>
          <p>או העתיקו את הקישור הבא לדפדפן:</p>
          <p style="word-break: break-all; color: #6B7280;">${verifyUrl}</p>
          <p style="color: #9CA3AF; font-size: 12px;">הקישור תקף ל-24 שעות.</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Our Money!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
          <p>Or copy this link into your browser:</p>
          <p style="word-break: break-all; color: #6B7280;">${verifyUrl}</p>
          <p style="color: #9CA3AF; font-size: 12px;">This link is valid for 24 hours.</p>
        </div>
      `;

    await this.send(to, subject, html);
  }

  async sendTwoFactorCode(to: string, code: string, locale: string): Promise<void> {
    const isHe = locale === 'he';

    const subject = isHe ? 'קוד אימות - Our Money' : 'Your verification code - Our Money';
    const html = isHe
      ? `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>קוד אימות</h2>
          <p>הקוד שלכם הוא:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4F46E5;">${code}</p>
          <p style="color: #9CA3AF; font-size: 12px;">הקוד תקף ל-10 דקות. אל תשתפו אותו עם אף אחד.</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verification Code</h2>
          <p>Your code is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4F46E5;">${code}</p>
          <p style="color: #9CA3AF; font-size: 12px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        </div>
      `;

    await this.send(to, subject, html);
  }

  async sendLoginAlert(to: string, ip: string, locale: string): Promise<void> {
    const isHe = locale === 'he';
    const time = new Date().toLocaleString(isHe ? 'he-IL' : 'en-US');

    const subject = isHe ? 'התראת התחברות - Our Money' : 'Login alert - Our Money';
    const html = isHe
      ? `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>התחברות חדשה לחשבון שלכם</h2>
          <p>זוהתה התחברות חדשה לחשבון Our Money שלכם:</p>
          <ul>
            <li>כתובת IP: <strong>${ip}</strong></li>
            <li>זמן: <strong>${time}</strong></li>
          </ul>
          <p>אם זה לא אתם, אנא שנו את הסיסמה מיידית.</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New login to your account</h2>
          <p>A new login was detected on your Our Money account:</p>
          <ul>
            <li>IP Address: <strong>${ip}</strong></li>
            <li>Time: <strong>${time}</strong></li>
          </ul>
          <p>If this wasn't you, please change your password immediately.</p>
        </div>
      `;

    await this.send(to, subject, html);
  }

  async sendReport(to: string, subject: string, htmlContent: string): Promise<void> {
    await this.send(to, subject, htmlContent);
  }
}
