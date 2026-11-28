import nodemailer from 'nodemailer';
import crypto from 'crypto';

const OTP_SECRET = process.env.OTP_SECRET || 'gtech-admissions-2026-secret-key';

function getMailConfig() {
    const host = (process.env.SMTP_HOST || 'smtp.hostinger.com').trim();
    const port = Number(process.env.SMTP_PORT || 465);
    const user = (process.env.SMTP_USER || 'admin@gtechadmissions.com').trim();
    const pass = process.env.SMTP_PASS || '';
    const from = (process.env.SMTP_FROM || user).trim();
    return { host, port, user, pass, from };
}

function createTransporter({ host, port, user, pass }) {
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
}

function createSignedOtpToken(email, purpose, code, expiresAt) {
    const payload = `${email.toLowerCase()}\vert{}${purpose}|${code}\vert{}${expiresAt}`;
    const sig = crypto.createHmac('sha256', OTP_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}\vert{}${sig}`).toString('base64');
}

function verifySignedOtpToken(token, email, purpose, code) {
    try {
        if (!token) return false;
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [tokEmail, tokPurpose, tokCode, expiresAt, sig] = decoded.split('|');
        if (!tokEmail || !tokPurpose || !tokCode || !expiresAt || !sig) return false;
        if (Date.now() > Number(expiresAt)) return false;
        if (tokEmail !== email.toLowerCase() || tokPurpose !== purpose || tokCode !== code) return false;

        const expectedPayload = `${tokEmail}\vert{}${tokPurpose}|${tokCode}\vert{}${expiresAt}`;
        const expectedSig = crypto.createHmac('sha256', OTP_SECRET).update(expectedPayload).digest('hex');
        const sigBuf = Buffer.from(sig, 'utf8');
        const expBuf = Buffer.from(expectedSig, 'utf8');
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
        return false;
    }
}

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
                        <tr>
                            <td style="padding:28px;">
                                <h2 style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">
                                    ${heading}
                                </h2>
                                ${bodyHtml}
                            </td>
                        </tr>
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

function buildOtpEmailHtml({ purpose, otpCode, name, gtechId, referral }) {
    return wrapGtechEmailLayout({
        badge: purpose === 'register' ? 'Registration Verification' : 'Secure Login OTP',
        heading: 'Your 6-Digit Verification Code',
        bodyHtml: `
            <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">
                Hello${name ? ` <strong>${name}</strong>` : ''}, enter the 6-digit verification code below to complete your ${purpose === 'register' ? 'student registration' : 'student portal login'}:
            </p>
            <div style="font-size:30px;font-weight:900;letter-spacing:8px;color:#1e1b4b;background:#f0f9ff;border:1px dashed #38bdf8;padding:16px 20px;border-radius:14px;text-align:center;margin:16px 0;font-family:monospace;">
                ${otpCode}
            </div>
            ${gtechId ? `<p style="margin:4px 0;font-size:12px;color:#334155;"><strong>Gtech ID:</strong> ${gtechId}</p>` : ''}
            ${referral ? `<p style="margin:4px 0;font-size:12px;color:#334155;"><strong>Referral Code:</strong> ${referral}</p>` : ''}
            <p style="margin:12px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
                This OTP expires in <strong>10 minutes</strong>. Never share this code with anyone.
            </p>
        `
    });
}

function buildHtmlForEvent(eventType, details = {}, fallbackText = '') {
    if (eventType === 'new_student_registered' || eventType === 'NEW_REGISTRATION_ALERT') {
        const name = details.full_name || details.name || 'Student';
        const gtechId = details.student_id || details.id || details.gtechId || 'GTECH6001';
        const email = details.email || '';
        const referral = details.referral || details.referred_by_code || '';

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
                            <div style="font-size:12px;color:#475569;margin-top:6px;">Registered Email: <strong>${email}</strong></div>${referral ? `<div style="font-size:12px;color:#0f766e;margin-top:4px;">Referral Code Used: <strong>${referral}</strong></div>` : ''}
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

    if (eventType === 'application_submitted') {
        const appType = details.assistance_type || 'Application';
        const marksHtml = [
            details.inter_1st_marks ? `Inter 1st Year: <strong>${details.inter_1st_marks}</strong>` : '',
            details.inter_2nd_marks ? `Inter 2nd Year: <strong>${details.inter_2nd_marks}</strong>` : '',
            details.inter_marks ? `Intermediate Total: <strong>${details.inter_marks}</strong>` : '', details.pcm_marks ? `PCM (600): <strong>${details.pcm_marks}</strong>` : '',
            details.eamcet_rank ? `EAMCET Rank: <strong>${details.eamcet_rank}</strong>` : '' ].filter(Boolean).join(' • ') \vert{}\vert{} 'Not Provided';  return wrapGtechEmailLayout({ badge: 'Application Received', heading: `${appType} Submitted`,
            bodyHtml: `
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                    Hello <strong>${details.name \vert{}\vert{} 'Student'}</strong>, we have received your <strong>${appType}</strong>. Our admissions expert will call you within <strong>10 minutes</strong>.
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

    if (
        eventType === 'application_approved' ||
        eventType === 'application_status_updated' ||
        eventType === 'scholarship_status_updated' ||
        eventType === 'referral_amount_updated'
    ) {
        const isApproved =
            eventType === 'application_approved' ||
            String(details.status || details.scholarship_status || '').toLowerCase().includes('approv');
        const pillBg = isApproved ? '#dcfce7' : '#e0e7ff';
        const pillColor = isApproved ? '#166534' : '#3730a3';
        const statusLabel =
            details.status ||
            details.scholarship_status ||
            (eventType === 'referral_amount_updated' ? 'Referral Credited' : 'Updated');

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
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }

    const config = getMailConfig();
    if (!config.pass) {
        return res.status(500).json({
            ok: false,
            code: 'MISSING_SMTP_PASS',
            message: 'SMTP_PASS is missing in Vercel Environment Variables. Add it and redeploy.'
        });
    }

    let body = {};
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
        return res.status(400).json({ ok: false, message: 'Invalid JSON request body.' });
    }

    const {
        action,
        type,
        email,
        purpose,
        code,
        otp,
        token,
        to,
        adminEmail,
        ccAdmin,
        subject,
        text,
        eventType,
        details,
        name,
        phone,
        referral,
        gtechId
    } = body;

    const resolvedAction =
        action ||
        (otp || String(type || '').toUpperCase().includes('OTP') ? 'send-otp' : 'send-notification');

    const resolvedPurpose =
        purpose ||
        (String(type || '').toUpperCase().includes('REG') ? 'register' : 'login');

    const targetEmail = String(email || to || '').trim().toLowerCase();

    try {
        const transporter = createTransporter(config);

        if (resolvedAction === 'send-otp') {
            if (!targetEmail) {
                return res.status(400).json({ ok: false, message: 'Email is required' });
            }

            const otpCode = String(otp || Math.floor(100000 + Math.random() * 900000)).trim();
            const expiresAt = Date.now() + 10 * 60 * 1000;
            const otpToken = createSignedOtpToken(targetEmail, resolvedPurpose, otpCode, expiresAt);

            const otpHtml = buildOtpEmailHtml({
                purpose: resolvedPurpose,
                otpCode,
                name,
                gtechId,
                referral
            });

            await transporter.sendMail({
                from: `"Gtech Admissions" <${config.from}>`,
                to: targetEmail,
                subject: subject || `Your Gtech Admissions OTP: ${otpCode}`,
                text: `Your Gtech Admissions verification code is: ${otpCode} (valid for 10 minutes).`,
                html: otpHtml
            });

            return res.status(200).json({ ok: true, sent: true, otpToken });
        }

        if (resolvedAction === 'verify-otp') {
            const codeToCheck = String(code || otp || '').trim();
            const isValid = verifySignedOtpToken(token, targetEmail, resolvedPurpose, codeToCheck);
            if (!isValid) {
                return res.status(400).json({ ok: false, verified: false, message: 'Invalid or expired OTP code.' });
            }
            return res.status(200).json({ ok: true, verified: true });
        }

        if (resolvedAction === 'send-notification') {
            const fallbackText =
                text ||
                [
                    `Gtech Admissions Event: ${eventType \vert{}\vert{} type \vert{}\vert{} 'Update'}`, name ? `Name: ${name}` : '',
                    phone ? `Phone: ${phone}` : '', targetEmail ? `Email: ${targetEmail}` : '',
                    gtechId ? `Gtech ID: ${gtechId}` : '',
                    referral ? `Referral Code: ${referral}` : ''
                ]
                    .filter(Boolean)
                    .join('\n');

            if (!targetEmail || !fallbackText) {
                return res.status(400).json({ ok: false, message: 'Missing email fields' });
            }

            const resolvedSubject =
                subject ||
                `Gtech Admissions Update${gtechId ? ` (${gtechId})` : ''}`;

            const mergedDetails = {
                ...(details && typeof details === 'object' ? details : {}),
                ...(name ? { name: details?.name || name } : {}),
                ...(phone ? { phone: details?.phone || phone } : {}),
                ...(targetEmail ? { email: details?.email || targetEmail } : {}),
                ...(gtechId ? { gtechId: details?.gtechId || gtechId } : {}),
                ...(referral ? { referral: details?.referral || referral } : {})
            };

            const html = buildHtmlForEvent(eventType || type, mergedDetails, fallbackText);
            const ccTarget = ccAdmin === false ? undefined : (adminEmail || undefined);

            await transporter.sendMail({
                from: `"Gtech Admissions" <${config.from}>`, to: targetEmail, ...(ccTarget ? { cc: ccTarget } : {}), subject: resolvedSubject, text: fallbackText, html });  return res.status(200).json({ ok: true, sent: true }); }  return res.status(400).json({ ok: false, message: 'Invalid action' }); } catch (error) { console.error('Hostinger SMTP Error:', { message: error?.message, code: error?.code, response: error?.response }); return res.status(500).json({ ok: false, code: error?.code \vert{}\vert{} null, message: error?.message \vert{}\vert{} 'Failed to send email' }); } } ```  ### 2. `app.js`  ```javascript const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co'; const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i'; var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);  const ADMIN_EMAIL = 'admin@gtechadmissions.com'; const OTP_BACKEND_URL = window.GTECH_OTP_API \vert{}\vert{} '/api/mail'; const MAIL_NOTIFY_URL = window.GTECH_MAIL_API \vert{}\vert{} '/api/mail'; const EARLY_OFFER_DEADLINE_ISO = '2027-03-16T23:59:59+05:30';  const SCH_OPTION_LABELS = { inter: { optionText: 'Inter Marks (\%)', inputLabel: 'Enter Inter Marks (\%)', placeholder: 'e.g. 95' }, pcm: { optionText: 'PCM Marks (\%)', inputLabel: 'Enter PCM Marks (\%)', placeholder: 'e.g. 92' }, mains: { optionText: 'JEE Marks / Percentile (\%)', inputLabel: 'Enter JEE Marks / Percentile (\%)', placeholder: 'e.g. 88.5' }, eamcet: { optionText: 'AP EAMCET Rank', inputLabel: 'Enter AP EAMCET Rank', placeholder: 'e.g. 12500' } };  const CRITERIA_DISPLAY_LABELS = { inter: 'Inter \%', pcm: 'PCM \%', mains: 'JEE \%', eamcet: 'EAMCET Rank' };  const state = { stateFilter: 'ALL', universities: [], inquiries: [], referredStudents: [], currentStudent: null, authUser: null, financeRecord: null, pendingRegistration: null, pendingLoginEmail: '', otpTokens: { register: '', login: '' }, pendingPostLoginAction: null, currentSlide: 0, incomingReferralCode: '', activeDashboardTab: 'dashboard', regCooldownTimer: null, loginCooldownTimer: null, cardScores: {}, lastScholarshipOffer: null, budgetPerYear: null };  function syncPageScreenVisibility(forceShowHome = false) { const authScreen = document.getElementById('auth-first-screen'); const homeContent = document.getElementById('home-page-content'); if (!authScreen && !homeContent) return;  const hasSession = Boolean(state.currentStudent \vert{}\vert{} localStorage.getItem('gtech_student_session')); if (forceShowHome \vert{}\vert{} hasSession) { authScreen?.classList.add('hidden'); homeContent?.classList.remove('hidden'); } else { authScreen?.classList.remove('hidden'); homeContent?.classList.add('hidden'); } }  function hideAddedMarksBudgetFilterBar() { const stateBar = document.getElementById('state-filter-bar'); if (stateBar) { stateBar.classList.remove('hidden'); stateBar.style.display = 'flex'; let parent = stateBar.parentElement; while (parent && parent !== document.body && parent.id !== 'home-page-content') { parent.classList.remove('hidden'); parent = parent.parentElement; } stateBar.querySelectorAll('.state-btn').forEach(btn => { btn.classList.remove('hidden'); btn.style.display = 'inline-flex'; }); }  const idsToHide = [ 'instant-scholarship-checker', 'home-cards-filter-section', 'marks-budget-filter-bar', 'sch-filter-bar', 'global-scholarship-filter' ];  idsToHide.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }); }  function reorderFilterButtonsEntranceFirst() { const entranceBtn = document.querySelector('.state-btn[data-state="Entrance Exams"]'); const allBtn = document.querySelector('.state-btn[data-state="ALL"]'); if (entranceBtn && allBtn && entranceBtn.parentNode === allBtn.parentNode) { allBtn.parentNode.insertBefore(entranceBtn, allBtn); } }  function isBeforeMarch16_2027(dateObj = new Date()) { return dateObj.getTime() <= new Date(EARLY_OFFER_DEADLINE_ISO).getTime(); }  function getUniKey(uni, fallbackIdx = 0) { return String(uni?.id ?? uni?.name ?? `uni_${fallbackIdx}`);
}

