const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Optional backend endpoint for custom OTP rate limiting & email delivery.
// Falls back cleanly to Supabase Email OTP when unset.
const OTP_BACKEND_URL = window.GTECH_OTP_API || '';

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    currentStudent: null,
    authUser: null,
    financeRecord: null,
    referralStats: { total: 0, successful: 0 },
    pendingRegistration: null,
    pendingLoginEmail: '',
    currentSlide: 0,
    incomingReferralCode: '',
    regCooldownTimer: null,
    loginCooldownTimer: null
};

window.onload = async function() {
    detectIncomingReferralLink();
    setupDropdownOutsideClick();
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
            if (labelEl) labelEl.textContent = 'Ready to resend';
            if (resendBtn) resendBtn.disabled = false;
        }
    }, 1000);

    if (isReg) {
        state.regCooldownTimer = interval;
    } else {
        state.loginCooldownTimer = interval;
    }
}

// --- HEADER PROFILE DROPDOWN CONTROLS ---
function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('header-profile-menu');
    const trigger = document.getElementById('header-profile-trigger');
    if (!menu || !trigger) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        trigger.setAttribute('aria-expanded', 'true');
    } else {
        menu.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
    }
}

function closeProfileDropdown() {
    const menu = document.getElementById('header-profile-menu');
    const trigger = document.getElementById('header-profile-trigger');
    if (menu) menu.classList.add('hidden');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function setupDropdownOutsideClick() {
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('header-profile-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            closeProfileDropdown();
        }
    });
}

