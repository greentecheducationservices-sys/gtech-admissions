import nodemailer from 'nodemailer';
import crypto from 'crypto';

const OTP_SECRET = process.env.OTP_SECRET || 'gtech-admissions-2026-secret-key';

const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'admin@gtechadmissions.com',
        pass: process.env.SMTP_PASS
    }
});

function createSignedOtpToken(email, purpose, code, expiresAt) {
    const payload = `${email.toLowerCase()}|${purpose}|${code}|${expiresAt}`;
    const sig = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64');
}

function verifySignedOtpToken(token, email, purpose, code) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [tokEmail, tokPurpose, tokCode, expiresAt, sig] = decoded.split('|');
        if (Date.now() > Number(expiresAt)) return false;
        if (tokEmail !== email.toLowerCase() || tokPurpose !== purpose || tokCode !== code) return false;

        const expectedPayload = `${tokEmail}|${tokPurpose}|${tokCode}|${expiresAt}`;
        const expectedSig = crypto.createHmac('sha256', OTP_SECRET).update(expectedPayload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    } catch {
        return false;
    }
}

// --- SHARED HTML LAYOUT WRAPPER ---
function wrapGtechEmailLayout({ badge, heading, bodyHtml }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f0f9ff;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #bae6fd;box-shadow:0 10px 25px rgba(2,132,199,0.08);">
                        <!-- Header -->
                        <tr>
                            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 55%,#0369a1 100%);padding:24px 28px;text-align:left;">
                                <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,0.14);color:#7dd3fc;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:8px;">
                                    ${badge}
                                </div>
                                <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-0.2px;">
                                    GTECH ADMISSIONS
                                </h1>
                                <p style="margin:3px 0 0;color:#bae6fd;font-size:12px;font-weight:600;">
                                    Admissions and Guidance Portal
                                </p>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:28px;">
                                <h2 style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">
                                    ${heading}
                                </h2>
                                ${bodyHtml}
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e2e8f0;text-align:center;">
                                <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#334155;">
                                    Gtech Admissions • GreenTech Education Consultancy and Services
                                </p>
                                <p style="margin:0;font-size:11px;color:#64748b;">
                                    Portal: <a href="https://gtechadmissions.com" style="color:#0284c7;text-decoration:none;font-weight:700;">gtechadmissions.com</a> • Support: admin@gtechadmissions.com
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