function formatINR(value) {
    const num = Number(value || 0);
    return `₹${num.toLocaleString('en-IN')}`; }  function normalizeScholarshipConfig(uni) { let raw = uni?.scholarship_rules ?? uni?.scholarships ?? uni?.scholarship_config ?? null; if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }  let parsedBranches = uni?.branches; if (typeof parsedBranches === 'string') { try { parsedBranches = JSON.parse(parsedBranches); } catch (_) { parsedBranches = null; } }  const slabs = Array.isArray(raw?.slabs) ? raw.slabs : (Array.isArray(raw?.rules) ? raw.rules : (Array.isArray(raw) ? raw : []));  const branchScholarships = Array.isArray(raw?.branch_scholarships) ? raw.branch_scholarships : (Array.isArray(raw?.branchRules) ? raw.branchRules : []);  const byBranchObj = (raw?.branch_scholarships_by_branch && typeof raw.branch_scholarships_by_branch === 'object') ? raw.branch_scholarships_by_branch : {};  if (parsedBranches && typeof parsedBranches === 'object') { const entries = Array.isArray(parsedBranches) ? parsedBranches.map(item => [item?.branch \vert{}\vert{} item?.name, item]) : Object.entries(parsedBranches);  entries.forEach(([bKey, bVal]) => { if (!bKey \vert{}\vert{} !bVal \vert{}\vert{} typeof bVal !== 'object') return; const bRules = Array.isArray(bVal.slabs) ? bVal.slabs : (Array.isArray(bVal.scholarships) ? bVal.scholarships : (Array.isArray(bVal.rules) ? bVal.rules : [])); if (bRules.length > 0) { const existing = Array.isArray(byBranchObj[bKey]) ? byBranchObj[bKey] : []; byBranchObj[bKey] = [...existing, ...bRules.map(r => ({ ...r, branch: r.branch \vert{}\vert{} bKey }))]; } }); }  if (!raw \vert{}\vert{} typeof raw !== 'object') { const hasBranchRules = Object.keys(byBranchObj).length > 0; if (!hasBranchRules && !uni?.extra_concession_text && !uni?.expert_phone) return null; return { enabled: hasBranchRules, multi_mode: 'best_of', slabs: [], branch_scholarships: [], branch_scholarships_by_branch: byBranchObj, extra_concession_text: String(uni?.extra_concession_text \vert{}\vert{} '').trim(), expert_phone: String(uni?.expert_phone \vert{}\vert{} '').trim() }; }  const hasRules = raw.enabled === true \vert{}\vert{} slabs.length > 0 \vert{}\vert{} branchScholarships.length > 0 \vert{}\vert{} Object.keys(byBranchObj).length > 0 \vert{}\vert{} Boolean(raw.extra_concession_text \vert{}\vert{} uni?.extra_concession_text);  return { ...raw, enabled: hasRules, multi_mode: raw.multi_mode \vert{}\vert{} 'best_of', slabs, branch_scholarships: branchScholarships, branch_scholarships_by_branch: byBranchObj, extra_concession_text: String(raw.extra_concession_text \vert{}\vert{} uni?.extra_concession_text \vert{}\vert{} '').trim(), expert_phone: String(raw.expert_phone \vert{}\vert{} uni?.expert_phone \vert{}\vert{} '').trim() }; }  function parseScholarshipRules(rawRulesOrUni) { if (!rawRulesOrUni) return null; if (typeof rawRulesOrUni === 'object' && ('name' in rawRulesOrUni \vert{}\vert{} 'branches' in rawRulesOrUni \vert{}\vert{} 'scholarship_rules' in rawRulesOrUni)) { return normalizeScholarshipConfig(rawRulesOrUni); } return normalizeScholarshipConfig({ scholarship_rules: rawRulesOrUni }); }  function getBranchRulesListForUni(uni, targetBranch = '') { const rules = normalizeScholarshipConfig(uni) \vert{}\vert{} {}; const collected = [];  const addRule = (r, fallbackBranch = '') => { if (!r \vert{}\vert{} typeof r !== 'object') return; const bName = String(r.branch \vert{}\vert{} fallbackBranch \vert{}\vert{} '').trim(); if (!bName \vert{}\vert{} bName.toUpperCase() === 'ALL') return;  const minVal = Number(r.min ?? r.min_percent ?? r.minPercentage ?? r.from ?? 0); const maxVal = Number(r.max ?? r.max_percent ?? r.maxPercentage ?? r.to ?? 100); const val = Number(r.value ?? r.discount ?? r.percentage ?? r.amount ?? r.concession ?? 0); const type = r.type \vert{}\vert{} (r.amount && !r.percentage ? 'flat' : 'percent'); const criterion = String(r.criterion \vert{}\vert{} r.criteria \vert{}\vert{} 'inter').trim().toLowerCase();  const isDup = collected.some( item => item.branch.toLowerCase() === bName.toLowerCase() && item.criterion === criterion && Number(item.min) === minVal && Number(item.max) === maxVal && Number(item.value) === val && item.type === type );  if (!isDup) { collected.push({ ...r, branch: bName, criterion, min: minVal, max: maxVal, value: val, type, note: r.note \vert{}\vert{} r.label \vert{}\vert{} '' }); } };  if (Array.isArray(rules.branch_scholarships)) { rules.branch_scholarships.forEach(r => addRule(r)); }  if (rules.branch_scholarships_by_branch && typeof rules.branch_scholarships_by_branch === 'object') { Object.entries(rules.branch_scholarships_by_branch).forEach(([bKey, listOrObj]) => { const items = Array.isArray(listOrObj) ? listOrObj : (listOrObj && typeof listOrObj === 'object' ? [listOrObj] : []); items.forEach(r => addRule(r, bKey)); }); }  if (Array.isArray(rules.slabs)) { rules.slabs.forEach(s => addRule(s)); }  if (!targetBranch) return collected; const cleanTarget = String(targetBranch).trim().toLowerCase(); return collected.filter(r => String(r.branch \vert{}\vert{} '').trim().toLowerCase() === cleanTarget); }  function formatRuleBenefit(rule) { const val = Number(rule?.value \vert{}\vert{} 0); if (rule?.type === 'flat') return `${formatINR(val)}/yr Off`;
    return `${val}% Tuition Off`;
}

