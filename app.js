const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Optional backend endpoint for server-side OTP generation, rate limiting & custom SMTP email sending.
// When empty, falls back to Supabase email OTP authentication.
const OTP_BACKEND_URL = window.GTECH_OTP_API || '';

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    currentStudent: null,
    authUser: null,
    financeRecord: null,
    pendingRegistration: null,
    pendingLoginEmail: '',
    currentSlide: 0,
    incomingReferralCode: '',
    regCooldownTimer: null,
    loginCooldownTimer: null,
    regCooldownSeconds: 0,
    loginCooldownSeconds: 0
};

window.onload = async function() {
    detectIncomingReferralLink();
    listenToAuthChanges();
    await restoreStudentSession();
    await fetchUniversitiesFromSupabase();
    await fetchInquiriesFromSupabase();
    await loadActiveCarousel();

    setInterval(() => {
        nextSlide();
    }, 4500);
};

// --- NUMERIC KEYBOARD & INPUT SANITIZATION ---
function sanitizeNumericInput(inputEl, maxLength = 15) {
    if (!inputEl) return;
    const cleaned = String(inputEl.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }
}

function getOtpCodeFromBoxes(className) {
    const boxes = Array.from(document.querySelectorAll(`.${className}`));
    return boxes.map(b => String(b.value || '').replace(/\D/g, '')).join('');
}

function clearOtpBoxes(className) {
    document.querySelectorAll(`.${className}`).forEach(box => {
        box.value = '';
    });
}

function handleOtpBoxInput(box, group, index) {
    const cls = group === 'reg' ? 'reg-otp-box' : 'login-otp-box';
    const cleaned = String(box.value || '').replace(/\D/g, '').slice(0, 1);
    box.value = cleaned;

    const boxes = Array.from(document.querySelectorAll(`.${cls}`));
    if (cleaned && index < boxes.length - 1) {
        boxes[index + 1].focus();
    }
}

function handleOtpBoxKeydown(event, group, index) {
    const cls = group === 'reg' ? 'reg-otp-box' : 'login-otp-box';
    const boxes = Array.from(document.querySelectorAll(`.${cls}`));

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
            if (labelEl) labelEl.textContent = `Resend in ${remaining}s`;
        } else {
            clearInterval(interval);
            if (labelEl) labelEl.textContent = 'OTP expired or ready to resend';
            if (resendBtn) resendBtn.disabled = false;
        }
    }, 1000);

    if (isReg) {
        state.regCooldownTimer = interval;
        state.regCooldownSeconds = seconds;
    } else {
        state.loginCooldownTimer = interval;
        state.loginCooldownSeconds = seconds;
    }
}

// --- REFERRAL CODE CAPTURE (FOR REGISTRATION FIELD) ---
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
    }
}

// --- TOAST NOTIFICATIONS ---
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
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-900 border border-rose-500/60 text-white shadow-2xl shadow-rose-500/10 sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '!';
    } else {
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-900 border border-emerald-500/60 text-white shadow-2xl shadow-emerald-500/10 sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '✓';
    }

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        hideToast();
    }, 4500);
}

function hideToast() {
    const toast = document.getElementById('gtech-toast');
    if (toast) toast.classList.add('hidden');
}

// --- CAROUSEL ---
function nextSlide() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;
    const slidesCount = carousel.children.length;
    if (slidesCount <= 1) return;
    state.currentSlide = (state.currentSlide + 1) % slidesCount;
    carousel.style.transform = `translateX(-${state.currentSlide * 100}%)`;
}

function prevSlide() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;
    const slidesCount = carousel.children.length;
    if (slidesCount <= 1) return;
    state.currentSlide = (state.currentSlide - 1 + slidesCount) % slidesCount;
    carousel.style.transform = `translateX(-${state.currentSlide * 100}%)`;
}

