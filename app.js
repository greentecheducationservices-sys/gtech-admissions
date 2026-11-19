const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    students: [],
    referrals: [],
    currentStudent: null,
    currentSlide: 0,
    pendingAction: null,
    incomingReferralCode: ''
};

window.onload = async function() {
    detectIncomingReferralLink();
    restoreStudentSession();
    await fetchUniversitiesFromSupabase();
    await fetchInquiriesFromSupabase();
    await loadActiveCarousel();

    setInterval(() => {
        nextSlide();
    }, 4500);
};

// --- DETECT INCOMING REFERRAL LINK (?ref=GTECH-REF-...) ---
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
        const authRefInput = document.getElementById('auth-referral-code');
        const appRefInput = document.getElementById('app-referral-code');
        if (authRefInput) authRefInput.value = state.incomingReferralCode;
        if (appRefInput) appRefInput.value = state.incomingReferralCode;
    }
}

// --- MODERN UI TOAST NOTIFICATION ---
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

// --- AUTOMATIC PHOTO CROPPER & PREVIEW ---
function cropImageFileToBlob(file, targetWidth, targetHeight) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                const targetRatio = targetWidth / targetHeight;
                const imgRatio = img.width / img.height;

                let drawWidth = img.width;
                let drawHeight = img.height;
                let offsetX = 0;
                let offsetY = 0;

                if (imgRatio > targetRatio) {
                    drawWidth = img.height * targetRatio;
                    offsetX = (img.width - drawWidth) / 2;
                } else {
                    drawHeight = img.width / targetRatio;
                    offsetY = (img.height - drawHeight) / 2;
                }

                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, targetWidth, targetHeight);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to crop image.'));
                }, 'image/jpeg', 0.9);
            };
            img.onerror = () => reject(new Error('Invalid image file selected.'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });
}

async function previewCroppedImage(inputEl, previewImgId, targetWidth, targetHeight) {
    if (!inputEl.files || !inputEl.files[0]) return;
    try {
        const blob = await cropImageFileToBlob(inputEl.files[0], targetWidth, targetHeight);
        const previewEl = document.getElementById(previewImgId);
        if (previewEl) previewEl.src = URL.createObjectURL(blob);
        showToast('Photo Cropped', `Image automatically cropped to ${targetWidth}×${targetHeight} fit.`, 'success');
    } catch (err) {
        showToast('Crop Error', err.message, 'error');
    }
}

async function uploadCroppedImageToBucket(file, prefix, targetWidth, targetHeight) {
    const croppedBlob = await cropImageFileToBlob(file, targetWidth, targetHeight);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, '') + '.jpg';
    const filePath = `${prefix}_${Date.now()}_${safeName}`;

    const { error: uploadError } = await _supabase.storage
        .from('universities')
        .upload(filePath, croppedBlob, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'image/jpeg'
        });

    if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: publicURLData } = _supabase.storage
        .from('universities')
        .getPublicUrl(filePath);

    return publicURLData.publicUrl;
}

// --- CAROUSEL LOGIC ---
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

    if (!error && data) {
        data.forEach(slide => {
            const prevImg = document.getElementById(`carousel-preview-${slide.id}`);
            const titleInput = document.getElementById(`carousel-title-${slide.id}`);
            if (prevImg) prevImg.src = slide.image_url;
            if (titleInput && slide.title) titleInput.value = slide.title;
        });
    }
}