function formatRuleRange(rule) {
    const critLabel = CRITERIA_DISPLAY_LABELS[String(rule?.criterion || 'inter').toLowerCase()] || String(rule?.criterion || '').toUpperCase();
    const minVal = rule?.min ?? 0;
    const maxVal = rule?.max ?? 100;
    return `${critLabel} ${minVal}–${maxVal}`;
}

function buildScholarshipBreakdownHtml(uni, chosenBranch = '') {
    const rules = parseScholarshipRules(uni);
    if (!rules) return '';

    const slabs = Array.isArray(rules.slabs) ? rules.slabs : [];
    const branchRules = getBranchRulesListForUni(uni);
    const activeBranchRules = chosenBranch ? getBranchRulesListForUni(uni, chosenBranch) : [];
    const extraNote = String(rules.extra_concession_text || '').trim();
    const expertPhone = String(rules.expert_phone || '').trim();

    if (!rules.enabled && branchRules.length === 0 && !extraNote && !expertPhone) {
        return '';
    }

    const slabsHtml = rules.enabled && slabs.length > 0
        ? `<div class="space-y-1">
            <span class="text-[10px] font-black uppercase tracking-wider text-purple-900 block">Scholarship Slabs (${String(rules.multi_mode || 'best_of').replace('_', ' ')})</span>
            <div class="space-y-1">
                ${slabs.map(s => {
                    const scopeTag = s.branch && s.branch !== 'ALL' ? `[${s.branch}] ` : '[All Branches] ';
                    const benefit = formatRuleBenefit(s);
                    const rangeText = formatRuleRange(s);
                    return `
                        <div class="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-purple-100 text-[10px]">
                            <span class="font-bold text-slate-800">${scopeTag}${s.note ? `${s.note} • ` : ''}<span class="font-mono text-purple-800">${rangeText}</span></span>
                            <strong class="text-emerald-700 shrink-0">${benefit}</strong>
                        </div>
                    `;
                }).join('')}
            </div>
           </div>`
        : '';

    const branchBreakdownHtml = branchRules.length > 0
        ? `<div class="space-y-1 pt-1.5 border-t border-purple-200/70">
            <span class="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
                Branch-Wise Scholarship Breakdown ${chosenBranch ? `(Highlighting ${chosenBranch})` : ''}
            </span>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                ${branchRules.map(br => {
                    const isHighlighted = chosenBranch && String(br.branch).toLowerCase() === String(chosenBranch).toLowerCase();
                    return `
                        <div class="flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-[10px] ${isHighlighted ? 'bg-indigo-100/90 border border-indigo-300' : 'bg-white border border-indigo-100'}">
                            <span class="font-bold text-slate-900">${br.branch} <span class="font-mono font-normal text-indigo-800">(${formatRuleRange(br)})</span>${br.note ? ` • ${br.note}` : ''}</span>
                            <strong class="text-emerald-700 shrink-0">${formatRuleBenefit(br)}</strong>
                        </div>
                    `;
                }).join('')}
            </div>
           </div>`
        : '';

    const chosenBranchNoticeHtml = chosenBranch && activeBranchRules.length > 0
        ? `<div class="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-950">
            <i class="fa-solid fa-check-circle text-emerald-600 mr-1"></i>
            ${chosenBranch} Scholarship: ${activeBranchRules.map(r => `${formatRuleRange(r)} → ${formatRuleBenefit(r)}${r.note ? ` (${r.note})` : ''}`).join(' | ')}
           </div>`
        : '';

    const extraFooterHtml = (extraNote || expertPhone)
        ? `<div class="pt-1.5 border-t border-purple-200/70 flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-purple-950">
            ${extraNote ? `<span><i class="fa-solid fa-tag text-purple-700 mr-1"></i>${extraNote}</span>` : '<span></span>'}
            ${expertPhone ? `<span class="font-mono text-indigo-800"><i class="fa-solid fa-phone mr-1"></i>${expertPhone}</span>` : ''}
           </div>`
        : '';

    return `
        <div class="mt-3 p-3 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
            ${slabsHtml}${chosenBranchNoticeHtml}
            ${branchBreakdownHtml}${extraFooterHtml}
        </div>
    `;
}