async function loadActiveCarousel() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;

    const { data, error } = await _supabase
        .from('carousel_images')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true });

    const defaultSlides = [
        {
            id: 1,
            image_url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1600&auto=format&fit=crop',
            title: 'GTech Carousel Slide 1'
        },
        {
            id: 2,
            image_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1600&auto=format&fit=crop',
            title: 'GTech Carousel Slide 2'
        }
    ];

    let slides = (!error && data && data.length > 0) ? [...data] : defaultSlides;
    if (slides.length === 1) {
        slides.push(defaultSlides[1]);
    }

    state.currentSlide = 0;
    carousel.style.transform = 'translateX(0%)';
    carousel.innerHTML = slides.map(slide => `
        <div class="w-full h-full shrink-0 relative">
            <img src="${slide.image_url}" class="w-full h-full object-cover object-center" alt="${slide.title || 'GTech Banner'}">
        </div>
    `).join('');
}

// --- UNIVERSITIES & CATALOG ---
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
    state.stateFilter = stateName;
    document.querySelectorAll('.state-btn').forEach(btn => {
        if (btn.getAttribute('data-state') === stateName) {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-900 border border-blue-800 text-blue-100 hover:bg-blue-800 transition whitespace-nowrap shrink-0';
        }
    });
    renderUniversities();
}

