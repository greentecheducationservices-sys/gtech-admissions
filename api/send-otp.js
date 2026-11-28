export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON request body' });
  }

  const cleanEmail = String(body.email || '').trim().toLowerCase();
  const cleanName = String(body.name || 'Student').trim();
  const providedOtp = String(body.otp || '').replace(/\D+/g, '').trim();
  const cleanOtp = /^\d{6}$/.test(providedOtp)
    ? providedOtp
    : String(Math.floor(100000 + Math.random() * 900000));

  if (!cleanEmail) {
    return res.status(400).json({ ok: false, error: 'Email is required' });
  }

  const token = String(process.env.HOSTINGER_MAIL_TOKEN || '').trim();
  const mailboxId = String(process.env.HOSTINGER_MAILBOX_ID || '').trim();

  if (!token || !mailboxId) {
    return res.status(500).json({
      ok: false,
      error: 'Missing HOSTINGER_MAIL_TOKEN or HOSTINGER_MAILBOX_ID in Vercel environment variables',
    });
  }

  try {
    const endpoint = `https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/send`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [cleanEmail],
        displayName: 'GTech Admissions',
        subject: `${cleanOtp} is your GTech Admissions Verification Code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h2 style="color: #1e3a8a; margin: 0 0 12px;">GTech Admissions Verification</h2>
            <p style="color: #334155; font-size: 14px; margin: 0 0 10px;">Hi ${cleanName},</p>
            <p style="color: #334155; font-size: 14px; margin: 0 0 18px;">Enter this 6-digit OTP to verify your email and complete your registration:</p>
            <div style="background: #eff6ff; border: 1px dashed #2563eb; padding: 16px; text-align: center; border-radius: 8px; margin: 18px 0;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1d4ed8;">${cleanOtp}</span>
            </div>
            <p style="color: #64748b; font-size: 12px; margin: 0;">This code is valid for 10 minutes.</p>
          </div>
        `,
        text: `Hi ${cleanName}, your GTech Admissions OTP is ${cleanOtp}. Valid for 10 minutes.`,
      }),
    });

    const rawText = await response.text();
    let parsed = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {}

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: 'Failed to send OTP email via Hostinger Mail API',
        details: parsed,
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      otp: providedOtp ? undefined : cleanOtp,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Server error sending OTP',
    });
  }
}