function getAllowedCriteriaForUni(uni) {
    const rules = parseScholarshipRules(uni) || {};
    const rawList = Array.isArray(rules.allowed_criteria)
        ? rules.allowed_criteria
        : (Array.isArray(rules.criteria) ? rules.criteria : []);

    const normalized = rawList
        .map(c => String(c || '').trim().toLowerCase())
        .map(c => (c === 'jee' || c === 'jee_mains' ? 'mains' : c))
        .filter(c => ['inter', 'pcm', 'mains', 'eamcet'].includes(c));

    if (normalized.length > 0) {
        return Array.from(new Set(normalized));
    }

    if (rules.single_marks_mode || rules.inter_only || rules.only_inter) {
        return ['inter'];
    }

    if (Array.isArray(rules.slabs) && rules.slabs.length > 0) {
        const slabCriteria = [];
        rules.slabs.forEach(s => {
            const c1 = String(s.criterion || '').trim().toLowerCase();
            if (['inter', 'pcm', 'mains', 'eamcet'].includes(c1)) slabCriteria.push(c1);
            const c2 = String(s.criterion2 || '').trim().toLowerCase();
            if (['inter', 'pcm', 'mains', 'eamcet'].includes(c2)) slabCriteria.push(c2);
        });
        if (slabCriteria.length > 0) {
            return Array.from(new Set(slabCriteria));
        }
    }

    return ['inter', 'pcm', 'mains'];
}