function renderUniversities() {
    const grid = document.getElementById('universities-grid');
    const searchInput = document.getElementById('uni-search');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    const filtered = state.universities.filter(uni => {
        let matchesState = true;
        if (state.stateFilter === 'Entrance Exams') {
            matchesState = uni.admission_type === 'Entrance Exam Required';
        } else if (state.stateFilter === 'Application Only') {
            matchesState = uni.admission_type === 'Application Only';
        } else if (state.stateFilter !== 'ALL') {
            matchesState = uni.state === state.stateFilter;
        }

        const matchesQuery =
            uni.name.toLowerCase().includes(query) ||
            (uni.location && uni.location.toLowerCase().includes(query)) ||
            (uni.address && uni.address.toLowerCase().includes(query)) ||
            uni.state.toLowerCase().includes(query);
        return matchesState && matchesQuery;
    });

    if (!grid) return;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center bg-blue-900 rounded-2xl border border-blue-800">
                <p class="text-blue-200/80 font-semibold text-xs">No universities match your filter in this category.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(uni => {
        let branchRows = '';
        const branches = typeof uni.branches === 'string' ? JSON.parse(uni.branches) : (uni.branches || {});
        for (const [branch, fee] of Object.entries(branches)) {
            branchRows += `
                <div class="flex justify-between items-center py-1 border-b border-blue-900 text-[11px]">
                    <span class="text-blue-100 font-bold">${branch}</span>
                    <span class="text-emerald-400 font-extrabold">₹${Number(fee).toLocaleString('en-IN')}/yr</span>
                </div>
            `;
        }

        const badgeType = uni.admission_type || 'Direct Admission Open';
        let badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
        if (badgeType === 'Entrance Exam Required') badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
        if (badgeType === 'Application Only') badgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/40';

        const safeUniName = uni.name.replace(/'/g, "\\'");

        return `
            <div class="bg-blue-900/85 rounded-3xl border border-blue-800 overflow-hidden shadow-xl hover:border-sky-400/50 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative aspect-[16/9] w-full overflow-hidden bg-blue-950">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                        <div class="absolute inset-0 bg-gradient-to-t from-blue-950/85 via-transparent to-transparent"></div>
                        <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-blue-950/90 backdrop-blur-md text-sky-300 border border-blue-800">${uni.state}</span>
                        <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                            <span class="text-[10px] font-mono font-bold text-white bg-blue-950/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-blue-800">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg border backdrop-blur-md ${badgeClass}">${badgeType}</span>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5">
                        <h3 class="font-black text-base text-white leading-snug">${uni.name}</h3>
                        <p class="text-xs text-blue-200/80 mt-1 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-sky-400 mt-0.5 shrink-0"></i>
                            <span>${uni.address}</span>
                        </p>

                        <div class="mt-4 p-3 rounded-2xl bg-blue-950/95 border border-blue-800">
                            <p class="text-[11px] font-bold text-sky-300 mb-2 uppercase tracking-wide">Branch Tuition Fees (Per Year):</p>
                            <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                ${branchRows}
                            </div>
                        </div>

                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2.5 rounded-xl bg-blue-950 border border-blue-800">
                                <span class="text-[10px] text-blue-300/75 block">Hostel Fee</span>
                                <strong class="text-amber-300 text-xs">₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-blue-950 border border-blue-800">
                                <span class="text-[10px] text-blue-300/75 block">Application Fee</span>
                                <strong class="text-sky-300 text-xs">₹${Number(uni.application_fee).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-4 sm:p-5 pt-0">
                    <button type="button" onclick="selectUniForGuidance('${safeUniName}')" class="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition">
                        <i class="fa-solid fa-graduation-cap"></i> Get Scholarship / Expert Call
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function focusGuidanceSection(assistanceType) {
    const assistSelect = document.getElementById('guide-assistance');
    if (assistSelect && assistanceType) {
        assistSelect.value = assistanceType;
    }
    prefillGuidanceFormWithStudent();
    document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' });
}

function selectUniForGuidance(uniName) {
    const uniInput = document.getElementById('guide-uni');
    if (uniInput) {
        uniInput.value = uniName;
    }
    prefillGuidanceFormWithStudent();
    document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' });
}

function prefillGuidanceFormWithStudent() {
    if (!state.currentStudent) return;
    const nameEl = document.getElementById('guide-name');
    const phoneEl = document.getElementById('guide-phone');
    const emailEl = document.getElementById('guide-email');
    if (nameEl && !nameEl.value) nameEl.value = state.currentStudent.full_name || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = state.currentStudent.mobile || '';
    if (emailEl && !emailEl.value) emailEl.value = state.currentStudent.email || '';
}

// --- 5. GET SCHOLARSHIP, LOAN GUIDANCE & EXPERT CALLBACK SUBMISSION ---
async function handleGuidanceSubmission(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-guidance');

    const name = document.getElementById('guide-name').value.trim();
    const phone = document.getElementById('guide-phone').value.replace(/\D+/g, '').trim();
    const email = document.getElementById('guide-email').value.trim().toLowerCase();
    const course = document.getElementById('guide-course').value;
    const preferredUni = document.getElementById('guide-uni').value.trim();
    const assistanceType = document.getElementById('guide-assistance').value;

    if (!name || !phone || !email || !course || !assistanceType) {
        showToast('Missing Details', 'Please fill out all required fields.', 'error');
        return;
    }

    const payload = {
        id: Date.now(),
        name,
        phone,
        email,
        branch: course,
        uni: preferredUni || 'Not Specified',
        assistance_type: assistanceType,
        referral_code: state.currentStudent?.referred_by_code || state.incomingReferralCode || null,
        status: 'Pending Callback'
    };

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'Submitting Request...';
        }

        let { error } = await _supabase.from('inquiries').insert([payload]);

        if (error && error.message && error.message.includes('assistance_type')) {
            const { assistance_type, ...fallbackPayload } = payload;
            const fallbackRes = await _supabase.from('inquiries').insert([{
                ...fallbackPayload,
                jee_score: assistanceType
            }]);
            error = fallbackRes.error;
        }

        if (error) {
            showToast('Submission Error', error.message, 'error');
            return;
        }

        state.inquiries.unshift(payload);
        showToast('Guidance Request Received', 'Our GTECH team will contact you shortly for your guidance request.', 'success');
        e.target.reset();
        prefillGuidanceFormWithStudent();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'GET FREE EXPERT GUIDANCE';
        }
    }
}

// --- AUTH MODAL & OTP HANDLERS ---
function openAuthModal(mode = 'register') {
    const modal = document.getElementById('student-auth-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchStudentAuthMode(mode);
}

function closeAuthModal() {
    const modal = document.getElementById('student-auth-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function switchStudentAuthMode(mode) {
    const regView = document.getElementById('register-view');
    const loginView = document.getElementById('login-view');
    const regTab = document.getElementById('mode-tab-register');
    const loginTab = document.getElementById('mode-tab-login');

    document.getElementById('reg-error-msg').classList.add('hidden');
    document.getElementById('login-error-msg').classList.add('hidden');

    if (mode === 'login') {
        regView.classList.add('hidden');
        loginView.classList.remove('hidden');
        loginTab.className = 'flex-1 py-2 px-3 rounded-xl bg-blue-600 text-white transition';
        regTab.className = 'flex-1 py-2 px-3 rounded-xl text-blue-200/80 hover:text-white transition';
    } else {
        loginView.classList.add('hidden');
        regView.classList.remove('hidden');
        regTab.className = 'flex-1 py-2 px-3 rounded-xl bg-blue-600 text-white transition';
        loginTab.className = 'flex-1 py-2 px-3 rounded-xl text-blue-200/80 hover:text-white transition';
        if (state.incomingReferralCode) {
            const refInput = document.getElementById('reg-referral');
            if (refInput && !refInput.value) refInput.value = state.incomingReferralCode;
        }
    }
}

function showInlineError(elId, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

async function isEmailAlreadyRegistered(email) {
    const { data, error } = await _supabase
        .from('student_profiles')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();
    if (error) return false;
    return Boolean(data && data.email);
}

async function requestEmailOtp(email, purpose) {
    if (OTP_BACKEND_URL) {
        const res = await fetch(`${OTP_BACKEND_URL}/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, purpose })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(body.message || 'Unable to send OTP right now.');
        }
        return { viaBackend: true };
    }

    const { error } = await _supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            emailRedirectTo: window.location.origin + window.location.pathname
        }
    });
    if (error) throw new Error(error.message);
    return { viaBackend: false };
}

