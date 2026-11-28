import crypto from 'crypto';
import nodemailer from 'nodemailer';

const OTP_SECRET = (process.env.OTP_SECRET || 'gtech-admissions-otp-secret-change-me').trim();
const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.hostinger.com').trim();
const SMTP_PORT = Number((process.env.SMTP_PORT || '465').trim());
const SMTP_USER = (process.env.SMTP_USER || 'admin@gtechadmissions.com').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gtechadmissions.com').trim();

function createTransporter() {
  if (!SMTP_PASS) {
    throw new Error('SMTP_PASS is not configured on the server.');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function generateSixDigitOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signOtpPayload({ email, purpose, code, expiresAt }) {
  const payloadObj = {
    email: String(email).trim().toLowerCase(),
    purpose: String(purpose).trim().toLowerCase(),
    code: String(code).trim(),
    expiresAt: Number(expiresAt),
  };
  const encoded = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', OTP_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyOtpToken({ token, email, purpose, code }) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'Missing or invalid OTP token.' };
  }
  const [encoded, providedSig] = token.split('.');
  if (!encoded || !providedSig) {
    return { valid: false, reason: 'Malformed OTP token.' };
  }

  const expectedSig = crypto
    .createHmac('sha256', OTP_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'Invalid OTP signature.' };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Corrupted OTP token.' };
  }

  if (Date.now() > Number(data.expiresAt || 0)) {
    return { valid: false, reason: 'OTP has expired. Please request a new OTP.' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPurpose = String(purpose || '').trim().toLowerCase();
  const normalizedCode = String(code || '').trim();

  if (
    data.email !== normalizedEmail ||
    data.purpose !== normalizedPurpose ||
    data.code !== normalizedCode
  ) {
    return { valid: false, reason: 'Invalid OTP code.' };
  }

  return { valid: true };
}

function buildStyledNotificationHtml({ subject, text, details }) {
  const rows = details && typeof details === 'object'
    ? Object.entries(details)
        .map(
          ([k, v]) => `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; font-size: 13px; text-transform: capitalize;">
                ${escapeHtml(String(k).replace(/_/g, ' '))}
              </td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600;">
                ${escapeHtml(v)}
              </td>
            </tr>`
        )
        .join('')
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);">
        <div style="background: linear-gradient(135deg, #0c2d57 0%, #0d6efd 55%, #16a34a 100%); padding: 20px 24px; color: #ffffff;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9;">
            Gtech Admissions • GreenTech Education Consultancy
          </div>
          <h2 style="margin: 6px 0 0; font-size: 19px; font-weight: 800;">
            ${escapeHtml(subject)}
          </h2>
        </div>

        <div style="padding: 22px 24px;">
          <p style="margin: 0 0 16px; color: #334155; font-size: 14px; line-height: 1.55;">
            ${escapeHtml(text)}
          </p>

          ${
            rows
              ? `<table style="width: 100%; border-collapse: collapse; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                  <tbody>${rows}</tbody>
                </table>`
              : ''
          }

          <p style="margin: 18px 0 0; font-size: 12px; color: #64748b;">
            Sent automatically by Gtech Admissions Portal.
          </p>
        </div>
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim().toLowerCase();

  try {
    if (action === 'send-otp') {
      const email = String(body.email || '').trim().toLowerCase();
      const purpose = String(body.purpose || 'login').trim().toLowerCase();
      const gtechId = String(body.gtechId || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ message: 'Please enter a valid email address.' });
      }

      const code = generateSixDigitOtp();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const otpToken = signOtpPayload({ email, purpose, code, expiresAt });

      const transporter = createTransporter();
      const purposeLabel = purpose === 'register' ? 'Registration' : 'Login';

      await transporter.sendMail({
        from: `"Gtech Admissions" <${SMTP_USER}>`,
        to: email,
        subject: `Your Gtech Admissions ${purposeLabel} OTP: ${code}${gtechId ? ` (${gtechId})` : ''}`,
        text: `Your OTP for Gtech Admissions ${purposeLabel} is ${code}. It is valid for 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f8fafc; padding: 24px;">
            <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);">
              <div style="background: linear-gradient(135deg, #0c2d57 0%, #0d6efd 55%, #16a34a 100%); padding: 20px 24px; color: #ffffff;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9;">
                  Gtech Admissions
                </div>
                <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 800;">
                  ${escapeHtml(purposeLabel)} Verification OTP
                </h2>
              </div>
              <div style="padding: 24px;">
                <p style="margin: 0 0 14px; color: #334155; font-size: 14px;">
                  Use the 6-digit OTP below to complete your <strong>${escapeHtml(purposeLabel)}</strong>:
                </p>
                <div style="font-size: 30px; font-weight: 800; letter-spacing: 8px; text-align: center; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; color: #0369a1;">
                  ${escapeHtml(code)}
                </div>
                ${
                  gtechId
                    ? `<p style="margin: 14px 0 0; font-size: 13px; color: #0f172a;">
                        <strong>Your Gtech ID:</strong> <span style="font-family: monospace; color: #4f46e5; font-weight: 800;">${escapeHtml(gtechId)}</span>
                      </p>`
                    : ''
                }
                <p style="margin: 14px 0 0; color: #64748b; font-size: 12px;">
                  This OTP is valid for 10 minutes. If you did not request this, please ignore this email.
                </p>
              </div>
            </div>
          </div>
        `,
      });

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        otpToken,
      });
    }

    if (action === 'verify-otp') {
      const { email, purpose, code, token } = body;
      const check = verifyOtpToken({ token, email, purpose, code });

      if (!check.valid) {
        return res.status(400).json({
          success: false,
          message: check.reason,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
      });
    }

    if (action === 'send-notification') {
      const to = String(body.to || ADMIN_EMAIL).trim();
      const adminEmail = body.adminEmail ? String(body.adminEmail).trim() : '';
      const subject = String(body.subject || 'Gtech Admissions Notification').trim();
      const text = String(body.text || '').trim();
      const details = body.details && typeof body.details === 'object' ? body.details : null;

      const transporter = createTransporter();

      const detailsLines = details
        ? '\n\nDetails:\n' +
          Object.entries(details)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')
        : '';

      const mailOptions = {
        from: `"Gtech Admissions" <${SMTP_USER}>`,
        to,
        subject,
        text: `${text}${detailsLines}`.trim(),
        html: buildStyledNotificationHtml({ subject, text, details }),
      };

      if (adminEmail && adminEmail.toLowerCase() !== to.toLowerCase()) {
        mailOptions.cc = adminEmail;
      }

      await transporter.sendMail(mailOptions);

      return res.status(200).json({
        success: true,
        message: 'Notification sent successfully',
      });
    }

    return res.status(400).json({ message: 'Invalid action' });
  } catch (err) {
    console.error('api/mail error:', err);
    return res.status(500).json({
      message: err?.message || 'Internal mail server error',
    });
  }
}