function handleGlobalBudgetChange(rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (!trimmed) {
        state.budgetPerYear = null;
    } else {
        const parsed = Number(trimmed);
        state.budgetPerYear = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
    renderUniversities();
}

function applyGlobalMarksFilter() {
    renderUniversities();
}

function clearGlobalMarksFilter() {
    state.budgetPerYear = null;
    state.lastScholarshipOffer = null;
    state.cardScores = {};
    renderUniversities();
}

function handleScholarshipOptionChange() {
    const opt = document.getElementById('sch-option-select')?.value || 'inter';
    const labelEl = document.getElementById('sch-value-label');
    const inputEl = document.getElementById('sch-score-input');
    const meta = SCH_OPTION_LABELS[opt] || SCH_OPTION_LABELS.inter;

    if (labelEl) labelEl.textContent = meta.inputLabel;
    if (inputEl) inputEl.placeholder = meta.placeholder;
}

function checkStudentScholarship() {
    renderUniversities();
}

function openScholarshipCongratsModal() {
    const offer = state.lastScholarshipOffer;
    const modal = document.getElementById('sch-congrats-modal');
    if (!offer || !modal) return;

    const fourYrTotal = Number(offer.fourYearFee ?? (offer.finalFee * 4));

    document.getElementById('modal-sch-uni-name').textContent = offer.uniName;
    document.getElementById('modal-sch-branch-name').textContent = `${offer.branchName} • ${SCH_OPTION_LABELS[offer.optionKey]?.optionText \vert{}\vert{} 'Marks'}:${offer.score}`;
    document.getElementById('modal-actual-fee').textContent = `${formatINR(offer.actualFee)}/yr (${formatINR(offer.actualFee * 4)} / 4 Years)`;
    document.getElementById('modal-sch-badge-label').textContent = `You Got Scholarship (${offer.label})`; document.getElementById('modal-sch-discount').textContent = `- ${formatINR(offer.discount)}/yr`;
    document.getElementById('modal-final-fee').textContent = `${formatINR(offer.finalFee)}/yr \vert{} 4 Years Fee:${formatINR(fourYrTotal)}`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeScholarshipCongratsModal() {
    const modal = document.getElementById('sch-congrats-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function proceedWithScholarshipApplication() {
    const offer = state.lastScholarshipOffer;
    closeScholarshipCongratsModal();
    openScholarshipModal(offer?.uniName || '', 'Scholarship Based on Marks');
}

async function sendMailNotification({ to, ccAdmin = true, subject, text, eventType = 'student_update', details = {} }) {
    const payload = {
        action: 'send-notification',
        to: to || ADMIN_EMAIL,
        adminEmail: ccAdmin ? ADMIN_EMAIL : null,
        ccAdmin: Boolean(ccAdmin),
        subject,
        text,
        eventType,
        details,
        timestamp: new Date().toISOString()
    };

    if (MAIL_NOTIFY_URL) {
        try {
            const res = await fetch(MAIL_NOTIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.ok === false) {
                console.warn('Mail endpoint warning:', body.message || res.status);
                return false;
            }
            return true;
        } catch (err) {
            console.warn('Mail notification request warning:', err.message);
            return false;
        }
    }

    return false;
}

function sanitizeNumericInput(inputEl, maxLength = 15) {
    if (!inputEl) return;
    const cleaned = String(inputEl.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }
}

function calculateIntermediateTotal() {
    const firstYearRaw = document.getElementById('guide-inter-1st')?.value || '';
    const secondYearRaw = document.getElementById('guide-inter-2nd')?.value || '';
    const totalEl = document.getElementById('guide-inter-total');
    if (!totalEl) return;

    if (!firstYearRaw && !secondYearRaw) {
        totalEl.value = '';
        return;
    }

    const total = Number(firstYearRaw || 0) + Number(secondYearRaw || 0);
    totalEl.value = String(total);
}

function getOtpCodeFromBoxes(className) {
    const boxes = Array.from(document.querySelectorAll(`.${className}`)); return boxes.map(b => String(b.value \vert{}\vert{} '').replace(/\D/g, '')).join(''); }  function clearOtpBoxes(className) { document.querySelectorAll(`.${className}`).forEach(box => {
        box.value = '';
    });
}

function handleOtpBoxInput(box, group, index) {
    const cls = group === 'reg' ? 'reg-otp-box' : 'login-otp-box';
    const cleaned = String(box.value || '').replace(/\D/g, '').slice(0, 1);
    box.value = cleaned;

    const boxes = Array.from(document.querySelectorAll(`.${cls}`)); if (cleaned && index < boxes.length - 1) { boxes[index + 1].focus(); } }  function handleOtpBoxKeydown(event, group, index) { const cls = group === 'reg' ? 'reg-otp-box' : 'login-otp-box'; const boxes = Array.from(document.querySelectorAll(`.${cls}`));

    if (event.key === 'Backspace' && !boxes[index].value && index > 0) {
        boxes[index - 1].focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
        boxes[index - 1].focus();
    } else if (event.key === 'ArrowRight' && index < boxes.length - 1) {
        boxes[index + 1].focus();
    }
}

function startOtpCountdown(type, seconds = 60) {
    const isReg = type === 'reg';
    const labelEl = document.getElementById(isReg ? 'reg-otp-timer-label' : 'login-otp-timer-label');
    const resendBtn = document.getElementById(isReg ? 'btn-resend-reg-otp' : 'btn-resend-login-otp');

    if (isReg && state.regCooldownTimer) clearInterval(state.regCooldownTimer);
    if (!isReg && state.loginCooldownTimer) clearInterval(state.loginCooldownTimer);

    let remaining = seconds;
    if (resendBtn) resendBtn.disabled = true;
    if (labelEl) labelEl.textContent = `Resend in ${remaining}s`;

    const interval = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
            if (labelEl) labelEl.textContent = `Resend in ${remaining}s`; } else { clearInterval(interval); if (labelEl) labelEl.textContent = 'Ready to resend'; if (resendBtn) resendBtn.disabled = false; } }, 1000);  if (isReg) { state.regCooldownTimer = interval; } else { state.loginCooldownTimer = interval; } }  async function generateNextGtechId() { let maxNumber = 6000; try { const { data } = await _supabase .from('student_profiles') .select('id, student_id');  if (Array.isArray(data)) { data.forEach(row => { [row.student_id, row.id].forEach(val => { const match = String(val \vert{}\vert{} '').toUpperCase().match(/^GTECH(\d+)$/); if (match) { const num = parseInt(match[1], 10); if (!Number.isNaN(num) && num > maxNumber) { maxNumber = num; } } }); }); } } catch (err) { console.warn('Sequence check note:', err.message); }  const lastLocal = parseInt(localStorage.getItem('gtech_last_seq_num') \vert{}\vert{} '6000', 10); if (!Number.isNaN(lastLocal) && lastLocal > maxNumber) { maxNumber = lastLocal; }  const nextNum = maxNumber + 1; localStorage.setItem('gtech_last_seq_num', String(nextNum)); return `GTECH${nextNum}`;
}

function detectIncomingReferralLink() {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam) {
        const cleanCode = refParam.trim().toUpperCase();
        state.incomingReferralCode = cleanCode;
        localStorage.setItem('gtech_incoming_ref', cleanCode);
    } else {
        const savedRef = localStorage.getItem('gtech_incoming_ref');
        if (savedRef) state.incomingReferralCode = savedRef;
    }

    if (state.incomingReferralCode) {
        const banner = document.getElementById('referral-applied-banner');
        const bannerCode = document.getElementById('banner-ref-code');
        if (banner && bannerCode) {
            bannerCode.textContent = state.incomingReferralCode;
            banner.classList.remove('hidden');
        }
        const regRefInput = document.getElementById('reg-referral');
        if (regRefInput && !regRefInput.value) {
            regRefInput.value = state.incomingReferralCode;
        }
        const firstRegRefInput = document.getElementById('first-reg-referral');
        if (firstRegRefInput && !firstRegRefInput.value) {
            firstRegRefInput.value = state.incomingReferralCode;
        }
    }
}

let toastTimeout;
function showToast(title, message, type = 'success') {
    const toast = document.getElementById('gtech-toast');
    const icon = document.getElementById('gtech-toast-icon');
    const titleEl = document.getElementById('gtech-toast-title');
    const msgEl = document.getElementById('gtech-toast-msg');

    if (!toast) return;

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (type === 'error') {
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-rose-300 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '!';
    } else {
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-emerald-300 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '✓';
    }

    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        hideToast();
    }, 5500);
}

function hideToast() {
    const toast = document.getElementById('gtech-toast');
    if (toast) toast.classList.add('hidden');
}

function openEarlyOfferModal(gtechId) {
    const modal = document.getElementById('early-offer-center-modal');
    const idEl = document.getElementById('offer-popup-gtech-id');
    if (!modal) return;
    if (idEl && gtechId) {
        idEl.textContent = gtechId;
    }
    closeAuthModal();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeEarlyOfferModal() {
    const modal = document.getElementById('early-offer-center-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    continueAfterAuth();
}

function nextSlide() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;
    const slidesCount = carousel.children.length;
    if (slidesCount <= 1) return;
    state.currentSlide = (state.currentSlide + 1) % slidesCount;
    carousel.style.transform = `translateX(-${state.currentSlide * 100}\%)`; }  function prevSlide() { const carousel = document.getElementById('about-carousel'); if (!carousel) return; const slidesCount = carousel.children.length; if (slidesCount <= 1) return; state.currentSlide = (state.currentSlide - 1 + slidesCount) \% slidesCount; carousel.style.transform = `translateX(-${state.currentSlide * 100}%)`;
}

async function loadActiveCarousel() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;

    const { data, error } = await _supabase
        .from('carousel_images')
        .select('*')
        .order('id', { ascending: true });

    const defaultSlides = [
        {
            id: 1,
            image_url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1600&auto=format&fit=crop',
            title: 'Gtech Carousel Slide 1'
        },
        {
            id: 2,
            image_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1600&auto=format&fit=crop',
            title: 'Gtech Carousel Slide 2'
        }
    ];

    const validAdminSlides = (!error && Array.isArray(data))
        ? data
            .filter(row => row.is_active !== false)
            .map(row => ({
                ...row,
                resolvedUrl: row.image_url || row.url || row.image || ''
            }))
            .filter(row => row.resolvedUrl)
        : [];

    let slides = validAdminSlides.length > 0
        ? validAdminSlides
        : defaultSlides.map(s => ({ ...s, resolvedUrl: s.image_url }));

    if (slides.length === 1) {
        slides.push({ ...slides[0] });
    }

    state.currentSlide = 0;
    carousel.style.transform = 'translateX(0%)';
    carousel.innerHTML = slides.map(slide => `
        <div class="w-full h-full shrink-0 relative">
            <img src="${slide.resolvedUrl}" class="w-full h-full object-cover object-center" alt="${slide.title || 'Gtech Banner'}">
        </div>
    `).join('');
}