async function openDashboardSection(sectionKey = 'overview') {
    closeProfileDropdown();
    closeAuthModal();
    await openStudentDashboardModal();

    const map = {
        overview: 'dash-sec-overview',
        applications: 'dash-sec-applications',
        profile: 'dash-sec-profile',
        referral: 'dash-sec-referral'
    };
    const targetId = map[sectionKey];
    if (targetId) {
        setTimeout(() => {
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    }
}

// --- REFERRAL LINK AUTO-FILL & CODE HELPERS ---
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

function generateUniqueReferralCode(fullName) {
    const prefix = (fullName || 'GTECH')
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 4)
        .padEnd(4, 'G');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${randomPart}`;
}

function getStudentReferralCode(student) {
    if (!student) return '';
    return (student.referral_code || student.student_id || student.id || '').toString().trim().toUpperCase();
}

function getStudentReferralLink(student) {
    const code = getStudentReferralCode(student);
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?ref=${encodeURIComponent(code)}`;
}

async function copyMyReferralCode() {
    if (!state.currentStudent) return;
    const code = getStudentReferralCode(state.currentStudent);
    await navigator.clipboard.writeText(code);
    showToast('Referral Code Copied', `Code ${code} copied to clipboard.`, 'success');
}

async function copyMyReferralLink() {
    if (!state.currentStudent) return;
    const link = getStudentReferralLink(state.currentStudent);
    await navigator.clipboard.writeText(link);
    showToast('Referral Link Copied', 'Shareable invite link copied to clipboard.', 'success');
}

function shareReferralOnWhatsApp() {
    if (!state.currentStudent) return;
    const code = getStudentReferralCode(state.currentStudent);
    const link = getStudentReferralLink(state.currentStudent);
    const message = `Join GTech Admissions for Engineering, Degree & Medical Admissions, Scholarships & Loan Guidance! Use my referral code *${code}* or register directly here: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-rose-200 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '!';
    } else {
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-emerald-200 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold text-sm';
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
            title: 'GTech Admissions Campus Guidance'
        },
        {
            id: 2,
            image_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1600&auto=format&fit=crop',
            title: 'GTech Student Scholarship Hub'
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
            btn.className = 'state-btn px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition whitespace-nowrap shrink-0';
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
            <div class="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs">
                <p class="text-slate-500 font-semibold text-xs sm:text-sm">No universities match your filter in this category.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(uni => {
        let branchRows = '';
        const branches = typeof uni.branches === 'string' ? JSON.parse(uni.branches) : (uni.branches || {});
        for (const [branch, fee] of Object.entries(branches)) {
            branchRows += `
                <div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-b-0 text-xs">
                    <span class="text-slate-700 font-semibold">${branch}</span>
                    <span class="text-emerald-700 font-bold">₹${Number(fee).toLocaleString('en-IN')}/yr</span>
                </div>
            `;
        }

        const badgeType = uni.admission_type || 'Direct Admission Open';
        let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (badgeType === 'Entrance Exam Required') badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        if (badgeType === 'Application Only') badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';

        const safeUniName = uni.name.replace(/'/g, "\\'");

        return `
            <div class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                        <span class="absolute top-3 left-3 px-3 py-1 rounded-xl text-[11px] font-bold bg-white/95 backdrop-blur-xs text-slate-800 border border-slate-200 shadow-xs">${uni.state}</span>
                        <div class="absolute top-3 right-3 flex flex-wrap justify-end gap-1.5">
                            <span class="text-[11px] font-mono font-bold text-slate-800 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-xl border border-slate-200 shadow-xs">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[11px] font-bold px-2.5 py-1 rounded-xl border bg-white/95 backdrop-blur-xs shadow-xs ${badgeClass}">${badgeType}</span>
                        </div>
                    </div>

                    <div class="p-5 sm:p-6">
                        <h3 class="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">${uni.name}</h3>
                        <p class="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-blue-600 mt-0.5 shrink-0"></i>
                            <span>${uni.address}</span>
                        </p>

                        <div class="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                            <p class="text-[11px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Branch Tuition Fees (Per Year)</p>
                            <div class="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                                ${branchRows}
                            </div>
                        </div>

                        <div class="mt-3.5 grid grid-cols-2 gap-2.5 text-xs">
                            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                <span class="text-[11px] text-slate-500 block">Hostel Fee</span>
                                <strong class="text-slate-900 text-xs sm:text-sm">₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</strong>
                            </div>
                            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                <span class="text-[11px] text-slate-500 block">Application Fee</span>
                                <strong class="text-blue-700 text-xs sm:text-sm">₹${Number(uni.application_fee).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-5 sm:p-6 pt-0">
                    <button type="button" onclick="selectUniForGuidance('${safeUniName}')" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 transition">
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

// --- SCHOLARSHIP, LOAN GUIDANCE & EXPERT CALLBACK SUBMISSION ---
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
    modal.scrollTop = 0;
    document.body.classList.add('overflow-hidden');
    switchStudentAuthMode(mode);
}

function closeAuthModal() {
    const modal = document.getElementById('student-auth-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
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
        loginTab.className = 'py-2.5 px-3 rounded-xl bg-white text-blue-700 shadow-2xs transition';
        regTab.className = 'py-2.5 px-3 rounded-xl text-slate-600 hover:text-slate-900 transition';
    } else {
        loginView.classList.add('hidden');
        regView.classList.remove('hidden');
        regTab.className = 'py-2.5 px-3 rounded-xl bg-white text-blue-700 shadow-2xs transition';
        loginTab.className = 'py-2.5 px-3 rounded-xl text-slate-600 hover:text-slate-900 transition';
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

// Validate referral code against genuine records in student_profiles
async function validateReferralCodeInDatabase(rawCode, applicantEmail, applicantPhone) {
    const cleanCode = String(rawCode || '').trim().toUpperCase();
    if (!cleanCode) {
        return { valid: false, message: 'Referral code is mandatory to register.' };
    }

    // Check by referral_code first, then fallback to student_id / id
    let { data: referrer, error } = await _supabase
        .from('student_profiles')
        .select('id, student_id, referral_code, email, mobile, full_name')
        .eq('referral_code', cleanCode)
        .maybeSingle();

    if (!referrer && !error) {
        const byStudentId = await _supabase
            .from('student_profiles')
            .select('id, student_id, referral_code, email, mobile, full_name')
            .or(`student_id.eq.${cleanCode},id.eq.${cleanCode}`)
            .maybeSingle();
        referrer = byStudentId.data;
        error = byStudentId.error;
    }

    if (error || !referrer) {
        return {
            valid: false,
            message: 'Invalid referral code. Please enter a verified referral code from an existing GTech member.'
        };
    }

    // Prevent self-referral by email or mobile
    if (
        (referrer.email && applicantEmail && referrer.email.toLowerCase() === applicantEmail.toLowerCase()) ||
        (referrer.mobile && applicantPhone && String(referrer.mobile) === String(applicantPhone))
    ) {
        return {
            valid: false,
            message: 'Self-referrals are not permitted. Please use a valid referral code from another member.'
        };
    }

    return { valid: true, code: cleanCode, referrer };
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
            shouldCreateUser: purpose === 'register',
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

// --- 4. STUDENT REGISTRATION FLOW (WITH MANDATORY REFERRAL VALIDATION) ---
async function handleSendRegistrationOtp(e) {
    if (e) e.preventDefault();
    const errId = 'reg-error-msg';
    document.getElementById(errId).classList.add('hidden');

    const fullName = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.replace(/\D+/g, '').trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const referralInput = document.getElementById('reg-referral').value.trim().toUpperCase();
    const sendBtn = document.getElementById('btn-send-reg-otp');

    if (!fullName || !phone || !email || !referralInput) {
        showInlineError(errId, 'Student Name, Phone Number, Email Address, and Referral Code are all required.');
        return;
    }

    if (phone.length < 10) {
        showInlineError(errId, 'Please enter a valid mobile number.');
        return;
    }

    try {
        sendBtn.disabled = true;
        sendBtn.querySelector('span').textContent = 'Validating & Sending OTP...';

        const exists = await isEmailAlreadyRegistered(email);
        if (exists) {
            showInlineError(errId, 'This email address is already registered. Please use Email Login.');
            return;
        }

        const refCheck = await validateReferralCodeInDatabase(referralInput, email, phone);
        if (!refCheck.valid) {
            showInlineError(errId, refCheck.message);
            return;
        }

        state.pendingRegistration = {
            full_name: fullName,
            mobile: phone,
            email,
            referred_by_code: refCheck.code
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

    if (!regData || !regData.email || !regData.referred_by_code) {
        showInlineError(errId, 'Please complete all registration fields including a valid referral code and click SEND OTP first.');
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

        const refCheck = await validateReferralCodeInDatabase(regData.referred_by_code, regData.email, regData.mobile);
        if (!refCheck.valid) {
            showInlineError(errId, refCheck.message);
            return;
        }

        await verifyEmailOtpCode(regData.email, code, 'register');

        const studentId = `GTECH-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
        const ownReferralCode = generateUniqueReferralCode(regData.full_name);

        const newStudent = {
            id: studentId,
            student_id: studentId,
            full_name: regData.full_name,
            mobile: regData.mobile,
            email: regData.email,
            referral_code: ownReferralCode,
            referred_by_code: refCheck.code
        };

        let { data: inserted, error } = await _supabase
            .from('student_profiles')
            .insert([newStudent])
            .select()
            .maybeSingle();

        if (error && error.message && (error.message.includes('student_id') || error.message.includes('referral_code'))) {
            const fallbackStudent = {
                id: studentId,
                full_name: regData.full_name,
                mobile: regData.mobile,
                email: regData.email,
                referred_by_code: refCheck.code
            };
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
        profile.referral_code = profile.referral_code || ownReferralCode;

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
        showInlineError(errId, err.message || 'Invalid or expired OTP code.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Complete Registration';
    }
}

// --- EMAIL-ONLY LOGIN FLOW ---
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
        profile.referral_code = profile.referral_code || profile.student_id;
        state.currentStudent = profile;
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));

        updateHeaderForLoggedInStudent(profile);
        prefillGuidanceFormWithStudent();
        closeAuthModal();
        await openStudentDashboardModal();
        showToast('Welcome Back', `Signed in as ${profile.full_name}.`, 'success');
    } catch (err) {
        showInlineError(errId, err.message || 'Invalid or expired OTP code.');
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
                profile.referral_code = profile.referral_code || profile.student_id;
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
            profile.referral_code = profile.referral_code || profile.student_id;
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
    state.referralStats = { total: 0, successful: 0 };
    localStorage.removeItem('gtech_student_session');
    closeProfileDropdown();
    resetHeaderToLoggedOut();
    closeStudentDashboardModal();
    showToast('Logged Out', 'You have signed out of your student portal.', 'success');
}

function resetHeaderToLoggedOut() {
    const guestActions = document.getElementById('header-guest-actions');
    const profileWrapper = document.getElementById('header-profile-wrapper');
    if (guestActions && profileWrapper) {
        guestActions.classList.remove('hidden');
        profileWrapper.classList.add('hidden');
    }
}

function updateHeaderForLoggedInStudent(profile) {
    const guestActions = document.getElementById('header-guest-actions');
    const profileWrapper = document.getElementById('header-profile-wrapper');
    const nameSpan = document.getElementById('header-student-name');
    const dropFullName = document.getElementById('dropdown-student-fullname');
    const dropId = document.getElementById('dropdown-student-id');

    if (guestActions && profileWrapper) {
        guestActions.classList.add('hidden');
        profileWrapper.classList.remove('hidden');
    }
    if (nameSpan) nameSpan.textContent = profile.full_name || 'Student';
    if (dropFullName) dropFullName.textContent = profile.full_name || 'Student';
    if (dropId) dropId.textContent = `ID: ${profile.student_id || profile.id || '—'}`;
}

// --- 5 & 6. STUDENT DASHBOARD (PRIVATE FINANCIALS + VERIFIED REFERRALS) ---
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
        return null;
    }
    return data || null;
}

async function fetchStudentReferralStats(student) {
    const myCode = getStudentReferralCode(student);
    if (!myCode) return { total: 0, successful: 0 };

    // Count genuine referred student profiles excluding self
    const { data, error } = await _supabase
        .from('student_profiles')
        .select('id, email, referred_by_code')
        .eq('referred_by_code', myCode);

    if (error || !Array.isArray(data)) {
        return { total: 0, successful: 0 };
    }

    const validReferrals = data.filter(
        row => row.email && student.email && row.email.toLowerCase() !== student.email.toLowerCase()
    );

    return {
        total: validReferrals.length,
        successful: validReferrals.length
    };
}

async function openStudentDashboardModal() {
    if (!state.currentStudent) {
        openAuthModal('login');
        return;
    }

    await fetchInquiriesFromSupabase();
    state.financeRecord = await fetchStudentFinancialDetails(state.currentStudent);
    state.referralStats = await fetchStudentReferralStats(state.currentStudent);

    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.remove('hidden');
    modal.scrollTop = 0;
    document.body.classList.add('overflow-hidden');

    renderStudentDashboard();
}

function closeStudentDashboardModal() {
    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function renderStudentDashboard() {
    const stu = state.currentStudent;
    if (!stu) return;

    const studentId = stu.student_id || stu.id || 'GTECH-MEMBER';
    const referralCode = getStudentReferralCode(stu);
    const referralLink = getStudentReferralLink(stu);

    document.getElementById('dash-topbar-name').textContent = stu.full_name || 'Student Portal';
    document.getElementById('dash-topbar-meta').textContent = `${stu.email}${stu.mobile ? ' • ' + stu.mobile : ''}`;
    document.getElementById('student-welcome-name').textContent = `Hello, ${stu.full_name}!`;
    document.getElementById('student-dash-id').textContent = studentId;

    // Profile Details
    document.getElementById('prof-name').textContent = stu.full_name || '—';
    document.getElementById('prof-id').textContent = studentId;
    document.getElementById('prof-email').textContent = stu.email || '—';
    document.getElementById('prof-phone').textContent = stu.mobile || '—';
    document.getElementById('prof-referred-by').textContent = stu.referred_by_code || 'Direct';

    // My Referral Details & Live Stats
    document.getElementById('dash-my-referral-code').textContent = referralCode;
    document.getElementById('dash-my-referral-link').textContent = referralLink;
    document.getElementById('stat-total-referrals').textContent = String(state.referralStats.total);
    document.getElementById('stat-successful-registrations').textContent = String(state.referralStats.successful);

    // Scholarship & Fee Details (Only display when genuine record exists)
    const fin = state.financeRecord;
    const statusBadge = document.getElementById('finance-record-status');
    const emptyNotice = document.getElementById('student-finance-empty');
    const cardsGrid = document.getElementById('student-finance-cards');

    if (fin) {
        statusBadge.textContent = 'Verified Ledger';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
        emptyNotice.classList.add('hidden');
        cardsGrid.classList.remove('hidden');

        const totalFee = Number(fin.total_university_fee || 0);
        const scholarship = Number(fin.scholarship_amount || 0);
        const appFee = Number(fin.application_fee || 0);
        const hostelFee = Number(fin.hostel_fee || 0);
        const paidAmount = Number(fin.paid_amount || 0);
        const computedPending = fin.pending_amount !== undefined && fin.pending_amount !== null
            ? Number(fin.pending_amount)
            : Math.max(0, totalFee + appFee + hostelFee - scholarship - paidAmount);

        document.getElementById('fin-total-fee').textContent = formatINR(totalFee);
        document.getElementById('fin-scholarship').textContent = formatINR(scholarship);
        document.getElementById('fin-app-fee').textContent = formatINR(appFee);
        document.getElementById('fin-hostel-fee').textContent = formatINR(hostelFee);
        document.getElementById('fin-paid').textContent = formatINR(paidAmount);
        document.getElementById('fin-pending').textContent = formatINR(computedPending);
    } else {
        statusBadge.textContent = 'No Active Ledger';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200';
        emptyNotice.classList.remove('hidden');
        cardsGrid.classList.add('hidden');
    }

    // Admission Status & My Applications
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
        { title: '1. Registered', desc: 'Email & referral verified' },
        { title: '2. Enquiry Sent', desc: 'Guidance requested' },
        { title: '3. Call / Visit', desc: 'Counselor review' },
        { title: '4. Application', desc: 'University filing' },
        { title: '5. Admission Done', desc: 'Seat confirmed' }
    ];

    document.getElementById('admission-process-flow').innerHTML = steps.map((step, idx) => {
        const done = idx <= activeStepIndex;
        const current = idx === activeStepIndex;
        const style = current
            ? 'bg-blue-50 border-blue-400 text-blue-900'
            : done
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-400';
        return `
            <div class="p-3 rounded-xl border ${style} transition min-w-0">
                <div class="text-xs font-extrabold leading-tight">${step.title}</div>
                <div class="text-[11px] opacity-80 mt-0.5 leading-tight">${step.desc}</div>
            </div>
        `;
    }).join('');

    const appContainer = document.getElementById('student-applications-list');
    if (myApps.length === 0) {
        appContainer.innerHTML = `<p class="text-xs text-slate-500">No guidance or admission applications submitted yet for ${stu.email}.</p>`;
    } else {
        appContainer.innerHTML = myApps.map(inq => `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="min-w-0">
                    <strong class="text-slate-900 block break-words">${inq.assistance_type || 'Guidance Request'} • ${inq.branch || 'Course'}</strong>
                    <p class="text-slate-500 text-[11px] mt-0.5">Preferred University: ${inq.uni || 'Not Specified'}</p>
                </div>
                <span class="self-start sm:self-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200 shrink-0">${inq.status || 'Pending Callback'}</span>
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
window.toggleProfileDropdown = toggleProfileDropdown;
window.openDashboardSection = openDashboardSection;
window.copyMyReferralCode = copyMyReferralCode;
window.copyMyReferralLink = copyMyReferralLink;
window.shareReferralOnWhatsApp = shareReferralOnWhatsApp;
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