async function verifyEmailOtpCode(email, code, purpose) {
    if (OTP_BACKEND_URL) {
        const res = await fetch(`${OTP_BACKEND_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, purpose })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.verified) {
            throw new Error(body.message || 'Invalid or expired OTP code.');
        }
        return body;
    }

    const { data, error } = await _supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email'
    });
    if (error) throw new Error(error.message);
    return { verified: true, user: data?.user || null };
}

// --- 1. REGISTRATION FLOW ---
async function handleSendRegistrationOtp(e) {
    if (e) e.preventDefault();
    const errId = 'reg-error-msg';
    document.getElementById(errId).classList.add('hidden');

    const fullName = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.replace(/\D+/g, '').trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();
    const sendBtn = document.getElementById('btn-send-reg-otp');

    if (!fullName || !phone || !email) {
        showInlineError(errId, 'Student Name, Phone Number, and Email Address are required.');
        return;
    }

    if (phone.length < 10) {
        showInlineError(errId, 'Please enter a valid mobile number.');
        return;
    }

    try {
        sendBtn.disabled = true;
        sendBtn.querySelector('span').textContent = 'Checking & Sending...';

        const exists = await isEmailAlreadyRegistered(email);
        if (exists) {
            showInlineError(errId, 'This email address is already registered. Please use Email Login.');
            return;
        }

        state.pendingRegistration = {
            full_name: fullName,
            mobile: phone,
            email,
            referred_by_code: referralCode || state.incomingReferralCode || null
        };
        localStorage.setItem('gtech_pending_reg', JSON.stringify(state.pendingRegistration));

        await requestEmailOtp(email, 'register');
        clearOtpBoxes('reg-otp-box');
        document.getElementById('reg-otp-panel').classList.remove('hidden');
        document.querySelector('.reg-otp-box')?.focus();
        startOtpCountdown('reg', 60);
        showToast('OTP Sent', `A 6-digit verification OTP has been sent to ${email}.`, 'success');
    } catch (err) {
        showInlineError(errId, err.message || 'Failed to send verification OTP.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.querySelector('span').textContent = 'SEND OTP';
    }
}

async function handleVerifyRegistrationOtp() {
    const errId = 'reg-error-msg';
    document.getElementById(errId).classList.add('hidden');

    const code = getOtpCodeFromBoxes('reg-otp-box');
    const regData = state.pendingRegistration || JSON.parse(localStorage.getItem('gtech_pending_reg') || 'null');
    const verifyBtn = document.getElementById('btn-verify-reg-otp');

    if (!regData || !regData.email) {
        showInlineError(errId, 'Please enter your registration details and click SEND OTP first.');
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showInlineError(errId, 'Please enter all 6 digits of the email OTP.');
        return;
    }

    try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';

        const alreadyExists = await isEmailAlreadyRegistered(regData.email);
        if (alreadyExists) {
            showInlineError(errId, 'This email is already registered. Switch to Email Login to sign in.');
            return;
        }

        await verifyEmailOtpCode(regData.email, code, 'register');

        const studentId = `GTECH-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
        const newStudent = {
            id: studentId,
            student_id: studentId,
            full_name: regData.full_name,
            mobile: regData.mobile,
            email: regData.email,
            referred_by_code: regData.referred_by_code || null
        };

        let { data: inserted, error } = await _supabase
            .from('student_profiles')
            .insert([newStudent])
            .select()
            .maybeSingle();

        if (error && error.message && error.message.includes('student_id')) {
            const { student_id, ...fallbackStudent } = newStudent;
            const retry = await _supabase
                .from('student_profiles')
                .insert([fallbackStudent])
                .select()
                .maybeSingle();
            inserted = retry.data;
            error = retry.error;
        }

        if (error) {
            if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate'))) {
                showInlineError(errId, 'An account with this email already exists. Please login instead.');
                return;
            }
            throw new Error(error.message);
        }

        const profile = inserted || newStudent;
        profile.student_id = profile.student_id || profile.id || studentId;

        state.currentStudent = profile;
        state.pendingRegistration = null;
        localStorage.removeItem('gtech_pending_reg');
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));

        updateHeaderForLoggedInStudent(profile);
        prefillGuidanceFormWithStudent();

        document.getElementById('student-register-form').classList.add('hidden');
        document.getElementById('reg-otp-panel').classList.add('hidden');
        document.getElementById('generated-student-id-display').textContent = profile.student_id;
        document.getElementById('reg-success-panel').classList.remove('hidden');

        showToast('Registration Successful', `Student ID ${profile.student_id} generated!`, 'success');
    } catch (err) {
        showInlineError(errId, err.message || 'Invalid OTP code.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Complete Registration';
    }
}