async function handleUploadCarousel(slideNum) {
    const fileInput = document.getElementById(`carousel-file-${slideNum}`);
    const titleInput = document.getElementById(`carousel-title-${slideNum}`);
    const btn = document.getElementById(`btn-upload-carousel-${slideNum}`);

    if (!fileInput.files || !fileInput.files[0]) {
        showToast('Missing File', `Please select an image file for Photo ${slideNum}.`, 'error');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = 'Cropping & Uploading...';
        const imageUrl = await uploadCroppedImageToBucket(fileInput.files[0], `carousel_${slideNum}`, 1600, 640);
        const titleText = titleInput.value.trim() || `GTech Admissions Slide ${slideNum}`;

        const { error: dbError } = await _supabase.from('carousel_images').upsert([
            { id: Number(slideNum), image_url: imageUrl, title: titleText, is_active: true, display_order: Number(slideNum) }
        ], { onConflict: 'id' });

        if (dbError) throw new Error(dbError.message);

        showToast('Carousel Updated', `Carousel Photo ${slideNum} cropped and updated successfully!`, 'success');
        fileInput.value = '';
        await loadActiveCarousel();
    } catch (err) {
        showToast('Upload Failed', err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = `Crop & Upload Photo ${slideNum}`;
    }
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

async function fetchRegisteredStudentsFromSupabase() {
    const { data, error } = await _supabase.from('student_profiles').select('*').order('created_at', { ascending: false });
    if (!error) state.students = data || [];
}

async function fetchReferralsFromSupabase() {
    const { data, error } = await _supabase.from('referral_vouchers').select('*').order('created_at', { ascending: false });
    if (!error) state.referrals = data || [];
}

function setStateFilter(stateName) {
    state.stateFilter = stateName;
    document.querySelectorAll('.state-btn').forEach(btn => {
        if (btn.getAttribute('data-state') === stateName) {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition whitespace-nowrap shrink-0';
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

        let matchesQuery =
            uni.name.toLowerCase().includes(query) ||
            (uni.location && uni.location.toLowerCase().includes(query)) ||
            (uni.address && uni.address.toLowerCase().includes(query)) ||
            uni.state.toLowerCase().includes(query);
        return matchesState && matchesQuery;
    });

    if (!grid) return;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center bg-slate-900 rounded-2xl border border-slate-800">
                <p class="text-slate-400 font-semibold text-xs">No universities match your filter in this category.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(uni => {
        let branchRows = '';
        const branches = typeof uni.branches === 'string' ? JSON.parse(uni.branches) : (uni.branches || {});
        for (const [branch, fee] of Object.entries(branches)) {
            branchRows += `
                <div class="flex justify-between items-center py-1 border-b border-slate-900 text-[11px]">
                    <span class="text-slate-300 font-bold">${branch}</span>
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
            <div class="bg-slate-900/90 rounded-3xl border border-slate-800 overflow-hidden shadow-xl hover:border-indigo-500/40 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative aspect-[16/9] w-full overflow-hidden bg-slate-950">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent"></div>
                        <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-950/85 backdrop-blur-md text-indigo-300 border border-slate-800">${uni.state}</span>
                        <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                            <span class="text-[10px] font-mono font-bold text-white bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-800">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg border backdrop-blur-md ${badgeClass}">${badgeType}</span>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5">
                        <h3 class="font-black text-base text-white leading-snug">${uni.name}</h3>
                        <p class="text-xs text-slate-400 mt-1 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-indigo-400 mt-0.5 shrink-0"></i>
                            <span>${uni.address}</span>
                        </p>

                        <div class="mt-4 p-3 rounded-2xl bg-slate-950/90 border border-slate-800">
                            <p class="text-[11px] font-bold text-indigo-400 mb-2 uppercase tracking-wide">Branch Tuition Fees (Per Year):</p>
                            <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                ${branchRows}
                            </div>
                        </div>

                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                                <span class="text-[10px] text-slate-400 block">Hostel Fee</span>
                                <strong class="text-amber-400 text-xs">₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                                <span class="text-[10px] text-slate-400 block">Application Fee</span>
                                <strong class="text-indigo-300 text-xs">₹${Number(uni.application_fee).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-4 sm:p-5 pt-0">
                    <button type="button" onclick="selectUniForScholarship('${safeUniName}')" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition">
                        <i class="fa-solid fa-graduation-cap"></i> Get Scholarship / Expert Call
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// --- AUTH GATE FOR APPLY, SCHOLARSHIP & REFERRAL ---
function requireAuthForApply(e) {
    if (e) e.preventDefault();
    if (!state.currentStudent) {
        state.pendingAction = { type: 'apply', uniName: '' };
        showToast('Login Required', 'Please login or register first to apply.', 'error');
        openStudentLoginModal();
        return;
    }
    prefillScholarshipFormWithStudent();
    document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
}

function selectUniForScholarship(uniName) {
    if (!state.currentStudent) {
        state.pendingAction = { type: 'apply', uniName: uniName };
        showToast('Login Required', 'Please login or register first to request a scholarship or expert call.', 'error');
        openStudentLoginModal();
        return;
    }
    prefillScholarshipFormWithStudent();
    document.getElementById('app-uni').value = uniName;
    document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
}

function prefillScholarshipFormWithStudent() {
    if (!state.currentStudent) return;
    const nameEl = document.getElementById('app-name');
    const phoneEl = document.getElementById('app-phone');
    const emailEl = document.getElementById('app-email');
    const refEl = document.getElementById('app-referral-code');
    if (nameEl && !nameEl.value) nameEl.value = state.currentStudent.full_name || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = state.currentStudent.mobile || '';
    if (emailEl && !emailEl.value) emailEl.value = state.currentStudent.email || '';
    if (refEl && !refEl.value) {
        refEl.value = state.currentStudent.referred_by_code || state.incomingReferralCode || '';
    }
}

async function handleScholarshipInquiry(e) {
    e.preventDefault();

    if (!state.currentStudent) {
        state.pendingAction = { type: 'submit_form' };
        showToast('Login Required', 'Please login or register first to submit your scholarship application.', 'error');
        openStudentLoginModal();
        return;
    }

    const name = document.getElementById('app-name').value.trim();
    const phone = document.getElementById('app-phone').value.trim();
    const parentPhone = document.getElementById('app-parent-phone').value.trim();
    const email = (document.getElementById('app-email').value.trim() || state.currentStudent.email).toLowerCase();
    const address = document.getElementById('app-address').value.trim();
    const jee = document.getElementById('app-jee').value.trim();
    const inter = document.getElementById('app-inter').value.trim();
    const pcm = Number(document.getElementById('app-pcm').value.trim());
    const uni = document.getElementById('app-uni').value.trim();
    const branch = document.getElementById('app-branch').value;
    const referralCode = document.getElementById('app-referral-code').value.trim().toUpperCase();

    const basePayload = {
        id: Date.now(),
        name,
        phone,
        parent_phone: parentPhone,
        email,
        address,
        inter,
        pcm,
        uni,
        branch,
        referral_code: referralCode || null,
        status: 'Pending Callback'
    };

    let { error } = await _supabase.from('inquiries').insert([{ ...basePayload, jee_score: jee }]);

    if (error && error.message && error.message.includes('jee_score')) {
        const fallbackRes = await _supabase.from('inquiries').insert([{ ...basePayload, jee: jee }]);
        error = fallbackRes.error;
    }

    if (error) {
        showToast('Submission Error', error.message, 'error');
        return;
    }

    state.inquiries.unshift({ ...basePayload, jee_score: jee });
    showToast('Application Submitted', 'Our team will review your application and reach out via WhatsApp within 10 minutes.', 'success');
    e.target.reset();
    prefillScholarshipFormWithStudent();
}

// --- 5-STEP REFERRAL SYSTEM (LOGIN REQUIRED FIRST) ---
async function handleGenerateReferralClick() {
    if (!state.currentStudent) {
        state.pendingAction = { type: 'referral' };
        showToast('Login Required', 'Please login or register first to generate your GTech referral link.', 'error');
        openStudentLoginModal();
        return;
    }

    const stu = state.currentStudent;
    const cleanName = stu.full_name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'STUDENT';
    const last4 = (stu.mobile || '5001').slice(-4);
    const code = `GTECH-REF-${cleanName}-${last4}`;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?ref=${encodeURIComponent(code)}`;

    const { error } = await _supabase.from('referral_vouchers').upsert([
        {
            student_phone: stu.mobile,
            student_name: stu.full_name,
            referrer_email: stu.email,
            code: code,
            status: 'ACTIVE',
            reward_status: 'Pending Friend Admission'
        }
    ], { onConflict: 'code' });

    if (error) {
        console.warn('Referral DB sync note:', error.message);
    }

    document.getElementById('generated-code-display').textContent = code;
    document.getElementById('generated-link-display').textContent = shareUrl;
    document.getElementById('generated-code-box').classList.remove('hidden');
    document.getElementById('referral-section').scrollIntoView({ behavior: 'smooth' });

    showToast('Referral Link Ready', 'Share your unique referral link via WhatsApp or Instagram!', 'success');
}

function copyReferralLink() {
    const link = document.getElementById('generated-link-display').textContent;
    if (!link) return;
    navigator.clipboard.writeText(link);
    showToast('Link Copied', 'Referral link copied! Paste it in WhatsApp, Instagram bio/DM, or SMS.', 'success');
}

function shareWhatsApp() {
    const code = document.getElementById('generated-code-display').textContent;
    const link = document.getElementById('generated-link-display').textContent;
    const text = encodeURIComponent(`Hey! Apply for B.Tech / Engineering admissions through GTech Admissions using my referral link:\n${link}\n\nReferral Coupon Code: *${code}*\nUnlock merit scholarships & fee concessions!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function shareInstagram() {
    const link = document.getElementById('generated-link-display').textContent;
    navigator.clipboard.writeText(link);
    showToast('Link Copied for Instagram', 'Your referral link is copied! Opening Instagram so you can paste & share it in DM or Story.', 'success');
    setTimeout(() => {
        window.open('https://www.instagram.com/', '_blank');
    }, 800);
}

// --- PASSWORDLESS & OTP-FREE STUDENT AUTHENTICATION ---
let authMode = 'login';

function openStudentLoginModal() {
    document.getElementById('student-login-modal').classList.remove('hidden');
    document.getElementById('student-login-modal').classList.add('flex');
    switchAuthMode('login');
}

function switchAuthMode(mode) {
    authMode = mode;
    const title = document.getElementById('auth-modal-title');
    const subtitle = document.getElementById('auth-modal-subtitle');
    const subBtn = document.getElementById('auth-submit-btn');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const nameBox = document.getElementById('name-field-box');
    const mobileBox = document.getElementById('mobile-field-box');
    const refBox = document.getElementById('referral-field-box');
    const nameInput = document.getElementById('auth-name');
    const mobileInput = document.getElementById('auth-mobile');

    if (mode === 'signup') {
        tabSignup.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        tabLogin.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
        title.textContent = 'Register with GTech';
        subtitle.textContent = 'Enter your Name, Email, Phone Number & optional Referral Coupon.';
        subBtn.textContent = 'Register Now';
        nameBox.classList.remove('hidden');
        mobileBox.classList.remove('hidden');
        refBox.classList.remove('hidden');
        nameInput.required = true;
        mobileInput.required = true;
        if (state.incomingReferralCode) {
            document.getElementById('auth-referral-code').value = state.incomingReferralCode;
        }
    } else {
        tabLogin.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        tabSignup.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
        title.textContent = 'Student Portal Login';
        subtitle.textContent = 'Enter your registered email to open your dashboard.';
        subBtn.textContent = 'Login with Email';
        nameBox.classList.add('hidden');
        mobileBox.classList.add('hidden');
        refBox.classList.add('hidden');
        nameInput.required = false;
        mobileInput.required = false;
    }
}

async function handleStudentAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim().toLowerCase();

    if (authMode === 'signup') {
        const name = document.getElementById('auth-name').value.trim();
        const mobile = document.getElementById('auth-mobile').value.trim();
        const refCoupon = document.getElementById('auth-referral-code').value.trim().toUpperCase();

        const studentRecord = {
            id: 'stu_' + Date.now(),
            full_name: name,
            mobile: mobile,
            email: email,
            address: 'Ongole',
            referred_by_code: refCoupon || state.incomingReferralCode || null
        };

        const { error } = await _supabase.from('student_profiles').upsert([studentRecord], { onConflict: 'email' });
        if (error) {
            showToast('Registration Failed', error.message, 'error');
            return;
        }

        showToast('Registration Complete', 'You are successfully registered with GTech! Please login with your email.', 'success');
        switchAuthMode('login');
        document.getElementById('auth-email').value = email;
    } else {
        const { data: profile, error } = await _supabase
            .from('student_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !profile) {
            showToast('Account Not Found', 'Email not registered yet. Please complete registration first.', 'error');
            switchAuthMode('signup');
            document.getElementById('auth-email').value = email;
            return;
        }

        state.currentStudent = profile;
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));
        updateHeaderForLoggedInStudent(profile);
        prefillScholarshipFormWithStudent();

        document.getElementById('student-login-modal').classList.add('hidden');
        showToast('Welcome Back!', 'You are successfully logged in with GTech!', 'success');

        if (state.pendingAction) {
            const action = state.pendingAction;
            state.pendingAction = null;
            if (action.type === 'referral') {
                handleGenerateReferralClick();
            } else {
                if (action.uniName) {
                    document.getElementById('app-uni').value = action.uniName;
                }
                document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            openStudentDashboardModal();
        }
    }
}

function restoreStudentSession() {
    const saved = localStorage.getItem('gtech_student_session');
    if (saved) {
        try {
            const profile = JSON.parse(saved);
            state.currentStudent = profile;
            updateHeaderForLoggedInStudent(profile);
            prefillScholarshipFormWithStudent();
        } catch (e) {
            localStorage.removeItem('gtech_student_session');
        }
    }
}

function updateHeaderForLoggedInStudent(profile) {
    const dashBtn = document.getElementById('header-dashboard-btn');
    const loginBtn = document.getElementById('header-login-btn');
    const nameSpan = document.getElementById('header-student-name');

    if (dashBtn && loginBtn && nameSpan) {
        dashBtn.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        nameSpan.textContent = `${profile.full_name} (Dashboard)`;
    }
}

async function openStudentDashboardModal() {
    if (!state.currentStudent) {
        openStudentLoginModal();
        return;
    }
    await fetchInquiriesFromSupabase();
    await fetchReferralsFromSupabase();

    document.getElementById('student-dash-title').textContent = `Hello, ${state.currentStudent.full_name}!`;
    document.getElementById('student-dash-email').textContent = `${state.currentStudent.email} • ${state.currentStudent.mobile}`;

    document.getElementById('student-dashboard-modal').classList.remove('hidden');
    document.getElementById('student-dashboard-modal').classList.add('flex');
    loadStudentDashboardData();
}

function loadStudentDashboardData() {
    const appContainer = document.getElementById('student-applications-list');
    const voucherContainer = document.getElementById('student-vouchers-list');
    const flowContainer = document.getElementById('admission-process-flow');
    const stageBadge = document.getElementById('dash-current-stage-badge');
    const stu = state.currentStudent;

    const myApps = state.inquiries.filter(inq =>
        (inq.email && stu.email && inq.email.toLowerCase() === stu.email.toLowerCase()) ||
        (inq.phone && stu.mobile && inq.phone.includes(stu.mobile))
    );

    let activeStepIndex = 0;
    let latestStatusLabel = 'Registered';

    if (myApps.length > 0) {
        activeStepIndex = 1;
        latestStatusLabel = myApps[0].status || 'Pending Callback';
        const statusLower = latestStatusLabel.toLowerCase();
        if (statusLower.includes('completed') && !statusLower.includes('application') && !statusLower.includes('admission')) {
            activeStepIndex = 2;
        } else if (statusLower.includes('visiting')) {
            activeStepIndex = 2;
        } else if (statusLower.includes('application')) {
            activeStepIndex = 3;
        } else if (statusLower.includes('admission')) {
            activeStepIndex = 4;
        }
    }

    if (stageBadge) stageBadge.textContent = latestStatusLabel;

    const steps = [
        { title: '1. Registered', desc: 'Account active' },
        { title: '2. Enquiry Sent', desc: 'Details submitted' },
        { title: '3. Call / Visit', desc: 'Counselor & visit' },
        { title: '4. Application', desc: 'Form completed' },
        { title: '5. Admission Done', desc: 'Seat confirmed' }
    ];

    if (flowContainer) {
        flowContainer.innerHTML = steps.map((step, idx) => {
            const done = idx <= activeStepIndex;
            const current = idx === activeStepIndex;
            const cardStyle = current
                ? 'bg-indigo-600/20 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                : done
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-900/70 border-slate-800 text-slate-500';
            return `
                <div class="p-2.5 sm:p-3 rounded-xl border ${cardStyle} transition min-w-0">
                    <div class="text-[11px] font-extrabold leading-tight">${step.title}</div>
                    <div class="text-[10px] opacity-80 mt-0.5 leading-tight">${step.desc}</div>
                </div>
            `;
        }).join('');
    }

    if (myApps.length === 0) {
        appContainer.innerHTML = `<p class="text-xs text-slate-500 break-words">No applications found for ${stu.email}. Submit your scholarship application from the form below.</p>`;
    } else {
        appContainer.innerHTML = myApps.map(inq => `
            <div class="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="min-w-0">
                    <strong class="text-white block break-words">${inq.uni} (${inq.branch})</strong>
                    <p class="text-slate-400 text-[10px] mt-0.5">Student: ${inq.name} | PCM: ${inq.pcm}/600</p>
                </div>
                <span class="self-start sm:self-center px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-[10px] border border-emerald-500/30 shrink-0">${inq.status}</span>
            </div>
        `).join('');
    }

    const myReferrals = state.referrals.filter(r =>
        (r.referrer_email && stu.email && r.referrer_email.toLowerCase() === stu.email.toLowerCase()) ||
        (r.student_phone && stu.mobile && r.student_phone === stu.mobile)
    );

    if (myReferrals.length === 0) {
        voucherContainer.innerHTML = `<p class="text-xs text-slate-500">Click "+ Get / View Referral Link" above to generate your unique GTech referral ID & share link.</p>`;
    } else {
        voucherContainer.innerHTML = myReferrals.map(v => `
            <div class="p-3 bg-slate-900 rounded-xl border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="min-w-0">
                    <span class="font-mono font-bold text-amber-400 text-xs sm:text-sm tracking-wider break-all">${v.code}</span>
                    <p class="text-slate-400 text-[10px] mt-0.5">Status: <strong class="text-emerald-300">${v.reward_status || 'Pending Friend Admission'}</strong></p>
                </div>
                <button onclick="navigator.clipboard.writeText('${window.location.origin + window.location.pathname}?ref=${v.code}'); showToast('Copied', 'Referral link copied!', 'success');" class="self-start sm:self-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-[10px] shrink-0">Copy Referral Link</button>
            </div>
        `).join('');
    }
}

// --- ADMIN PANEL (MOBILE + DESKTOP RESPONSIVE) ---
function openAdminModal() {
    document.getElementById('admin-modal').classList.remove('hidden');
    document.getElementById('admin-modal').classList.add('flex');
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const userId = document.getElementById('admin-userid-input').value.trim();
    const password = document.getElementById('admin-pass-input').value;

    if (userId === 'GTECH9347' && password === 'HARSHA@123') {
        document.getElementById('admin-modal').classList.add('hidden');
        document.getElementById('admin-dashboard-modal').classList.remove('hidden');
        document.getElementById('admin-dashboard-modal').classList.add('flex');
        await fetchInquiriesFromSupabase();
        await fetchRegisteredStudentsFromSupabase();
        await fetchReferralsFromSupabase();
        loadAdminDashboardData();
        showToast('Admin Authenticated', 'Welcome to the GTech Admin Control Panel.', 'success');
    } else {
        showToast('Access Denied', 'Invalid User ID or Password.', 'error');
    }
}

async function switchAdminTab(tabName) {
    const tabs = ['inquiries', 'students', 'referrals', 'universities', 'carousel'];
    tabs.forEach(t => {
        const panel = document.getElementById(`admin-tab-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (panel) panel.classList.add('hidden');
        if (btn) btn.className = 'py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0 font-bold';
    });

    const activePanel = document.getElementById(`admin-tab-${tabName}`);
    const activeBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeBtn) activeBtn.className = 'py-2.5 border-b-2 border-indigo-500 text-indigo-400 whitespace-nowrap shrink-0 font-bold';

    if (tabName === 'inquiries') {
        await fetchInquiriesFromSupabase();
        loadAdminDashboardData();
    } else if (tabName === 'students') {
        await fetchRegisteredStudentsFromSupabase();
        loadAdminStudentsTable();
    } else if (tabName === 'referrals') {
        await fetchReferralsFromSupabase();
        loadAdminReferralsTable();
    } else if (tabName === 'universities') {
        loadAdminUnisTable();
    }
}

function loadAdminDashboardData() {
    const tbody = document.getElementById('admin-inquiries-tbody');
    const mobileList = document.getElementById('admin-inquiries-mobile');

    if (state.inquiries.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No student scholarship inquiries yet.</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">No student scholarship inquiries yet.</div>`;
        return;
    }

    const statusOptions = [
        'Pending Callback',
        'Completed',
        'Visiting',
        'Application Completed',
        'Admission Completed'
    ];

    if (tbody) {
        tbody.innerHTML = state.inquiries.map(inq => {
            const currentStatus = inq.status || 'Pending Callback';
            const optionsHtml = statusOptions.map(opt =>
                `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            const jeeVal = inq.jee_score || inq.jee || 'N/A';

            return `
                <tr class="hover:bg-slate-900/60">
                    <td class="p-3">
                        <strong class="text-white block">${inq.name}</strong>
                        <a href="tel:${inq.phone}" class="text-indigo-300 font-mono text-[10px] hover:underline">${inq.phone}</a>
                        ${inq.email ? `<span class="text-slate-500 text-[10px] block">${inq.email}</span>` : ''}
                    </td>
                    <td class="p-3">
                        <span class="text-slate-300 block">Parent: ${inq.parent_phone || 'N/A'}</span>
                        <span class="text-slate-500 text-[10px] truncate max-w-xs block" title="${inq.address}">${inq.address}</span>
                    </td>
                    <td class="p-3 text-slate-300">
                        JEE: <strong>${jeeVal}</strong> | Inter: <strong>${inq.inter}</strong><br>
                        PCM: <strong class="text-emerald-400">${inq.pcm}/600</strong>
                    </td>
                    <td class="p-3">
                        <strong class="text-white">${inq.uni}</strong>
                        <span class="text-indigo-400 font-bold block">${inq.branch}</span>
                    </td>
                    <td class="p-3">
                        ${inq.referral_code ? `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] border border-amber-500/30">${inq.referral_code}</span>` : '<span class="text-slate-600">—</span>'}
                    </td>
                    <td class="p-3">
                        <select onchange="updateInquiryStatus(${inq.id}, this.value)" class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 focus:outline-none focus:border-indigo-500">
                            ${optionsHtml}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (mobileList) {
        mobileList.innerHTML = state.inquiries.map(inq => {
            const currentStatus = inq.status || 'Pending Callback';
            const optionsHtml = statusOptions.map(opt =>
                `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <div class="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <strong class="text-white text-sm block">${inq.name}</strong>
                            <a href="tel:${inq.phone}" class="text-indigo-300 font-mono text-[11px]">${inq.phone}</a>
                        </div>
                        <span class="px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 font-bold text-[10px] border border-indigo-500/30">${inq.branch}</span>
                    </div>
                    <div class="text-[11px] text-slate-300">
                        <strong>${inq.uni}</strong> • PCM: <span class="text-emerald-400 font-bold">${inq.pcm}/600</span> • Inter: ${inq.inter}
                    </div>
                    <div class="text-[10px] text-slate-400 break-words">
                        Parent: ${inq.parent_phone || 'N/A'} • ${inq.address}
                    </div>
                    ${inq.referral_code ? `<div class="text-[10px] text-amber-300 font-mono">Coupon: ${inq.referral_code}</div>` : ''}
                    <div class="pt-1">
                        <label class="block text-[10px] text-slate-400 mb-1">Update Status</label>
                        <select onchange="updateInquiryStatus(${inq.id}, this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-emerald-300 focus:outline-none focus:border-indigo-500">
                            ${optionsHtml}
                        </select>
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function updateInquiryStatus(inquiryId, newStatus) {
    const { error } = await _supabase
        .from('inquiries')
        .update({ status: newStatus })
        .eq('id', inquiryId);

    if (error) {
        showToast('Update Failed', error.message, 'error');
        return;
    }

    const idx = state.inquiries.findIndex(item => item.id === inquiryId);
    if (idx !== -1) state.inquiries[idx].status = newStatus;

    showToast('Status Updated', `Call / Application status updated to "${newStatus}".`, 'success');
}

function loadAdminStudentsTable() {
    const tbody = document.getElementById('admin-students-tbody');
    const mobileList = document.getElementById('admin-students-mobile');
    const countBadge = document.getElementById('total-students-count');
    if (countBadge) countBadge.textContent = `${state.students.length} Registered Students`;

    if (state.students.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No students have registered yet.</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">No students have registered yet.</div>`;
        return;
    }

    if (tbody) {
        tbody.innerHTML = state.students.map(stu => {
            const regDate = stu.created_at ? new Date(stu.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent';
            return `
                <tr class="hover:bg-slate-900/60">
                    <td class="p-3 font-bold text-white">${stu.full_name}</td>
                    <td class="p-3 text-indigo-300 font-mono">${stu.email}</td>
                    <td class="p-3 text-emerald-300 font-mono"><a href="tel:${stu.mobile}" class="hover:underline">${stu.mobile}</a></td>
                    <td class="p-3">${stu.referred_by_code ? `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">${stu.referred_by_code}</span>` : '<span class="text-slate-600">Direct</span>'}</td>
                    <td class="p-3 text-slate-400">${regDate}</td>
                </tr>
            `;
        }).join('');
    }

    if (mobileList) {
        mobileList.innerHTML = state.students.map(stu => {
            const regDate = stu.created_at ? new Date(stu.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent';
            return `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-white">${stu.full_name}</strong>
                        <span class="text-[10px] text-slate-500">${regDate}</span>
                    </div>
                    <p class="text-indigo-300 font-mono text-[11px] break-all">${stu.email}</p>
                    <p class="text-emerald-300 font-mono text-[11px]">${stu.mobile}</p>
                    ${stu.referred_by_code ? `<span class="inline-block px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">Ref: ${stu.referred_by_code}</span>` : ''}
                </div>
            `;
        }).join('');
    }
}

function loadAdminReferralsTable() {
    const tbody = document.getElementById('admin-referrals-tbody');
    const mobileList = document.getElementById('admin-referrals-mobile');

    if (state.referrals.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No student referral IDs generated yet.</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">No student referral IDs generated yet.</div>`;
        return;
    }

    const rewardStatuses = [
        'Pending Friend Admission',
        'Friend Applied - Under Verification',
        'Admission Confirmed - Reward Approved',
        'Reward Paid / Credited'
    ];

    if (tbody) {
        tbody.innerHTML = state.referrals.map(ref => {
            const currentReward = ref.reward_status || 'Pending Friend Admission';
            const optionsHtml = rewardStatuses.map(opt =>
                `<option value="${opt}" ${currentReward === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <tr class="hover:bg-slate-900/60">
                    <td class="p-3 font-bold text-white">${ref.student_name}</td>
                    <td class="p-3 text-slate-300 font-mono">${ref.student_phone}<br><span class="text-[10px] text-slate-500">${ref.referrer_email || ''}</span></td>
                    <td class="p-3 font-mono font-bold text-amber-400">${ref.code}</td>
                    <td class="p-3">
                        <select onchange="updateReferralRewardStatus('${ref.code}', this.value)" class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-amber-300 focus:outline-none focus:border-amber-400">
                            ${optionsHtml}
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (mobileList) {
        mobileList.innerHTML = state.referrals.map(ref => {
            const currentReward = ref.reward_status || 'Pending Friend Admission';
            const optionsHtml = rewardStatuses.map(opt =>
                `<option value="${opt}" ${currentReward === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div class="font-bold text-white">${ref.student_name}</div>
                    <div class="font-mono text-amber-400 text-xs break-all">${ref.code}</div>
                    <div class="text-[10px] text-slate-400">${ref.student_phone} • ${ref.referrer_email || ''}</div>
                    <select onchange="updateReferralRewardStatus('${ref.code}', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-400">
                        ${optionsHtml}
                    </select>
                </div>
            `;
        }).join('');
    }
}

async function updateReferralRewardStatus(code, newRewardStatus) {
    const { error } = await _supabase
        .from('referral_vouchers')
        .update({ reward_status: newRewardStatus })
        .eq('code', code);

    if (error) {
        showToast('Update Failed', error.message, 'error');
        return;
    }

    showToast('Referral Updated', `Referral ${code} updated to "${newRewardStatus}".`, 'success');
}

function loadAdminUnisTable() {
    const tbody = document.getElementById('admin-unis-tbody');
    const mobileList = document.getElementById('admin-unis-mobile');

    if (tbody) {
        tbody.innerHTML = state.universities.map(uni => `
            <tr class="hover:bg-slate-900/60">
                <td class="p-3 flex items-center gap-2.5">
                    <img src="${uni.image}" class="w-8 h-8 rounded-lg object-cover shrink-0">
                    <div>
                        <strong class="text-white block text-[11px]">${uni.name}</strong>
                        <span class="text-[9px] text-slate-400">${uni.location}</span>
                    </div>
                </td>
                <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">${uni.admission_type || 'Direct Admission Open'}</span></td>
                <td class="p-3 text-amber-400 font-bold">₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</td>
                <td class="p-3 text-indigo-300 font-bold">₹${Number(uni.application_fee).toLocaleString('en-IN')}</td>
                <td class="p-3 text-right space-x-1.5">
                    <button onclick="openEditUniModal('${uni.id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[10px]">Edit</button>
                    <button onclick="handleDeleteUni('${uni.id}')" class="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-md text-[10px]">Del</button>
                </td>
            </tr>
        `).join('');
    }

    if (mobileList) {
        mobileList.innerHTML = state.universities.map(uni => `
            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div class="flex items-center gap-2.5">
                    <img src="${uni.image}" class="w-10 h-10 rounded-lg object-cover shrink-0">
                    <div class="min-w-0">
                        <strong class="text-white block text-xs truncate">${uni.name}</strong>
                        <span class="text-[10px] text-slate-400">${uni.location}</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span class="text-amber-400 font-bold">Hostel: ₹${Number(uni.hostel_fee).toLocaleString('en-IN')}/yr</span>
                    <span class="text-indigo-300 font-bold">App: ₹${Number(uni.application_fee).toLocaleString('en-IN')}</span>
                </div>
                <div class="flex items-center justify-between gap-2 pt-1">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">${uni.admission_type || 'Direct Admission Open'}</span>
                    <div class="space-x-1.5 shrink-0">
                        <button onclick="openEditUniModal('${uni.id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-bold">Edit</button>
                        <button onclick="handleDeleteUni('${uni.id}')" class="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-[10px] font-bold">Del</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function openAddUniModal() {
    document.getElementById('uni-modal-title').textContent = 'Add University & Fees';
    document.getElementById('edit-uni-id').value = '';
    document.getElementById('modal-uni-name').value = '';
    document.getElementById('modal-uni-loc').value = '';
    document.getElementById('modal-uni-address').value = '';
    document.getElementById('modal-uni-hostelfee').value = '';
    document.getElementById('modal-uni-appfee').value = '1000';
    document.getElementById('modal-uni-admission').value = 'Direct Admission Open';
    document.getElementById('modal-uni-image-url').value = '';
    document.getElementById('modal-uni-file').value = '';
    document.getElementById('uni-card-preview').src = 'https://images.unsplash.com/photo-1523050854058?q=80&w=800&auto=format&fit=crop';
    document.getElementById('uni-modal').classList.remove('hidden');
    document.getElementById('uni-modal').classList.add('flex');
}

function openEditUniModal(id) {
    const uni = state.universities.find(u => u.id === id);
    if (!uni) return;
    document.getElementById('uni-modal-title').textContent = 'Edit University & Fees';
    document.getElementById('edit-uni-id').value = uni.id;
    document.getElementById('modal-uni-name').value = uni.name;
    document.getElementById('modal-uni-state').value = uni.state;
    document.getElementById('modal-uni-loc').value = uni.location;
    document.getElementById('modal-uni-address').value = uni.address;
    document.getElementById('modal-uni-hostelfee').value = uni.hostel_fee;
    document.getElementById('modal-uni-appfee').value = uni.application_fee;
    document.getElementById('modal-uni-admission').value = uni.admission_type || 'Direct Admission Open';
    document.getElementById('modal-uni-image-url').value = uni.image;
    document.getElementById('uni-card-preview').src = uni.image;
    document.getElementById('modal-uni-file').value = '';

    const branches = typeof uni.branches === 'string' ? JSON.parse(uni.branches) : (uni.branches || {});
    document.getElementById('fee-ece').value = branches['ECE'] || 190000;
    document.getElementById('fee-cseaiml').value = branches['CSE AI & ML'] || 230000;
    document.getElementById('fee-aiandds').value = branches['AI & DS'] || 225000;
    document.getElementById('fee-ds').value = branches['Data Science'] || 215000;
    document.getElementById('fee-cse').value = branches['CSE'] || 210000;
    document.getElementById('fee-cseit').value = branches['CSE IT'] || 200000;
    document.getElementById('fee-eee').value = branches['EEE'] || 175000;
    document.getElementById('fee-mech').value = branches['Mechanical'] || 160000;

    document.getElementById('uni-modal').classList.remove('hidden');
    document.getElementById('uni-modal').classList.add('flex');
}

async function handleSaveUni(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-save-uni');
    const editId = document.getElementById('edit-uni-id').value;
    const name = document.getElementById('modal-uni-name').value.trim();
    const stateName = document.getElementById('modal-uni-state').value;
    const location = document.getElementById('modal-uni-loc').value.trim();
    const address = document.getElementById('modal-uni-address').value.trim();
    const hostelFee = Number(document.getElementById('modal-uni-hostelfee').value);
    const applicationFee = Number(document.getElementById('modal-uni-appfee').value);
    const admissionType = document.getElementById('modal-uni-admission').value;

    const fileInput = document.getElementById('modal-uni-file');
    let imageUrl = document.getElementById('modal-uni-image-url').value;

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Cropping & Saving...';

        if (fileInput.files && fileInput.files[0]) {
            imageUrl = await uploadCroppedImageToBucket(fileInput.files[0], 'uni', 800, 450);
        }

        const branches = {
            'ECE': Number(document.getElementById('fee-ece').value),
            'CSE AI & ML': Number(document.getElementById('fee-cseaiml').value),
            'AI & DS': Number(document.getElementById('fee-aiandds').value),
            'Data Science': Number(document.getElementById('fee-ds').value),
            'CSE': Number(document.getElementById('fee-cse').value),
            'CSE IT': Number(document.getElementById('fee-cseit').value),
            'EEE': Number(document.getElementById('fee-eee').value),
            'Mechanical': Number(document.getElementById('fee-mech').value)
        };

        const uniPayload = {
            name,
            state: stateName,
            location,
            address,
            hostel_fee: hostelFee,
            application_fee: applicationFee,
            admission_type: admissionType,
            image: imageUrl || 'https://images.unsplash.com/photo-1523050854058?q=80&w=800&auto=format&fit=crop',
            nirf: Math.floor(Math.random() * 80) + 20,
            branches: branches
        };

        if (editId) {
            const { error } = await _supabase.from('universities').update(uniPayload).eq('id', editId);
            if (error) throw new Error(error.message);
        } else {
            uniPayload.id = 'uni-' + Date.now();
            const { error } = await _supabase.from('universities').insert([uniPayload]);
            if (error) throw new Error(error.message);
        }

        document.getElementById('uni-modal').classList.add('hidden');
        await fetchUniversitiesFromSupabase();
        loadAdminUnisTable();
        showToast('University Saved', 'University saved with cropped card photo!', 'success');
    } catch (err) {
        showToast('Save Failed', err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Crop & Save University';
    }
}

async function handleDeleteUni(id) {
    if (confirm('Delete this university from catalog?')) {
        await _supabase.from('universities').delete().eq('id', id);
        await fetchUniversitiesFromSupabase();
        loadAdminUnisTable();
        showToast('University Deleted', 'University removed from catalog.', 'success');
    }
}

// Global scope exposure
window.showToast = showToast;
window.hideToast = hideToast;
window.previewCroppedImage = previewCroppedImage;
window.requireAuthForApply = requireAuthForApply;
window.openStudentLoginModal = openStudentLoginModal;
window.openStudentDashboardModal = openStudentDashboardModal;
window.switchAuthMode = switchAuthMode;
window.handleStudentAuth = handleStudentAuth;
window.openAdminModal = openAdminModal;
window.handleAdminLogin = handleAdminLogin;
window.switchAdminTab = switchAdminTab;
window.updateInquiryStatus = updateInquiryStatus;
window.updateReferralRewardStatus = updateReferralRewardStatus;
window.openAddUniModal = openAddUniModal;
window.openEditUniModal = openEditUniModal;
window.handleSaveUni = handleSaveUni;
window.handleDeleteUni = handleDeleteUni;
window.setStateFilter = setStateFilter;
window.selectUniForScholarship = selectUniForScholarship;
window.handleScholarshipInquiry = handleScholarshipInquiry;
window.handleGenerateReferralClick = handleGenerateReferralClick;
window.copyReferralLink = copyReferralLink;
window.shareWhatsApp = shareWhatsApp;
window.shareInstagram = shareInstagram;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.handleUploadCarousel = handleUploadCarousel;