function isEntranceExamOnlyMode(uni) {
    const mode = String(uni?.admission_type || '').trim().toLowerCase();
    return mode.includes('entrance exam only');
}

function getUniversityStates(uni) {
    if (Array.isArray(uni?.states) && uni.states.length > 0) {
        return uni.states.map(s => String(s || '').trim()).filter(Boolean);
    }
    if (typeof uni?.states === 'string' && uni.states.trim()) {
        return uni.states.split(',').map(s => s.trim()).filter(Boolean);
    }
    return uni?.state ? [String(uni.state).trim()] : [];
}

function getUniversityCampuses(uni) {
    if (Array.isArray(uni?.campuses) && uni.campuses.length > 0) {
        return uni.campuses.map(c => String(c || '').trim()).filter(Boolean);
    }
    if (typeof uni?.campuses === 'string' && uni.campuses.trim()) {
        return uni.campuses.split(',').map(c => c.trim()).filter(Boolean);
    }
    return [];
}

function parseBranchesObject(rawBranches) {
    if (!rawBranches) return {};
    let data = rawBranches;

    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (_) {
            return {};
        }
    }

    if (Array.isArray(data)) {
        const out = {};
        data.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const name = String(item.branch || item.name || item.title || '').trim();
            const fee = Number(item.fee ?? item.tuition_fee ?? item.yearly_fee ?? item.amount ?? 0);
            if (name) out[name] = Number.isFinite(fee) ? fee : 0;
        });
        return out;
    }

    if (data && typeof data === 'object') {
        const out = {};
        Object.entries(data).forEach(([key, val]) => {
            const cleanKey = String(key || '').trim();
            if (!cleanKey) return;
            if (typeof val === 'number' || typeof val === 'string') {
                const num = Number(String(val).replace(/[^\d.]/g, ''));
                out[cleanKey] = Number.isFinite(num) ? num : 0;
            } else if (val && typeof val === 'object') {
                const num = Number(val.fee ?? val.tuition_fee ?? val.yearly_fee ?? val.amount ?? 0);
                out[cleanKey] = Number.isFinite(num) ? num : 0;
            }
        });
        return out;
    }

    return {};
}

function matchesStateFilter(uni, selectedFilter) {
    const mode = String(uni?.admission_type || 'Direct Admission Only');
    const states = getUniversityStates(uni).map(s => s.toLowerCase());

    if (!selectedFilter || selectedFilter === 'ALL') return true;
    if (selectedFilter === 'Entrance Exams') {
        return mode.toLowerCase().includes('entrance exam') || states.includes('entrance exams');
    }

    const target = String(selectedFilter).toLowerCase();

    if (states.includes(target)) return true;
    if (target.includes('chennai') || target.includes('tamil nadu')) {
        return states.some(s => s.includes('chennai') || s.includes('tamil nadu'));
    }
    if (target.includes('karnataka') || target.includes('bangalore')) {
        return states.some(s => s.includes('karnataka') || s.includes('bangalore'));
    }
    if (target === 'uttar pradesh' || target === 'up') {
        return states.some(s => s === 'up' || s.includes('uttar pradesh'));
    }
    if (target === 'madhya pradesh' || target === 'mp') {
        return states.some(s => s === 'mp' || s.includes('madhya pradesh'));
    }
    return false;
}

function matchesBudgetFilter(uni, fallbackIdx = 0) {
    const maxBudget = state.budgetPerYear;
    if (maxBudget === null || maxBudget === undefined || !Number.isFinite(Number(maxBudget)) || Number(maxBudget) <= 0) {
        return true;
    }
    if (isEntranceExamOnlyMode(uni)) {
        return state.stateFilter === 'Entrance Exams';
    }
    const effectiveFee = getEffectiveYearlyFeeForSort(uni, fallbackIdx);
    if (!Number.isFinite(effectiveFee) || effectiveFee === Number.POSITIVE_INFINITY) {
        return false;
    }
    return effectiveFee <= Number(maxBudget);
}

function populateCampusSelectForUniversity(uniName) {
    const wrap = document.getElementById('guide-campus-wrap');
    const select = document.getElementById('guide-campus');
    if (!wrap || !select) return;

    const cleanName = String(uniName || '').trim().toLowerCase();
    const matchedUni = state.universities.find(u => String(u.name || '').trim().toLowerCase() === cleanName);
    const campuses = matchedUni ? getUniversityCampuses(matchedUni) : [];

    if (campuses.length > 0) {
        select.innerHTML = campuses
            .map(c => `<option value="${String(c).replace(/"/g, '&quot;')}">${c}</option>`)
            .join('');
        wrap.classList.remove('hidden');
    } else {
        select.innerHTML = '';
        wrap.classList.add('hidden');
    }
}

