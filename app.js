const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_EMAIL = 'admin@gtechadmissions.com';
const OTP_BACKEND_URL = window.GTECH_OTP_API || '';
const MAIL_NOTIFY_URL = window.GTECH_MAIL_API || (OTP_BACKEND_URL ? `${OTP_BACKEND_URL}/send-notification` : '');

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    referredStudents: [],
    currentStudent: null,
    authUser: null,
    financeRecord: null,
    pendingRegistration: null,
    pendingLoginEmail: '',
    currentSlide: 0,
    incomingReferralCode: '',
    activeDashboardTab: 'dashboard',
    regCooldownTimer: null,
    loginCooldownTimer: null
};

window.onload = async function () {
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

// --- EMAIL NOTIFICATION HELPER (ADMIN + STUDENT UPDATES) ---
async function sendMailNotification({ to = ADMIN_EMAIL, subject, text, eventType = 'student_update', details = {} }) {
    const payload = {
        to,
        adminEmail: ADMIN_EMAIL,
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
            if (!res.ok) {
                console.warn('Mail endpoint returned non-OK status:', res.status);
            }
            return true;
        } catch (err) {
            console.warn('Mail notification request warning:', err.message);
            return false;
        }
    }

    console.info('[Gtech Mail Notification Queued]', payload);
    return false;
}

// --- NUMERIC KEYBOARD & INPUT SANITIZATION ---
function sanitizeNumericInput(inputEl, maxLength = 15) {
    if (!inputEl) return;
    const cleaned = String(inputEl.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }
}

