import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface InvoiceEmailData {
  invoiceNumber: string;
  businessName: string;
  clientName: string;
  issueDate: string;
  dueDate?: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  currency: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  notes?: string;
  language: string;
}

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

  // ─── Core send method with Resend primary + SMTP fallback ───

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
        this.logger.error(`Resend failed for ${to}, trying SMTP fallback: ${err}`);
        // Fall through to SMTP
      }
    }

    // Try SMTP (fallback)
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

  // ─── Email Verification ───

  async sendVerificationEmail(to: string, token: string, nameOrLocale?: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;
    const isHe = nameOrLocale === 'he';

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

  // ─── Two-Factor Authentication Code ───

  async sendTwoFactorCode(to: string, code: string, method: string): Promise<void> {
    const isHe = method === 'he' || method === 'email'; // locale or method
    // Determine locale from method param (backwards compatible)
    const locale = method === 'he' ? 'he' : 'en';
    const isHeLocale = locale === 'he';

    const subject = isHeLocale ? 'קוד אימות - Our Money' : 'Your verification code - Our Money';
    const html = isHeLocale
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

  // ─── Login Alert ───

  async sendLoginAlert(to: string, ip: string, userAgent: string): Promise<void> {
    const time = new Date().toLocaleString('en-US');
    const timeHe = new Date().toLocaleString('he-IL');

    // We send bilingual alert since we don't know the user's locale at this point
    const subject = 'Login alert / התראת התחברות - Our Money';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New login to your account</h2>
        <p>A new login was detected on your Our Money account:</p>
        <ul>
          <li>IP Address: <strong>${ip}</strong></li>
          <li>Time: <strong>${time}</strong></li>
          <li>Device: <strong>${userAgent || 'Unknown'}</strong></li>
        </ul>
        <p>If this wasn't you, please change your password immediately.</p>
        <hr style="margin: 24px 0;" />
        <div dir="rtl">
          <h2>התחברות חדשה לחשבון שלכם</h2>
          <p>זוהתה התחברות חדשה לחשבון Our Money שלכם:</p>
          <ul>
            <li>כתובת IP: <strong>${ip}</strong></li>
            <li>זמן: <strong>${timeHe}</strong></li>
            <li>מכשיר: <strong>${userAgent || 'לא ידוע'}</strong></li>
          </ul>
          <p>אם זה לא אתם, אנא שנו את הסיסמה מיידית.</p>
        </div>
      </div>
    `;

    await this.send(to, subject, html);
  }

  // ─── Send Invoice to Client ───

  async sendInvoice(to: string, invoiceData: InvoiceEmailData): Promise<void> {
    const isHe = invoiceData.language === 'he';
    const dir = isHe ? 'rtl' : 'ltr';
    const currencySymbol = this.getCurrencySymbol(invoiceData.currency);

    const itemsHtml = invoiceData.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${item.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: ${isHe ? 'left' : 'right'};">${currencySymbol}${item.unitPrice.toLocaleString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: ${isHe ? 'left' : 'right'};">${currencySymbol}${item.amount.toLocaleString()}</td>
        </tr>`,
      )
      .join('');

    const subject = isHe
      ? `חשבונית מס מספר ${invoiceData.invoiceNumber} מ-${invoiceData.businessName}`
      : `Invoice #${invoiceData.invoiceNumber} from ${invoiceData.businessName}`;

    const html = isHe
      ? `
        <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1F2937; margin-bottom: 4px;">חשבונית מס</h1>
            <p style="color: #6B7280; font-size: 14px;">מספר: ${invoiceData.invoiceNumber}</p>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
            <div>
              <p style="font-weight: bold; margin-bottom: 4px;">מאת:</p>
              <p style="color: #4B5563;">${invoiceData.businessName}</p>
            </div>
            <div>
              <p style="font-weight: bold; margin-bottom: 4px;">עבור:</p>
              <p style="color: #4B5563;">${invoiceData.clientName}</p>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <p><strong>תאריך הפקה:</strong> ${invoiceData.issueDate}</p>
            ${invoiceData.dueDate ? `<p><strong>תאריך לתשלום:</strong> ${invoiceData.dueDate}</p>` : ''}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background: #F3F4F6;">
                <th style="padding: 8px; text-align: right;">תיאור</th>
                <th style="padding: 8px; text-align: center;">כמות</th>
                <th style="padding: 8px; text-align: left;">מחיר ליחידה</th>
                <th style="padding: 8px; text-align: left;">סכום</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="text-align: left; margin-bottom: 24px;">
            <p>סכום לפני מע"מ: <strong>${currencySymbol}${invoiceData.subtotal.toLocaleString()}</strong></p>
            <p>מע"מ (${invoiceData.vatRate}%): <strong>${currencySymbol}${invoiceData.vatAmount.toLocaleString()}</strong></p>
            <p style="font-size: 18px; color: #4F46E5;">סה"כ לתשלום: <strong>${currencySymbol}${invoiceData.total.toLocaleString()}</strong></p>
          </div>

          ${invoiceData.notes ? `<div style="background: #F9FAFB; padding: 12px; border-radius: 6px; margin-bottom: 16px;"><p style="color: #6B7280; font-size: 13px;">${invoiceData.notes}</p></div>` : ''}

          <p style="color: #9CA3AF; font-size: 12px; text-align: center;">חשבונית זו הופקה באמצעות Our Money</p>
        </div>
      `
      : `
        <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #1F2937; margin-bottom: 4px;">Tax Invoice</h1>
            <p style="color: #6B7280; font-size: 14px;">Number: ${invoiceData.invoiceNumber}</p>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
            <div>
              <p style="font-weight: bold; margin-bottom: 4px;">From:</p>
              <p style="color: #4B5563;">${invoiceData.businessName}</p>
            </div>
            <div>
              <p style="font-weight: bold; margin-bottom: 4px;">To:</p>
              <p style="color: #4B5563;">${invoiceData.clientName}</p>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <p><strong>Issue Date:</strong> ${invoiceData.issueDate}</p>
            ${invoiceData.dueDate ? `<p><strong>Due Date:</strong> ${invoiceData.dueDate}</p>` : ''}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background: #F3F4F6;">
                <th style="padding: 8px; text-align: left;">Description</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Unit Price</th>
                <th style="padding: 8px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="text-align: right; margin-bottom: 24px;">
            <p>Subtotal: <strong>${currencySymbol}${invoiceData.subtotal.toLocaleString()}</strong></p>
            <p>VAT (${invoiceData.vatRate}%): <strong>${currencySymbol}${invoiceData.vatAmount.toLocaleString()}</strong></p>
            <p style="font-size: 18px; color: #4F46E5;">Total: <strong>${currencySymbol}${invoiceData.total.toLocaleString()}</strong></p>
          </div>

          ${invoiceData.notes ? `<div style="background: #F9FAFB; padding: 12px; border-radius: 6px; margin-bottom: 16px;"><p style="color: #6B7280; font-size: 13px;">${invoiceData.notes}</p></div>` : ''}

          <p style="color: #9CA3AF; font-size: 12px; text-align: center;">This invoice was generated by Our Money</p>
        </div>
      `;

    await this.send(to, subject, html);
  }

  // ─── Generic send (for reports, etc.) ───

  async sendReport(to: string, subject: string, htmlContent: string): Promise<void> {
    await this.send(to, subject, htmlContent);
  }

  // ─── Helpers ───

  private getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      ILS: '\u20AA',
      USD: '$',
      EUR: '\u20AC',
      GBP: '\u00A3',
      JPY: '\u00A5',
      CHF: 'CHF ',
      CAD: 'C$',
      AUD: 'A$',
    };
    return symbols[currency] || `${currency} `;
  }
}