function evaluateUniversityScholarship(uni, studentScores = {}) {
    const rules = parseScholarshipRules(uni) || {};
    const baseTuition = Number(studentScores.selectedFee || 0);
    const allowedCriteria = getAllowedCriteriaForUni(uni);
    const chosenBranch = String(studentScores.branch || '').trim().toLowerCase();

    const filteredScores = {
        inter: allowedCriteria.includes('inter') ? studentScores.inter : '',
        pcm: allowedCriteria.includes('pcm') ? studentScores.pcm : '',
        mains: allowedCriteria.includes('mains') ? studentScores.mains : '',
        eamcet: allowedCriteria.includes('eamcet') ? studentScores.eamcet : ''
    };

    const candidateRules = [];
    if (rules.enabled && Array.isArray(rules.slabs)) {
        rules.slabs.forEach(slab => {
            const slabBranch = String(slab.branch || 'ALL').trim().toLowerCase();
            if (slabBranch && slabBranch !== 'all' && chosenBranch && slabBranch !== chosenBranch) {
                return;
            }
            candidateRules.push(slab);
        });
    }

    const branchRules = getBranchRulesListForUni(uni, studentScores.branch || '');
    branchRules.forEach(br => candidateRules.push(br));

    if (candidateRules.length === 0) {
        return {
            matchedSlabs: [],
            discountAmount: 0,
            netTuition: baseTuition,
            fourYearTuition: baseTuition * 4,
            breakdownText: '',
            extraConcessionText: String(rules.extra_concession_text || '').trim(),
            expertPhone: String(rules.expert_phone || '').trim()
        };
    }

    const mode = rules.multi_mode || 'best_of';
    const matched = [];

    candidateRules.forEach(slab => {
        const c1 = String(slab.criterion || '').toLowerCase();
        if (!allowedCriteria.includes(c1)) return;

        const s1 = Number(filteredScores[c1]);
        if (!Number.isFinite(s1) || s1 <= 0) return;

        const min1 = Number(slab.min ?? 0);
        const max1 = Number(slab.max ?? 100);
        if (s1 < min1 || s1 > max1) return;

        if (slab.criterion2) {
            const c2 = String(slab.criterion2 || '').toLowerCase();
            if (!allowedCriteria.includes(c2)) return;
            const s2 = Number(filteredScores[c2]);
            if (!Number.isFinite(s2) || s2 <= 0) return;
            const min2 = Number(slab.min2 ?? 0);
            const max2 = Number(slab.max2 ?? 100);
            if (s2 < min2 || s2 > max2) return;
        }

        const rawVal = Number(slab.value || 0);
        const amount = slab.type === 'flat'
            ? rawVal
            : Math.round((baseTuition * rawVal) / 100);

        matched.push({ slab, amount });
    });

    if (matched.length === 0) {
        return {
            matchedSlabs: [],
            discountAmount: 0,
            netTuition: baseTuition,
            fourYearTuition: baseTuition * 4,
            breakdownText: '',
            extraConcessionText: String(rules.extra_concession_text || '').trim(),
            expertPhone: String(rules.expert_phone || '').trim()
        };
    }

    if (mode === 'stackable') {
        const bestByCriterion = {};
        matched.forEach(item => {
            const key = item.slab.criterion;
            if (!bestByCriterion[key] || item.amount > bestByCriterion[key].amount) {
                bestByCriterion[key] = item;
            }
        });
        const winners = Object.values(bestByCriterion);
        const total = Math.min(baseTuition > 0 ? baseTuition : Infinity, winners.reduce((sum, w) => sum + w.amount, 0));
        const net = Math.max(0, baseTuition - total);
        const labels = winners.map(w => {
            const bTag = w.slab.branch && w.slab.branch !== 'ALL' ? `${w.slab.branch} ` : ''; return `${bTag}${String(w.slab.criterion).toUpperCase()} (${w.slab.type === 'flat' ? formatINR(w.slab.value) : w.slab.value + '%'})`;
        });
        return {
            matchedSlabs: winners.map(w => w.slab),
            discountAmount: total,
            netTuition: net,
            fourYearTuition: net * 4,
            breakdownText: `Combined Merit + Entrance: ${labels.join(' + ')}`,
            extraConcessionText: String(rules.extra_concession_text || '').trim(),
            expertPhone: String(rules.expert_phone || '').trim()
        };
    }

    matched.sort((a, b) => b.amount - a.amount);
    const top = matched[0];
    const cappedDiscount = baseTuition > 0 ? Math.min(baseTuition, top.amount) : top.amount;
    const net = Math.max(0, baseTuition - cappedDiscount);
    const branchPrefix = top.slab.branch && top.slab.branch !== 'ALL' ? `${top.slab.branch} • ` : ''; const label = top.slab.criterion2 ? `${branchPrefix}${String(top.slab.criterion).toUpperCase()} +${String(top.slab.criterion2).toUpperCase()} Qualified`
        : `${branchPrefix}${String(top.slab.criterion).toUpperCase()} Merit Slab`;

    return {
        matchedSlabs: [top.slab],
        discountAmount: cappedDiscount,
        netTuition: net,
        fourYearTuition: net * 4,
        breakdownText: label,
        extraConcessionText: String(rules.extra_concession_text || '').trim(),
        expertPhone: String(rules.expert_phone || '').trim()
    };
}

function getApplicationFeeForSort(uni) {
    const fee = Number(uni?.application_fee);
    return Number.isFinite(fee) && fee >= 0 ? fee : Number.POSITIVE_INFINITY;
}

function getEffectiveYearlyFeeForSort(uni, fallbackIdx = 0) {
    if (isEntranceExamOnlyMode(uni)) {
        return getApplicationFeeForSort(uni);
    }

    const branches = parseBranchesObject(uni.branches);
    const fees = Object.values(branches).map(v => Number(v || 0)).filter(n => n > 0);
    if (fees.length === 0) return Number.POSITIVE_INFINITY;

    const uniKey = getUniKey(uni, fallbackIdx);
    const scoreState = getCardScoreState(uniKey, branches);
    const chosenBranchFee = Number(branches[scoreState.branch] ?? 0);
    const activeBaseFee = chosenBranchFee > 0 ? chosenBranchFee : Math.min(...fees);

    const hasAnyScore = Boolean(
        scoreState.inter || scoreState.pcm || scoreState.mains || scoreState.eamcet
    );

    if (hasAnyScore) {
        const evalRes = evaluateUniversityScholarship(uni, {
            branch: scoreState.branch,
            selectedFee: activeBaseFee,
            inter: scoreState.inter,
            pcm: scoreState.pcm,
            mains: scoreState.mains,
            eamcet: scoreState.eamcet
        });
        if (evalRes.discountAmount > 0) {
            return evalRes.netTuition;
        }
    }

    return activeBaseFee;
}

function getCardScoreState(uniKey, branchesObj = {}) {
    if (!state.cardScores[uniKey]) {
        const firstBranch = Object.keys(branchesObj)[0] || '';
        state.cardScores[uniKey] = {
            branch: firstBranch,
            inter: '',
            pcm: '',
            mains: '',
            eamcet: ''
        };
    } else if ((!state.cardScores[uniKey].branch || !(state.cardScores[uniKey].branch in branchesObj)) && Object.keys(branchesObj).length > 0) {
        state.cardScores[uniKey].branch = Object.keys(branchesObj)[0];
    }
    return state.cardScores[uniKey];
}

function updateCardScoreAndRefresh(uniKey, field, rawValue) {
    const current = state.cardScores[uniKey] || {};
    current[field] = rawValue;
    state.cardScores[uniKey] = current;
    if (field === 'branch') {
        renderUniversities();
        return;
    }
    refreshSingleUniversityCalcUI(uniKey);
}