// --- 2. EMAIL-ONLY LOGIN FLOW ---
async function handleSendLoginOtp(e) {
    if (e) e.preventDefault();
    const errId = 'login-error-msg';
    document.getElementById(errId).classList.add('hidden');

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const sendBtn = document.getElementById('btn-send-login-otp');

    if (!email) {
        showInlineError(errId, 'Please enter your registered email address.');
        return;
    }

    try {
        sendBtn.disabled = true;
        sendBtn.querySelector('span').textContent = 'Checking Email...';

        const { data: profile, error } = await _supabase
            .from('student_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !profile) {
            showInlineError(errId, 'This email is not registered with GTECH. Please register first.');
            return;
        }

        state.pendingLoginEmail = email;
        await requestEmailOtp(email, 'login');
        clearOtpBoxes('login-otp-box');
        document.getElementById('login-otp-panel').classList.remove('hidden');
        document.querySelector('.login-otp-box')?.focus();
        startOtpCountdown('login', 60);
        showToast('Login OTP Sent', `A 6-digit login OTP has been sent to ${email}.`, 'success');
    } catch (err) {
        showInlineError(errId, err.message || 'Could not send login OTP.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.querySelector('span').textContent = 'SEND LOGIN OTP';
    }
}

async function handleVerifyLoginOtp() {
    const errId = 'login-error-msg';
    document.getElementById(errId).classList.add('hidden');

    const email = (document.getElementById('login-email').value || state.pendingLoginEmail || '').trim().toLowerCase();
    const code = getOtpCodeFromBoxes('login-otp-box');
    const verifyBtn = document.getElementById('btn-verify-login-otp');

    if (!email) {
        showInlineError(errId, 'Please enter your registered email address.');
        return;
    }

    if (!/^\d{6}$/.test(code)) {
        showInlineError(errId, 'Please enter the 6-digit OTP sent to your email.');
        return;
    }

    try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';

        const { data: profile, error } = await _supabase
            .from('student_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !profile) {
            showInlineError(errId, 'Unregistered email address. Please register first.');
            return;
        }

        await verifyEmailOtpCode(email, code, 'login');

        profile.student_id = profile.student_id || profile.id || 'GTECH-MEMBER';
        state.currentStudent = profile;
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));

        updateHeaderForLoggedInStudent(profile);
        prefillGuidanceFormWithStudent();
        closeAuthModal();
        await openStudentDashboardModal();
        showToast('Welcome Back', `Signed in as ${profile.full_name}.`, 'success');
    } catch (err) {
        showInlineError(errId, err.message || 'Invalid OTP code.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Open Dashboard';
    }
}