function calculatePcmMarks() {
    const phy = Number(document.getElementById('guide-physics')?.value || 0);
    const math = Number(document.getElementById('guide-maths')?.value || 0);
    const chemLab = Number(document.getElementById('guide-chemistry-lab')?.value || 0);
    const total = phy + math + chemLab;
    const pcmEl = document.getElementById('guide-pcm-total');
    if (pcmEl) {
        pcmEl.value = total > 0 ? `${total} / 600` : '';
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

// --- SEQUENTIAL STUDENT ID GENERATOR (STARTS FROM GTECH6001) ---
async function generateNextGtechStudentId() {
    let maxNumber = 6000;
    try {
        const { data } = await _supabase
            .from('student_profiles')
            .select('id, student_id');

        if (Array.isArray(data)) {
            data.forEach(row => {
                [row.student_id, row.id].forEach(val => {
                    const match = String(val || '').toUpperCase().match(/^GTECH(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (!Number.isNaN(num) && num > maxNumber) {
                            maxNumber = num;
                        }
                    }
                });
            });
        }
    } catch (err) {
        console.warn('Sequence check note:', err.message);
    }

    const lastLocal = parseInt(localStorage.getItem('gtech_last_seq_num') || '6000', 10);
    if (!Number.isNaN(lastLocal) && lastLocal > maxNumber) {
        maxNumber = lastLocal;
    }

    const nextNum = maxNumber + 1;
    localStorage.setItem('gtech_last_seq_num', String(nextNum));
    return `GTECH${nextNum}`;
}

// --- REFERRAL CODE CAPTURE (DO NOT AUTO-SHOW TOP BANNER ON MOBILE) ---
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
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-rose-300 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '!';
    } else {
        toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-emerald-300 text-slate-900 shadow-2xl sm:max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '✓';
    }

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        hideToast();
    }, 5500);
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
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white shadow-sm transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-sky-50 transition whitespace-nowrap shrink-0';
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
            <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-sky-100">
                <p class="text-slate-600 font-semibold text-xs">No universities match your filter in this category.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(uni => {
        let branchRows = '';
        const branches = typeof uni.branches === 'string' ? JSON.parse(uni.branches) : (uni.branches || {});
        for (const [branch, fee] of Object.entries(branches)) {
            branchRows += `
                <div class="flex justify-between items-center py-1 border-b border-sky-100 text-[11px]">
                    <span class="text-slate-700 font-bold">${branch}</span>
                    <span class="text-emerald-700 font-extrabold">₹${Number(fee).toLocaleString('en-IN')}/yr</span>
                </div>
            `;
        }

        const badgeType = uni.admission_type || 'Direct Admission Open';
        let badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        if (badgeType === 'Entrance Exam Required') badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
        if (badgeType === 'Application Only') badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';

        const safeUniName = uni.name.replace(/'/g, "\\'");

        return `
            <div class="bg-white rounded-3xl border border-sky-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-300 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative aspect-[16/9] w-full overflow-hidden bg-sky-50">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-transparent to-transparent"></div>
                        <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/95 text-sky-800 border border-sky-100 shadow-xs">${uni.state}</span>
                        <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                            <span class="text-[10px] font-mono font-bold text-slate-900 bg-white/95 px-2 py-0.5 rounded-lg border border-slate-200">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg border ${badgeClass}">${badgeType}</span>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5">
                        <h3 class="font-black text-base text-slate-900 leading-snug">${uni.name}</h3>
                        <p class="text-xs text-slate-600 mt-1 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-sky-600 mt-0.5 shrink-0"></i>
                            <span>${uni.address}</span>
                        </p>

                        <div class="mt-4 p-3 rounded-2xl bg-sky-50/70 border border-sky-100">
                            <p class="text-[11px] font-bold text-sky-800 mb-2 uppercase tracking-wide">Branch Tuition Fees (Per Year):</p>
                            <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                ${branchRows}
                            </div>
                        </div>

                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                                <span class="text-[10px] text-amber-800 block font-semibold">Hostel Fee</span>
                                <strong class="text-amber-900 text-xs">₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-sky-50/70 border border-sky-100">
                                <span class="text-[10px] text-sky-800 block font-semibold">Application Fee</span>
                                <strong class="text-sky-900 text-xs">₹${Number(uni.application_fee).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-4 sm:p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Scholarship Based on Marks')" class="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                        <i class="fa-solid fa-award"></i> Scholarship Form
                    </button>
                    <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Visiting Application')" class="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                        <i class="fa-solid fa-route"></i> Visiting Application
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// --- SCHOLARSHIP & VISITING APPLICATION MODAL ---
function openScholarshipModal(uniName = '', assistanceType = '') {
    const modal = document.getElementById('scholarship-app-modal');
    if (!modal) return;

    const uniInput = document.getElementById('guide-uni');
    const assistSelect = document.getElementById('guide-assistance');

    if (uniInput && uniName) {
        uniInput.value = uniName;
    }
    if (assistSelect && assistanceType) {
        assistSelect.value = assistanceType;
    }

    prefillGuidanceFormWithStudent();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeScholarshipModal() {
    const modal = document.getElementById('scholarship-app-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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

async function handleGuidanceSubmission(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-guidance');

    const name = document.getElementById('guide-name').value.trim();
    const phone = document.getElementById('guide-phone').value.replace(/\D+/g, '').trim();
    const email = document.getElementById('guide-email').value.trim().toLowerCase();
    const course = document.getElementById('guide-course').value;
    const preferredUni = document.getElementById('guide-uni').value.trim();
    const assistanceType = document.getElementById('guide-assistance').value;

    const interMarks = document.getElementById('guide-inter-marks').value.trim();
    const physics = document.getElementById('guide-physics').value.trim();
    const maths = document.getElementById('guide-maths').value.trim();
    const chemLab = document.getElementById('guide-chemistry-lab').value.trim();
    const pcmTotal = document.getElementById('guide-pcm-total').value.trim();
    const jeeMarks = document.getElementById('guide-jee').value.trim();
    const eamcetRank = document.getElementById('guide-eamcet').value.trim();

    if (!name || !phone || !email || !course || !assistanceType) {
        showToast('Missing Details', 'Please fill out all required fields.', 'error');
        return;
    }

    const academicSummary = [
        interMarks ? `Inter: ${interMarks}/1000` : '',
        pcmTotal ? `PCM: ${pcmTotal}` : '',
        (physics || maths || chemLab) ? `(P:${physics || 0}, M:${maths || 0}, C+Lab:${chemLab || 0})` : '',
        jeeMarks ? `JEE: ${jeeMarks}` : '',
        eamcetRank ? `EAMCET: ${eamcetRank}` : ''
    ].filter(Boolean).join(' | ');

    const payload = {
        id: Date.now(),
        name,
        phone,
        email,
        branch: course,
        uni: preferredUni || 'Not Specified',
        assistance_type: assistanceType,
        inter_marks: interMarks || null,
        pcm_marks: pcmTotal || null,
        physics_marks: physics || null,
        maths_marks: maths || null,
        chemistry_lab_marks: chemLab || null,
        jee_score: academicSummary || jeeMarks || null,
        eamcet_rank: eamcetRank || null,
        referral_code: state.currentStudent?.referred_by_code || state.incomingReferralCode || null,
        status: 'Pending Callback'
    };

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'Submitting...';
        }

        let { error } = await _supabase.from('inquiries').insert([payload]);

        if (error) {
            const coreFallback = {
                id: payload.id,
                name: payload.name,
                phone: payload.phone,
                email: payload.email,
                branch: payload.branch,
                uni: payload.uni,
                jee_score: `${assistanceType}${academicSummary ? ' • ' + academicSummary : ''}`,
                referral_code: payload.referral_code,
                status: 'Pending Callback'
            };
            const retryRes = await _supabase.from('inquiries').insert([coreFallback]);
            error = retryRes.error;
        }

        if (error) {
            showToast('Submission Error', error.message, 'error');
            return;
        }

        state.inquiries.unshift(payload);

        await sendMailNotification({
            to: ADMIN_EMAIL,
            eventType: 'scholarship_or_visiting_submitted',
            subject: `Scholarship / Application Submitted by Student: ${name} (${assistanceType})`,
            text: [
                `Scholarship / application is submitted by student: ${name}`,
                `Type: ${assistanceType}`,
                `Phone: ${phone}`,
                `Email: ${email}`,
                `Course: ${course}`,
                `Preferred University: ${preferredUni || 'Not Specified'}`,
                `Marks / Details: ${academicSummary || 'Not Provided'}`
            ].join('\n'),
            details: payload
        });

        showToast(
            'Application Submitted',
            'Scholarship form submitted! Your expert will reach you within 10 mins.',
            'success'
        );
        e.target.reset();
        document.getElementById('guide-pcm-total').value = '';
        prefillGuidanceFormWithStudent();
        closeScholarshipModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'SUBMIT APPLICATION';
        }
    }
}

// --- STUDENT DETAILS UPDATE (SENDS MAIL ON EVERY UPDATE) ---
async function handleStudentDetailsUpdate(e) {
    e.preventDefault();
    if (!state.currentStudent) return;

    const btn = document.getElementById('btn-update-student-details');
    const updatedName = document.getElementById('upd-student-name').value.trim();
    const updatedPhone = document.getElementById('upd-student-phone').value.replace(/\D+/g, '').trim();
    const updatedCourse = document.getElementById('upd-student-course').value.trim();

    if (!updatedName || !updatedPhone) {
        showToast('Missing Details', 'Student name and phone number are required.', 'error');
        return;
    }

    const studentCode = (state.currentStudent.student_id || state.currentStudent.id || 'GTECH6001').toUpperCase();
    const email = (state.currentStudent.email || '').toLowerCase();

    try {
        if (btn) {
            btn.disabled = true;
            btn.querySelector('span').textContent = 'Updating & Mailing...';
        }

        const updateFields = {
            full_name: updatedName,
            mobile: updatedPhone
        };

        await _supabase
            .from('student_profiles')
            .update(updateFields)
            .eq('email', email);

        state.currentStudent = {
            ...state.currentStudent,
            full_name: updatedName,
            mobile: updatedPhone,
            target_course: updatedCourse || state.currentStudent.target_course || ''
        };
        localStorage.setItem('gtech_student_session', JSON.stringify(state.currentStudent));
        updateHeaderForLoggedInStudent(state.currentStudent);
        renderStudentDashboard();

        await sendMailNotification({
            to: ADMIN_EMAIL,
            eventType: 'student_details_updated',
            subject: `Student Details Updated: ${updatedName} (${studentCode})`,
            text: [
                `Student details have been updated:`,
                `Student ID: ${studentCode}`,
                `Name: ${updatedName}`,
                `Phone: ${updatedPhone}`,
                `Email: ${email}`,
                `Course / University: ${updatedCourse || 'Not Specified'}`
            ].join('\n'),
            details: state.currentStudent
        });

        showToast('Details Updated', 'Your details are saved and sent via email.', 'success');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Save & Send Update Email';
        }
    }
}

// --- AUTH MODAL & OTP HANDLERS ---
function openAuthModal(mode = 'login') {
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

    if (mode === 'register') {
        loginView.classList.add('hidden');
        regView.classList.remove('hidden');
        regTab.className = 'flex-1 py-2 px-3 rounded-xl bg-sky-600 text-white transition';
        loginTab.className = 'flex-1 py-2 px-3 rounded-xl text-slate-700 hover:text-sky-700 transition';
        if (state.incomingReferralCode) {
            const refInput = document.getElementById('reg-referral');
            if (refInput && !refInput.value) refInput.value = state.incomingReferralCode;
        }
    } else {
        regView.classList.add('hidden');
        loginView.classList.remove('hidden');
        loginTab.className = 'flex-1 py-2 px-3 rounded-xl bg-sky-600 text-white transition';
        regTab.className = 'flex-1 py-2 px-3 rounded-xl text-slate-700 hover:text-sky-700 transition';
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

        const studentId = await generateNextGtechStudentId();
        const newStudent = {
            id: studentId,
            student_id: studentId,
            full_name: regData.full_name,
            mobile: regData.mobile,
            email: regData.email,
            referral_code: studentId,
            referred_by_code: regData.referred_by_code || null
        };

        let { data: inserted, error } = await _supabase
            .from('student_profiles')
            .insert([newStudent])
            .select()
            .maybeSingle();

        if (error) {
            const minimalStudent = {
                id: studentId,
                full_name: regData.full_name,
                mobile: regData.mobile,
                email: regData.email,
                referred_by_code: regData.referred_by_code || null
            };
            const retry = await _supabase
                .from('student_profiles')
                .insert([minimalStudent])
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

        await sendMailNotification({
            to: ADMIN_EMAIL,
            eventType: 'new_student_registered',
            subject: `New Student Registered: ${profile.full_name} (${profile.student_id})`,
            text: [
                `New student registered on Gtech Admissions:`,
                `Student ID: ${profile.student_id}`,
                `Name: ${profile.full_name}`,
                `Phone: ${profile.mobile}`,
                `Email: ${profile.email}`,
                `Referral Code Used: ${profile.referred_by_code || 'None'}`
            ].join('\n'),
            details: profile
        });

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

        profile.student_id = profile.student_id || profile.id || 'GTECH6001';
        state.currentStudent = profile;
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));

        updateHeaderForLoggedInStudent(profile);
        prefillGuidanceFormWithStudent();
        closeAuthModal();
        await openStudentDashboardModal('dashboard');
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
                profile.student_id = profile.student_id || profile.id || 'GTECH6001';
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
            profile.student_id = profile.student_id || profile.id || 'GTECH6001';
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

// --- STUDENT DASHBOARD TABS ---
function switchDashboardSection(tabName) {
    state.activeDashboardTab = tabName;
    const tabs = ['dashboard', 'applications', 'referral'];

    tabs.forEach(t => {
        const sectionEl = document.getElementById(`dash-section-${t}`);
        const btnEl = document.getElementById(`dash-tab-btn-${t}`);
        if (!sectionEl || !btnEl) return;

        if (t === tabName) {
            sectionEl.classList.remove('hidden');
            btnEl.className = 'px-3 py-1.5 rounded-lg bg-white text-emerald-900 shadow-xs transition';
        } else {
            sectionEl.classList.add('hidden');
            btnEl.className = 'px-3 py-1.5 rounded-lg text-emerald-100 hover:bg-white/10 transition';
        }
    });
}

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

async function fetchReferredStudents(myCode) {
    if (!myCode) return [];
    const { data, error } = await _supabase
        .from('student_profiles')
        .select('id, student_id, full_name, created_at, referred_by_code')
        .eq('referred_by_code', myCode);

    if (error) {
        console.warn('Referral lookup note:', error.message);
        return [];
    }
    return data || [];
}

async function openStudentDashboardModal(defaultTab = 'dashboard') {
    if (!state.currentStudent) {
        openAuthModal('login');
        return;
    }

    const myCode = (state.currentStudent.referral_code || state.currentStudent.student_id || state.currentStudent.id || 'GTECH6001').toUpperCase();

    await fetchInquiriesFromSupabase();
    state.financeRecord = await fetchStudentFinancialDetails(state.currentStudent);
    state.referredStudents = await fetchReferredStudents(myCode);

    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    switchDashboardSection(defaultTab);
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

    const studentCode = (stu.student_id || stu.id || 'GTECH6001').toUpperCase();
    const myRefCode = (stu.referral_code || studentCode).toUpperCase();

    document.getElementById('dash-topbar-name').textContent = stu.full_name || 'Student Portal';
    document.getElementById('dash-topbar-id').textContent = `Student ID: ${studentCode}`;
    document.getElementById('student-welcome-name').textContent = `Hello, ${stu.full_name}!`;
    document.getElementById('student-dash-id').textContent = studentCode;

    const updName = document.getElementById('upd-student-name');
    const updPhone = document.getElementById('upd-student-phone');
    const updCourse = document.getElementById('upd-student-course');
    if (updName) updName.value = stu.full_name || '';
    if (updPhone) updPhone.value = stu.mobile || '';
    if (updCourse) updCourse.value = stu.target_course || '';

    // 1. MY APPLICATIONS & ENQUIRIES
    const myApps = state.inquiries.filter(inq =>
        (inq.email && stu.email && inq.email.toLowerCase() === stu.email.toLowerCase()) ||
        (inq.phone && stu.mobile && String(inq.phone).includes(String(stu.mobile)))
    );

    const appCardsHtml = myApps.length === 0
        ? `<p class="text-xs text-slate-500">No applications or enquiries submitted yet. Use "+ Scholarship Application" or "+ Visiting Application" to apply.</p>`
        : myApps.map(inq => `
            <div class="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="min-w-0">
                    <strong class="text-slate-900 block break-words">${inq.assistance_type || 'Scholarship Based on Marks'} • ${inq.branch || 'Course'}</strong>
                    <p class="text-slate-600 text-[11px] mt-0.5">Preferred University: ${inq.uni || 'Not Specified'}</p>
                    ${inq.jee_score ? `<p class="text-indigo-700 text-[10px] font-semibold mt-0.5">${inq.jee_score}</p>` : ''}
                </div>
                <span class="self-start sm:self-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] border border-emerald-200 shrink-0">${inq.status || 'Pending Callback'}</span>
            </div>
        `).join('');

    document.getElementById('dash-overview-applications-list').innerHTML = appCardsHtml;
    document.getElementById('student-applications-full-list').innerHTML = appCardsHtml;

    // 2. ADMISSION STATUS
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
        { title: '1. Registered', desc: 'ID Active' },
        { title: '2. Applied', desc: 'Form submitted' },
        { title: '3. Free Visit', desc: 'Campus visit' },
        { title: '4. University Filing', desc: 'Seat processing' },
        { title: '5. Admission Done', desc: 'Confirmed' }
    ];

    document.getElementById('admission-process-flow').innerHTML = steps.map((step, idx) => {
        const done = idx <= activeStepIndex;
        const current = idx === activeStepIndex;
        const style = current
            ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
            : done
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-400';
        return `
            <div class="p-2.5 sm:p-3 rounded-xl border ${style} transition min-w-0">
                <div class="text-[11px] font-extrabold leading-tight">${step.title}</div>
                <div class="text-[10px] opacity-85 mt-0.5 leading-tight">${step.desc}</div>
            </div>
        `;
    }).join('');

    // 3. SCHOLARSHIP & FEE DETAILS
    const fin = state.financeRecord;
    const statusBadge = document.getElementById('finance-record-status');

    let referralEarnings = 0;
    if (fin) {
        statusBadge.textContent = 'Verified Ledger';
        const totalFee = Number(fin.total_university_fee || 0);
        const scholarship = Number(fin.scholarship_amount || 0);
        const appFee = Number(fin.application_fee || 0);
        const hostelFee = Number(fin.hostel_fee || 0);
        referralEarnings = Number(fin.referral_earnings || 0);
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

    // MY REFERRAL TAB DATA
    const shareLink = `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(myRefCode)}`;
    document.getElementById('my-referral-code-text').textContent = myRefCode;
    document.getElementById('my-referral-link-input').value = shareLink;
    document.getElementById('ref-tab-amount').textContent = formatINR(referralEarnings);

    const referralInquiries = state.inquiries.filter(inq =>
        inq.referral_code && String(inq.referral_code).toUpperCase() === myRefCode
    );

    const pendingCount = Math.max(state.referredStudents.length, referralInquiries.length);
    document.getElementById('ref-tab-pending-count').textContent = String(pendingCount);

    const refListEl = document.getElementById('my-referred-students-list');
    if (state.referredStudents.length === 0 && referralInquiries.length === 0) {
        refListEl.innerHTML = `<p class="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border border-slate-200">No pending referral admissions yet. Share your referral link on WhatsApp or Instagram to invite students.</p>`;
    } else {
        const items = state.referredStudents.length > 0
            ? state.referredStudents.map(rs => ({
                name: rs.full_name || 'Referred Student',
                id: rs.student_id || rs.id || '',
                status: 'Admission Pending'
            }))
            : referralInquiries.map(ri => ({
                name: ri.name || 'Referred Applicant',
                id: ri.branch || '',
                status: ri.status || 'Admission Pending'
            }));

        refListEl.innerHTML = items.map(item => `
            <div class="p-3 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                <div>
                    <strong class="text-slate-900 block">${item.name}</strong>
                    ${item.id ? `<span class="text-[11px] font-mono text-slate-600">${item.id}</span>` : ''}
                </div>
                <span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">${item.status}</span>
            </div>
        `).join('');
    }
}

// --- REFERRAL SHARE & COPY HELPERS ---
function copyMyReferralCode() {
    const code = document.getElementById('my-referral-code-text')?.textContent || '';
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        showToast('Code Copied', `Referral code ${code} copied to clipboard.`, 'success');
    });
}

function copyMyReferralLink() {
    const link = document.getElementById('my-referral-link-input')?.value || '';
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link Copied', 'Referral link copied to clipboard.', 'success');
    });
}

function shareReferralWhatsApp() {
    const code = document.getElementById('my-referral-code-text')?.textContent || '';
    const link = document.getElementById('my-referral-link-input')?.value || '';
    const msg = encodeURIComponent(`Join Gtech Admissions (Admissions and Guidance Portal) for B.Tech, Degree & Medical admissions, scholarships, and free campus visits! Use my Referral Code ${code}: ${link}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener');
}

function shareReferralInstagram() {
    const link = document.getElementById('my-referral-link-input')?.value || '';
    if (link) {
        navigator.clipboard.writeText(link).catch(() => {});
    }
    showToast('Ready for Instagram', 'Your referral link is copied—paste it into your Instagram DM or Bio!', 'success');
    window.open('https://www.instagram.com/', '_blank', 'noopener');
}

// Global scope exposure
window.showToast = showToast;
window.hideToast = hideToast;
window.sanitizeNumericInput = sanitizeNumericInput;
window.calculatePcmMarks = calculatePcmMarks;
window.handleOtpBoxInput = handleOtpBoxInput;
window.handleOtpBoxKeydown = handleOtpBoxKeydown;
window.openScholarshipModal = openScholarshipModal;
window.closeScholarshipModal = closeScholarshipModal;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchStudentAuthMode = switchStudentAuthMode;
window.handleSendRegistrationOtp = handleSendRegistrationOtp;
window.handleVerifyRegistrationOtp = handleVerifyRegistrationOtp;
window.handleSendLoginOtp = handleSendLoginOtp;
window.handleVerifyLoginOtp = handleVerifyLoginOtp;
window.handleStudentLogout = handleStudentLogout;
window.handleStudentDetailsUpdate = handleStudentDetailsUpdate;
window.openStudentDashboardModal = openStudentDashboardModal;
window.closeStudentDashboardModal = closeStudentDashboardModal;
window.switchDashboardSection = switchDashboardSection;
window.copyMyReferralCode = copyMyReferralCode;
window.copyMyReferralLink = copyMyReferralLink;
window.shareReferralWhatsApp = shareReferralWhatsApp;
window.shareReferralInstagram = shareReferralInstagram;
window.setStateFilter = setStateFilter;
window.handleGuidanceSubmission = handleGuidanceSubmission;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