function refreshSingleUniversityCalcUI(uniKey) {
    const uni = state.universities.find((u, idx) => getUniKey(u, idx) === uniKey);
    const calcBox = document.getElementById(`uni-calc-box-${CSS.escape(uniKey)}`);
    if (!uni || !calcBox) return;

    const branchesObj = parseBranchesObject(uni.branches);
    const scoreState = getCardScoreState(uniKey, branchesObj);
    const selectedFee = Number(branchesObj[scoreState.branch] ?? Object.values(branchesObj)[0] ?? 0);

    const evalRes = evaluateUniversityScholarship(uni, {
        branch: scoreState.branch,
        selectedFee,
        inter: scoreState.inter,
        pcm: scoreState.pcm,
        mains: scoreState.mains,
        eamcet: scoreState.eamcet
    });

    const allowedCriteria = getAllowedCriteriaForUni(uni);
    const hasAnyScore = allowedCriteria.some(c => Boolean(scoreState[c]));

    const previewPrompt = allowedCriteria.length === 1 && allowedCriteria[0] === 'inter'
        ? 'Enter Inter % to preview'
        : 'Enter marks/JEE to preview';

    if (!hasAnyScore && evalRes.discountAmount === 0) {
        calcBox.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-indigo-900">
                <span>Chosen Branch (${scoreState.branch || 'Selected'}): <strong>${formatINR(selectedFee)}/yr</strong> • 4 Years Fee: <strong>${formatINR(selectedFee * 4)}</strong></span>
                <span class="font-bold text-indigo-700">${previewPrompt}</span>
            </div>
            ${evalRes.extraConcessionText ? `<p class="text-[10px] text-emerald-800 font-bold mt-1">Extra Concession Note: ${evalRes.extraConcessionText}</p>` : ''}
        `;
        return;
    }

    calcBox.innerHTML = `
        <div class="space-y-1 text-[11px]">
            <div class="flex items-center justify-between">
                <span class="text-slate-600 font-semibold">Chosen Branch (${scoreState.branch || 'Selected'}):</span>
                <span class="font-bold text-slate-900">${formatINR(selectedFee)}/yr (${formatINR(selectedFee * 4)} / 4 Years)</span>
            </div>
            <div class="flex items-center justify-between">
                <span class="text-emerald-800 font-bold">You Got Scholarship (${evalRes.breakdownText || 'Merit Slab'}):</span>
                <span class="font-black text-emerald-700">-${formatINR(evalRes.discountAmount)}/yr</span>
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-indigo-200/80 text-xs">
                <span class="font-black text-indigo-950">Tuition Per Year / 4 Years Fee:</span>
                <span class="font-black text-indigo-700">${formatINR(evalRes.netTuition)}/yr • ${formatINR(evalRes.fourYearTuition)}</span>
            </div>
            ${evalRes.extraConcessionText ? `<p class="text-[10px] text-emerald-900 font-bold bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 mt-1"><i class="fa-solid fa-tag mr-1"></i>${evalRes.extraConcessionText}</p>` : ''}
        </div>
    `;
}

async function fetchUniversitiesFromSupabase() {
    const { data, error } = await _supabase.from('universities').select('*');
    if (error) {
        console.error('Error fetching universities:', error.message);
        return;
    }
    state.universities = data || [];
    renderUniversities();
}

async function fetchInquiriesFromSupabase() {
    const { data, error } = await _supabase.from('inquiries').select('*').order('created_at', { ascending: false });
    if (!error) state.inquiries = data || [];
}

function setStateFilter(stateName) {
    reorderFilterButtonsEntranceFirst();
    state.stateFilter = stateName;
    document.querySelectorAll('.state-btn').forEach(btn => {
        if (btn.getAttribute('data-state') === stateName) {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white shadow-sm transition whitespace-nowrap shrink-0';
        } else if (btn.getAttribute('data-state') === 'Entrance Exams') {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-sky-50 transition whitespace-nowrap shrink-0';
        }
    });

    const apBar = document.getElementById('ap-quota-filter-bar');
    if (apBar) {
        apBar.classList.toggle('hidden', stateName !== 'Andhra Pradesh');
    }

    renderUniversities();
}

function renderUniversities() {
    hideAddedMarksBudgetFilterBar();
    reorderFilterButtonsEntranceFirst();

    const grid = document.getElementById('universities-grid');
    const searchInput = document.getElementById('uni-search');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    const filteredWithMeta = state.universities
        .map((uni, idx) => ({ uni, idx }))
        .filter(({ uni, idx }) => {
            if (state.stateFilter === 'ALL' && isEntranceExamOnlyMode(uni)) {
                return false;
            }
            const matchesState = matchesStateFilter(uni, state.stateFilter);
            const matchesBudget = matchesBudgetFilter(uni, idx);
            const statesText = getUniversityStates(uni).join(' ').toLowerCase();
            const campusesText = getUniversityCampuses(uni).join(' ').toLowerCase();
            const entranceExamText = String(uni.entrance_exam_name || '').toLowerCase();
            const branchesObj = parseBranchesObject(uni.branches);
            const branchesText = Object.keys(branchesObj).join(' ').toLowerCase();

            const matchesQuery =
                !query ||
                String(uni.name || '').toLowerCase().includes(query) ||
                (uni.location && uni.location.toLowerCase().includes(query)) ||
                (uni.address && uni.address.toLowerCase().includes(query)) ||
                statesText.includes(query) ||
                campusesText.includes(query) ||
                entranceExamText.includes(query) ||
                branchesText.includes(query);
            return matchesState && matchesBudget && matchesQuery;
        })
        .sort((a, b) => {
            const isExamA = isEntranceExamOnlyMode(a.uni);
            const isExamB = isEntranceExamOnlyMode(b.uni);

            if (state.stateFilter === 'Entrance Exams') {
                const appFeeA = getApplicationFeeForSort(a.uni);
                const appFeeB = getApplicationFeeForSort(b.uni);
                if (appFeeA !== appFeeB) return appFeeA - appFeeB;
                return String(a.uni.name || '').localeCompare(String(b.uni.name || ''));
            }

            if (state.stateFilter === 'ALL' && isExamA !== isExamB) {
                return isExamA ? 1 : -1;
            }

            if (isExamA && isExamB) {
                const appFeeA = getApplicationFeeForSort(a.uni);
                const appFeeB = getApplicationFeeForSort(b.uni);
                if (appFeeA !== appFeeB) return appFeeA - appFeeB;
                return String(a.uni.name || '').localeCompare(String(b.uni.name || ''));
            }

            const feeA = getEffectiveYearlyFeeForSort(a.uni, a.idx);
            const feeB = getEffectiveYearlyFeeForSort(b.uni, b.idx);
            if (feeA !== feeB) return feeA - feeB;
            return String(a.uni.name || '').localeCompare(String(b.uni.name || ''));
        });

    if (!grid) return;

    if (filteredWithMeta.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-sky-100">
                <p class="text-slate-600 font-semibold text-xs">No universities match your filter or budget range.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredWithMeta.map(({ uni, idx }) => {
        const uniKey = getUniKey(uni, idx);
        const statesList = getUniversityStates(uni);
        const statesDisplay = statesList.join(' • ') || uni.state || 'India';
        const campusesList = getUniversityCampuses(uni);
        const isAP = statesList.some(s => s.toLowerCase() === 'andhra pradesh');
        const mode = String(uni.admission_type || 'Direct Admission Only');
        const isExamOnly = isEntranceExamOnlyMode(uni);
        const isEntranceAndDirect = mode === 'Entrance Exam & Direct Admission';

        const safeUniName = String(uni.name || '').replace(/'/g, "\\'");
        const safeUniKey = String(uniKey).replace(/'/g, "\\'");

        const campusPills = campusesList.length > 0
            ? `<div class="mt-2.5 flex flex-wrap gap-1.5">
                ${campusesList.map(c => `<span class="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-200"><i class="fa-solid fa-location-dot text-sky-600 mr-1"></i>${c}</span>`).join('')}
               </div>`
            : '';

        if (isExamOnly) {
            return `
                <div class="bg-white rounded-3xl border border-indigo-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-indigo-300 transition duration-300 flex flex-col justify-between">
                    <div>
                        <div class="relative aspect-[16/9] w-full overflow-hidden bg-indigo-50">
                            <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-transparent to-transparent"></div>
                            <span class="absolute top-2.5 left-2.5 px