function listenToAuthChanges() {
    _supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            state.authUser = session.user;
            const email = (session.user.email || '').trim().toLowerCase();
            if (!email) return;

            const { data: profile } = await _supabase
                .from('student_profiles')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (profile) {
                profile.student_id = profile.student_id || profile.id || 'GTECH-MEMBER';
                state.currentStudent = profile;
                localStorage.setItem('gtech_student_session', JSON.stringify(profile));
                updateHeaderForLoggedInStudent(profile);
                prefillGuidanceFormWithStudent();
            }
        } else if (event === 'SIGNED_OUT') {
            state.authUser = null;
            state.currentStudent = null;
            state.financeRecord = null;
            localStorage.removeItem('gtech_student_session');
            resetHeaderToLoggedOut();
        }
    });
}

async function restoreStudentSession() {
    const { data } = await _supabase.auth.getSession();
    if (data?.session?.user?.email) {
        const email = data.session.user.email.trim().toLowerCase();
        const { data: profile } = await _supabase
            .from('student_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();
        if (profile) {
            profile.student_id = profile.student_id || profile.id || 'GTECH-MEMBER';
            state.currentStudent = profile;
            localStorage.setItem('gtech_student_session', JSON.stringify(profile));
            updateHeaderForLoggedInStudent(profile);
            prefillGuidanceFormWithStudent();
            return;
        }
    }

    const saved = localStorage.getItem('gtech_student_session');
    if (saved) {
        try {
            const profile = JSON.parse(saved);
            state.currentStudent = profile;
            updateHeaderForLoggedInStudent(profile);
            prefillGuidanceFormWithStudent();
        } catch (_) {
            localStorage.removeItem('gtech_student_session');
        }
    }
}

async function handleStudentLogout() {
    await _supabase.auth.signOut().catch(() => {});
    state.authUser = null;
    state.currentStudent = null;
    state.financeRecord = null;
    localStorage.removeItem('gtech_student_session');
    resetHeaderToLoggedOut();
    closeStudentDashboardModal();
    showToast('Logged Out', 'You have signed out of your student portal.', 'success');
}

function resetHeaderToLoggedOut() {
    const dashBtn = document.getElementById('header-dashboard-btn');
    const loginBtn = document.getElementById('header-login-btn');
    if (dashBtn && loginBtn) {
        dashBtn.classList.add('hidden');
        loginBtn.classList.remove('hidden');
    }
}

function updateHeaderForLoggedInStudent(profile) {
    const dashBtn = document.getElementById('header-dashboard-btn');
    const loginBtn = document.getElementById('header-login-btn');
    const nameSpan = document.getElementById('header-student-name');
    if (dashBtn && loginBtn && nameSpan) {
        dashBtn.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        nameSpan.textContent = profile.full_name || 'Dashboard';
    }
}

// --- 3 & 4. STUDENT DASHBOARD (WELCOME BANNER + PRIVATE AMOUNT DETAILS) ---
function formatINR(value) {
    const num = Number(value || 0);
    return `₹${num.toLocaleString('en-IN')}`;
}

async function fetchStudentFinancialDetails(student) {
    if (!student || !student.email) return null;

    const { data, error } = await _supabase
        .from('student_finances')
        .select('*')
        .eq('email', student.email.toLowerCase())
        .maybeSingle();

    if (error) {
        console.warn('Financial record fetch note:', error.message);
        return null;
    }
    return data || null;
}

async function openStudentDashboardModal() {
    if (!state.currentStudent) {
        openAuthModal('login');
        return;
    }

    await fetchInquiriesFromSupabase();
    state.financeRecord = await fetchStudentFinancialDetails(state.currentStudent);

    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    renderStudentDashboard();
}

function closeStudentDashboardModal() {
    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderStudentDashboard() {
    const stu = state.currentStudent;
    if (!stu) return;

    document.getElementById('dash-topbar-name').textContent = stu.full_name || 'Student Portal';
    document.getElementById('dash-topbar-meta').textContent = `${stu.email}${stu.mobile ? ' • ' + stu.mobile : ''}`;
    document.getElementById('student-welcome-name').textContent = `Hello, ${stu.full_name}!`;
    document.getElementById('student-dash-id').textContent = stu.student_id || stu.id || 'GTECH-MEMBER';

    const fin = state.financeRecord;
    const statusBadge = document.getElementById('finance-record-status');

    if (fin) {
        statusBadge.textContent = 'Verified Ledger';
        const totalFee = Number(fin.total_university_fee || 0);
        const scholarship = Number(fin.scholarship_amount || 0);
        const appFee = Number(fin.application_fee || 0);
        const hostelFee = Number(fin.hostel_fee || 0);
        const referralEarnings = Number(fin.referral_earnings || 0);
        const paidAmount = Number(fin.paid_amount || 0);
        const computedPending = fin.pending_amount !== undefined && fin.pending_amount !== null
            ? Number(fin.pending_amount)
            : Math.max(0, totalFee + appFee + hostelFee - scholarship - referralEarnings - paidAmount);

        document.getElementById('fin-total-fee').textContent = formatINR(totalFee);
        document.getElementById('fin-scholarship').textContent = formatINR(scholarship);
        document.getElementById('fin-app-fee').textContent = formatINR(appFee);
        document.getElementById('fin-hostel-fee').textContent = formatINR(hostelFee);
        document.getElementById('fin-referral').textContent = formatINR(referralEarnings);
        document.getElementById('fin-paid').textContent = formatINR(paidAmount);
        document.getElementById('fin-pending').textContent = formatINR(computedPending);
    } else {
        statusBadge.textContent = 'Awaiting Fee Update';
        document.getElementById('fin-total-fee').textContent = formatINR(0);
        document.getElementById('fin-scholarship').textContent = formatINR(0);
        document.getElementById('fin-app-fee').textContent = formatINR(0);
        document.getElementById('fin-hostel-fee').textContent = formatINR(0);
        document.getElementById('fin-referral').textContent = formatINR(0);
        document.getElementById('fin-paid').textContent = formatINR(0);
        document.getElementById('fin-pending').textContent = formatINR(0);
    }

    const myApps = state.inquiries.filter(inq =>
        (inq.email && stu.email && inq.email.toLowerCase() === stu.email.toLowerCase()) ||
        (inq.phone && stu.mobile && String(inq.phone).includes(String(stu.mobile)))
    );

    let activeStepIndex = 0;
    let latestStatusLabel = 'Registered';
    if (myApps.length > 0) {
        activeStepIndex = 1;
        latestStatusLabel = myApps[0].status || 'Pending Callback';
        const lower = latestStatusLabel.toLowerCase();
        if (lower.includes('visiting') || lower.includes('completed')) activeStepIndex = 2;
        if (lower.includes('application')) activeStepIndex = 3;
        if (lower.includes('admission')) activeStepIndex = 4;
    }

    document.getElementById('dash-current-stage-badge').textContent = latestStatusLabel;

    const steps = [
        { title: '1. Registered', desc: 'Email verified' },
        { title: '2. Enquiry Sent', desc: 'Guidance requested' },
        { title: '3. Call / Visit', desc: 'Counselor & visit' },
        { title: '4. Application', desc: 'Form completed' },
        { title: '5. Admission Done', desc: 'Seat confirmed' }
    ];

    document.getElementById('admission-process-flow').innerHTML = steps.map((step, idx) => {
        const done = idx <= activeStepIndex;
        const current = idx === activeStepIndex;
        const style = current
            ? 'bg-blue-600/25 border-sky-400 text-white'
            : done
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                : 'bg-blue-900/50 border-blue-800 text-blue-300/50';
        return `
            <div class="p-2.5 sm:p-3 rounded-xl border ${style} transition min-w-0">
                <div class="text-[11px] font-extrabold leading-tight">${step.title}</div>
                <div class="text-[10px] opacity-80 mt-0.5 leading-tight">${step.desc}</div>
            </div>
        `;
    }).join('');

    const appContainer = document.getElementById('student-applications-list');
    if (myApps.length === 0) {
        appContainer.innerHTML = `<p class="text-xs text-blue-300/70">No guidance or admission requests submitted yet for ${stu.email}.</p>`;
    } else {
        appContainer.innerHTML = myApps.map(inq => `
            <div class="p-3 bg-blue-900/70 rounded-xl border border-blue-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="min-w-0">
                    <strong class="text-white block break-words">${inq.assistance_type || 'Guidance Request'} • ${inq.branch || 'Course'}</strong>
                    <p class="text-blue-200/75 text-[10px] mt-0.5">Preferred University: ${inq.uni || 'Not Specified'}</p>
                </div>
                <span class="self-start sm:self-center px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-[10px] border border-emerald-500/30 shrink-0">${inq.status || 'Pending Callback'}</span>
            </div>
        `).join('');
    }
}

// Global scope exposure
window.showToast = showToast;
window.hideToast = hideToast;
window.sanitizeNumericInput = sanitizeNumericInput;
window.handleOtpBoxInput = handleOtpBoxInput;
window.handleOtpBoxKeydown = handleOtpBoxKeydown;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchStudentAuthMode = switchStudentAuthMode;
window.handleSendRegistrationOtp = handleSendRegistrationOtp;
window.handleVerifyRegistrationOtp = handleVerifyRegistrationOtp;
window.handleSendLoginOtp = handleSendLoginOtp;
window.handleVerifyLoginOtp = handleVerifyLoginOtp;
window.handleStudentLogout = handleStudentLogout;
window.openStudentDashboardModal = openStudentDashboardModal;
window.closeStudentDashboardModal = closeStudentDashboardModal;
window.setStateFilter = setStateFilter;
window.selectUniForGuidance = selectUniForGuidance;
window.focusGuidanceSection = focusGuidanceSection;
window.handleGuidanceSubmission = handleGuidanceSubmission;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