// --- BUILD SPECIFIC HTML TEMPLATES BY EVENT TYPE ---
function buildHtmlForEvent(eventType, details = {}, fallbackText = '') {
    // 1. NEW STUDENT REGISTRATION WELCOME
    if (eventType === 'new_student_registered') {
        const name = details.full_name || 'Student';
        const gtechId = details.student_id || details.id || 'GTECH6001';
        const email = details.email || '';

        return wrapGtechEmailLayout({
            badge: 'Registration Verified',
            heading: `Welcome to the Gtech Family, ${name}!`,
            bodyHtml: `
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                    Your student profile is now active on <strong>Gtech Admissions</strong>. Use your Gtech ID below to track scholarship evaluations, university admissions, and referrals.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f9ff;border:1px solid #7dd3fc;border-radius:14px;margin-bottom:18px;">
                    <tr>
                        <td style="padding:16px 20px;">
                            <div style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.6px;">Your Official Gtech ID &amp; Referral Code</div>
                            <div style="font-size:24px;font-weight:900;font-family:monospace;color:#1e1b4b;margin-top:4px;letter-spacing:1.5px;">${gtechId}</div>
                            <div style="font-size:12px;color:#475569;margin-top:6px;">Registered Email: <strong>${email}</strong></div>
                        </td>
                    </tr>
                </table>
                <div style="text-align:center;margin:22px 0 6px;">
                    <a href="https://gtechadmissions.com" style="display:inline-block;padding:12px 24px;background:linear-gradient(90deg,#4f46e5,#0284c7);color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;border-radius:12px;">
                        Open Student Portal
                    </a>
                </div>
            `
        });
    }

    // 2. SCHOLARSHIP OR VISITING APPLICATION SUBMITTED
    if (eventType === 'application_submitted') {
        const appType = details.assistance_type || 'Application';
        const marksHtml = [
            details.inter_1st_marks ? `Inter 1st Year: <strong>${details.inter_1st_marks}</strong>` : '',
            details.inter_2nd_marks ? `Inter 2nd Year: <strong>${details.inter_2nd_marks}</strong>` : '',
            details.inter_marks ? `Intermediate Total: <strong>${details.inter_marks}</strong>` : '',
            details.pcm_marks ? `PCM (600): <strong>${details.pcm_marks}</strong>` : '',
            details.eamcet_rank ? `EAMCET Rank: <strong>${details.eamcet_rank}</strong>` : ''
        ].filter(Boolean).join(' • ') || 'Not Provided';

        return wrapGtechEmailLayout({
            badge: 'Application Received',
            heading: `${appType} Submitted`,
            bodyHtml: `
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                    Hello <strong>${details.name || 'Student'}</strong>, we have received your <strong>${appType}</strong>. Our admissions expert will call you within <strong>10 minutes</strong>.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;font-size:13px;">
                    <tr>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;width:36%;">University</td>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#0f172a;">${details.uni || 'General Scholarship Pool'}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Interested Course</td>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${details.branch || '-'}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Contact Number</td>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${details.phone || '-'}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Academic Marks</td>
                        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#334155;">${marksHtml}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 14px;color:#64748b;">Current Status</td>
                        <td style="padding:10px 14px;">
                            <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:800;">
                                ${details.status || 'Pending Callback'}
                            </span>
                        </td>
                    </tr>
                </table>
            `
        });
    }

    // 3. APPLICATION APPROVAL / SCHOLARSHIP / REFERRAL STATUS UPDATE
    if (eventType === 'application_approved' || eventType === 'application_status_updated' || eventType === 'scholarship_status_updated' || eventType === 'referral_amount_updated') {
        const isApproved = eventType === 'application_approved' || String(details.status || details.scholarship_status || '').toLowerCase().includes('approv');
        const pillBg = isApproved ? '#dcfce7' : '#e0e7ff';
        const pillColor = isApproved ? '#166534' : '#3730a3';
        const statusLabel = details.status || details.scholarship_status || (eventType === 'referral_amount_updated' ? 'Referral Credited' : 'Updated');

        const extraRows = [];
        if (details.uni) {
            extraRows.push(`<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">University</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#0f172a;">${details.uni}</td></tr>`);
        }
        if (Number(details.scholarship_amount || 0) > 0) {
            extraRows.push(`<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Approved Scholarship</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:900;color:#15803d;font-size:15px;">₹${Number(details.scholarship_amount).toLocaleString('en-IN')}</td></tr>`);
        }
        if (Number(details.referral_earnings || 0) > 0 && eventType === 'referral_amount_updated') {
            extraRows.push(`<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Referral Amount</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:900;color:#4338ca;font-size:15px;">₹${Number(details.referral_earnings).toLocaleString('en-IN')}</td></tr>`);
        }

        return wrapGtechEmailLayout({
            badge: 'Portal Status Update',
            heading: isApproved ? 'Congratulations! Update Approved' : 'New Update on Your Student Portal',
            bodyHtml: `
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                    Hello <strong>${details.name || 'Student'}</strong>, there is a new update on your Gtech Admissions account:
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;font-size:13px;margin-bottom:18px;">
                    ${extraRows.join('')}
                    <tr>
                        <td style="padding:10px 14px;color:#64748b;width:38%;">Status</td>
                        <td style="padding:10px 14px;">
                            <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${pillBg};color:${pillColor};font-size:11px;font-weight:800;">
                                ${statusLabel}
                            </span>
                        </td>
                    </tr>
                </table>
                <div style="text-align:center;">
                    <a href="https://gtechadmissions.com" style="display:inline-block;padding:12px 24px;background:linear-gradient(90deg,#059669,#0284c7);color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;border-radius:12px;">
                        View in Student Portal
                    </a>
                </div>
            `
        });
    }

    // FALLBACK FOR ANY OTHER NOTIFICATION
    return wrapGtechEmailLayout({
        badge: 'Gtech Notification',
        heading: 'Admissions Portal Update',
        bodyHtml: `<p style="margin:0;font-size:14px;line-height:1.7;color:#334155;white-space:pre-line;">${fallbackText}</p>`
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    const { action, email, purpose, code, token, to, adminEmail, subject, text, eventType, details } = req.body || {};

    try {
        // 1. SEND 6-DIGIT OTP
        if (action === 'send-otp') {
            if (!email) return res.status(400).json({ message: 'Email is required' });
            const otpCode = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = Date.now() + 10 * 60 * 1000;
            const otpToken = createSignedOtpToken(email, purpose || 'login', otpCode, expiresAt);

            const otpHtml = wrapGtechEmailLayout({
                badge: purpose === 'register' ? 'Registration Verification' : 'Secure Login OTP',
                heading: 'Your 6-Digit Verification Code',
                bodyHtml: `
                    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">
                        Enter the 6-digit verification code below to complete your ${purpose === 'register' ? 'student registration' : 'student portal login'}:
                    </p>
                    <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1e1b4b;background:#f0f9ff;border:1px dashed #38bdf8;padding:16px 20px;border-radius:14px;text-align:center;margin:16px 0;font-family:monospace;">
                        ${otpCode}
                    </div>
                    <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
                        This OTP expires in <strong>10 minutes</strong>. Never share this code with anyone.
                    </p>
                `
            });

            await transporter.sendMail({
                from: `"Gtech Admissions" <${process.env.SMTP_USER || 'admin@gtechadmissions.com'}>`,
                to: email,
                subject: `Your Gtech Admissions OTP: ${otpCode}`,
                text: `Your Gtech Admissions verification code is: ${otpCode} (valid for 10 minutes).`,
                html: otpHtml
            });

            return res.status(200).json({ sent: true, otpToken });
        }

        // 2. VERIFY 6-DIGIT OTP
        if (action === 'verify-otp') {
            const isValid = verifySignedOtpToken(token, email, purpose || 'login', String(code || '').trim());
            if (!isValid) {
                return res.status(400).json({ verified: false, message: 'Invalid or expired OTP code.' });
            }
            return res.status(200).json({ verified: true });
        }

        // 3. SEND BRANDED HTML NOTIFICATIONS
        if (action === 'send-notification') {
            if (!to || !subject || !text) {
                return res.status(400).json({ message: 'Missing email fields' });
            }

            const html = buildHtmlForEvent(eventType, details, text);

            await transporter.sendMail({
                from: `"Gtech Admissions" <${process.env.SMTP_USER || 'admin@gtechadmissions.com'}>`,
                to,
                cc: adminEmail || undefined,
                subject,
                text,
                html
            });

            return res.status(200).json({ sent: true });
        }

        return res.status(400).json({ message: 'Invalid action' });
    } catch (error) {
        console.error('Hostinger SMTP Error:', error);
        return res.status(500).json({ message: error.message || 'Failed to send email' });
    }
}
