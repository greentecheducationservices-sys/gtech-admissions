const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    students: [],
    currentStudent: null,
    currentSlide: 0,
    pendingAction: null // Stores action triggered before login (e.g., { type: 'apply', uniName: '...' })
};

window.onload = async function() {
    restoreStudentSession();
    await fetchUniversitiesFromSupabase();
    await fetchInquiriesFromSupabase();
    await loadActiveCarousel();

    setInterval(() => {
        nextSlide();
    }, 4500);
};

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
        toast.className = 'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl bg-slate-900 border border-rose-500/60 text-white shadow-2xl shadow-rose-500/10 max-w-sm transition-all duration-300';
        icon.className = 'w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 font-bold text-sm';
        icon.textContent = '!';
    } else {
        toast.className = 'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl bg-slate-900 border border-emerald-500/60 text-white shadow-2xl shadow-emerald-500/10 max-w-sm transition-all duration-300';
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

// --- AUTOMATIC PHOTO CROPPER & PREVIEW (CARDS & CAROUSEL) ---
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
                    // Image is wider than target -> crop sides
                    drawWidth = img.height * targetRatio;
                    offsetX = (img.width - drawWidth) / 2;
                } else {
                    // Image is taller than target -> crop top & bottom
                    drawHeight = img.width / targetRatio;
                    offsetY = (img.height - drawHeight) / 2;
                }

                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, targetWidth, targetHeight);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to crop image.'));
                    }
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
        if (previewEl) {
            previewEl.src = URL.createObjectURL(blob);
        }
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
        throw new Error(`Storage upload failed: ${uploadError.message}. Ensure the 'universities' bucket exists and has public policies.`);
    }

    const { data: publicURLData } = _supabase.storage
        .from('universities')
        .getPublicUrl(filePath);

    return publicURLData.publicUrl;
}

// --- CAROUSEL LOGIC (FIXED FOR SLIDE 1 & SLIDE 2) ---
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
    const { data, error } = await _supabase
        .from('carousel_images')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true });

    if (!error && data && data.length > 0) {
        const carousel = document.getElementById('about-carousel');
        if (!carousel) return;

        // Ensure at least 2 slides exist if only 1 was uploaded in DB
        const slides = [...data];
        if (slides.length === 1) {
            slides.push({
                id: 2,
                image_url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1600&auto=format&fit=crop',
                title: 'Top NIRF Ranked Universities Across India'
            });
        }

        state.currentSlide = 0;
        carousel.style.transform = 'translateX(0%)';
        carousel.innerHTML = slides.map(slide => `
            <div class="w-full h-full shrink-0 relative">
                <img src="${slide.image_url}" class="w-full h-full object-cover opacity-55" alt="${slide.title}">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex items-end p-8">
                    <div>
                        <span class="px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">GTech Admissions</span>
                        <h4 class="text-xl sm:text-2xl font-black text-white mt-1">${slide.title}</h4>
                    </div>
                </div>
            </div>
        `).join('');

        // Update admin previews if present
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
    if (!error) {
        state.inquiries = data || [];
    }
}

async function fetchRegisteredStudentsFromSupabase() {
    const { data, error } = await _supabase.from('student_profiles').select('*').order('created_at', { ascending: false });
    if (!error) {
        state.students = data || [];
    }
}

function setStateFilter(stateName) {
    state.stateFilter = stateName;
    document.querySelectorAll('.state-btn').forEach(btn => {
        if (btn.getAttribute('data-state') === stateName) {
            btn.className = 'state-btn px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition whitespace-nowrap shrink-0';
        } else {
            btn.className = 'state-btn px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition whitespace-nowrap shrink-0';
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
                    <div class="relative h-44 w-full overflow-hidden bg-slate-950">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                        <span class="absolute top-3 left-3 px-3 py-1 rounded-xl text-[10px] font-bold bg-slate-950/80 backdrop-blur-md text-indigo-300 border border-slate-800">${uni.state}</span>
                        <div class="absolute top-3 right-3 flex gap-1.5">
                            <span class="text-[10px] font-mono font-bold text-white bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[10px] font-bold px-2 py-1 rounded-lg border ${badgeClass}">${badgeType}</span>
                        </div>
                    </div>

                    <div class="p-5">
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

                <div class="p-5 pt-0">
                    <button type="button" onclick="selectUniForScholarship('${safeUniName}')" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition">
                        <i class="fa-solid fa-graduation-cap"></i> Get Scholarship / Expert Call
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// --- AUTH GATE FOR APPLY & SCHOLARSHIP ---
function requireAuthForApply(e) {
    if (e) e.preventDefault();
    if (!state.currentStudent) {
        state.pendingAction = { type: 'apply', uniName: '' };
        showToast('Login Required', 'Please login or register to apply for scholarships.', 'error');
        openStudentLoginModal();
        return;
    }
    prefillScholarshipFormWithStudent();
    document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
}

function selectUniForScholarship(uniName) {
    if (!state.currentStudent) {
        state.pendingAction = { type: 'apply', uniName: uniName };
        showToast('Login Required', 'Please login or register to request a scholarship or expert call.', 'error');
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
    if (nameEl && !nameEl.value) nameEl.value = state.currentStudent.full_name || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = state.currentStudent.mobile || '';
    if (emailEl && !emailEl.value) emailEl.value = state.currentStudent.email || '';
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

    const inquiry = {
        id: Date.now(),
        name,
        phone,
        parent_phone: parentPhone,
        email,
        address,
        jee_score: jee,
        inter,
        pcm,
        uni,
        branch,
        status: 'Pending Callback'
    };

    const { error } = await _supabase.from('inquiries').insert([inquiry]);
    if (error) {
        showToast('Submission Error', error.message, 'error');
        return;
    }

    state.inquiries.unshift(inquiry);
    showToast('Application Submitted', 'Our team will review your application and reach out via WhatsApp within 10 minutes.', 'success');
    e.target.reset();
    prefillScholarshipFormWithStudent();
}

function generateReferralCode(e) {
    e.preventDefault();
    const name = document.getElementById('ref-name').value.trim().toUpperCase().replace(/\s+/g, '');
    const phone = document.getElementById('ref-phone').value.trim();
    const code = `GTECH-5001-${name}-${phone.slice(-4)}`;

    document.getElementById('generated-code-display').textContent = code;
    document.getElementById('generated-code-box').classList.remove('hidden');

    let vouchers = JSON.parse(localStorage.getItem('gtech_vouchers') || '[]');
    vouchers.unshift({ phone, code, name, date: new Date().toLocaleDateString() });
    localStorage.setItem('gtech_vouchers', JSON.stringify(vouchers));

    showToast('Voucher Generated', 'Your referral concession code is ready below.', 'success');
}

function copyText(txt) {
    navigator.clipboard.writeText(txt);
    showToast('Copied', `Copied to clipboard: ${txt}`, 'success');
}

function shareWhatsApp() {
    const code = document.getElementById('generated-code-display').textContent;
    const text = encodeURIComponent(`Hey! Use my referral code *${code}* on GTech Admissions to get instant fee concessions and free campus visits!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
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
    const nameInput = document.getElementById('auth-name');
    const mobileInput = document.getElementById('auth-mobile');

    if (mode === 'signup') {
        tabSignup.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        tabLogin.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
        title.textContent = 'Register with GTech';
        subtitle.textContent = 'Enter your Name, Email, and Phone Number.';
        subBtn.textContent = 'Register Now';
        nameBox.classList.remove('hidden');
        mobileBox.classList.remove('hidden');
        nameInput.required = true;
        mobileInput.required = true;
    } else {
        tabLogin.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        tabSignup.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
        title.textContent = 'Student Portal Login';
        subtitle.textContent = 'Enter your registered email to open your dashboard.';
        subBtn.textContent = 'Login with Email';
        nameBox.classList.add('hidden');
        mobileBox.classList.add('hidden');
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

        const studentRecord = {
            id: 'stu_' + Date.now(),
            full_name: name,
            mobile: mobile,
            email: email,
            address: 'Ongole'
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
            if (action.uniName) {
                document.getElementById('app-uni').value = action.uniName;
            }
            document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
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
    document.getElementById('student-dash-title').textContent = `Hello, ${state.currentStudent.full_name}! Welcome Back.`;
    document.getElementById('student-dash-email').textContent = `Email: ${state.currentStudent.email} | Phone: ${state.currentStudent.mobile}`;

    document.getElementById('student-dashboard-modal').classList.remove('hidden');
    document.getElementById('student-dashboard-modal').classList.add('flex');
    loadStudentDashboardData();
}

function loadStudentDashboardData() {
    const appContainer = document.getElementById('student-applications-list');
    const voucherContainer = document.getElementById('student-vouchers-list');
    const stu = state.currentStudent;

    const myApps = state.inquiries.filter(inq =>
        (inq.email && stu.email && inq.email.toLowerCase() === stu.email.toLowerCase()) ||
        (inq.phone && stu.mobile && inq.phone.includes(stu.mobile))
    );

    if (myApps.length === 0) {
        appContainer.innerHTML = `<p class="text-xs text-slate-500">No applications found for ${stu.email}. Submit your scholarship application from the form below.</p>`;
    } else {
        appContainer.innerHTML = myApps.map(inq => `
            <div class="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                <div>
                    <strong class="text-white">${inq.uni} (${inq.branch})</strong>
                    <p class="text-slate-400 text-[10px]">Student: ${inq.name} | PCM: ${inq.pcm}/600</p>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">${inq.status}</span>
            </div>
        `).join('');
    }

    const vouchers = JSON.parse(localStorage.getItem('gtech_vouchers') || '[]');
    if (vouchers.length === 0) {
        voucherContainer.innerHTML = `<p class="text-xs text-slate-500">No referral discount vouchers active yet.</p>`;
    } else {
        voucherContainer.innerHTML = vouchers.map(v => `
            <div class="p-3 bg-slate-900 rounded-xl border border-amber-500/30 text-xs flex justify-between items-center">
                <div>
                    <span class="font-mono font-bold text-amber-400 text-sm tracking-wider">${v.code}</span>
                    <p class="text-slate-400 text-[10px]">Generated for ${v.name} | Worth ₹1,500 Discount</p>
                </div>
                <button onclick="copyText('${v.code}')" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-[10px]">Copy</button>
            </div>
        `).join('');
    }
}

// --- ADMIN PANEL ---
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
        loadAdminDashboardData();
        showToast('Admin Authenticated', 'Welcome to the GTech Admin Control Panel.', 'success');
    } else {
        showToast('Access Denied', 'Invalid User ID or Password.', 'error');
    }
}

async function switchAdminTab(tabName) {
    const tabs = ['inquiries', 'students', 'universities', 'carousel'];
    tabs.forEach(t => {
        const panel = document.getElementById(`admin-tab-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (panel) panel.classList.add('hidden');
        if (btn) btn.className = 'py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap font-bold';
    });

    const activePanel = document.getElementById(`admin-tab-${tabName}`);
    const activeBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeBtn) activeBtn.className = 'py-2.5 border-b-2 border-indigo-500 text-indigo-400 whitespace-nowrap font-bold';

    if (tabName === 'inquiries') {
        await fetchInquiriesFromSupabase();
        loadAdminDashboardData();
    } else if (tabName === 'students') {
        await fetchRegisteredStudentsFromSupabase();
        loadAdminStudentsTable();
    } else if (tabName === 'universities') {
        loadAdminUnisTable();
    }
}

function loadAdminDashboardData() {
    const tbody = document.getElementById('admin-inquiries-tbody');
    if (state.inquiries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No student scholarship inquiries yet.</td></tr>`;
        return;
    }

    const statusOptions = [
        'Pending Callback',
        'Completed',
        'Visiting',
        'Application Completed',
        'Admission Completed'
    ];

    tbody.innerHTML = state.inquiries.map(inq => {
        const currentStatus = inq.status || 'Pending Callback';
        const optionsHtml = statusOptions.map(opt =>
            `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

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
                    JEE: <strong>${inq.jee_score || 'N/A'}</strong> | Inter: <strong>${inq.inter}</strong><br>
                    PCM: <strong class="text-emerald-400">${inq.pcm}/600</strong>
                </td>
                <td class="p-3">
                    <strong class="text-white">${inq.uni}</strong>
                    <span class="text-indigo-400 font-bold block">${inq.branch}</span>
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
    const countBadge = document.getElementById('total-students-count');
    if (countBadge) countBadge.textContent = `${state.students.length} Registered Students`;

    if (state.students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No students have registered yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.students.map(stu => {
        const regDate = stu.created_at ? new Date(stu.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent';
        return `
            <tr class="hover:bg-slate-900/60">
                <td class="p-3 font-bold text-white">${stu.full_name}</td>
                <td class="p-3 text-indigo-300 font-mono">${stu.email}</td>
                <td class="p-3 text-emerald-300 font-mono"><a href="tel:${stu.mobile}" class="hover:underline">${stu.mobile}</a></td>
                <td class="p-3 text-slate-400">${stu.address || 'Ongole'}</td>
                <td class="p-3 text-slate-400">${regDate}</td>
            </tr>
        `;
    }).join('');
}

function loadAdminUnisTable() {
    const tbody = document.getElementById('admin-unis-tbody');
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
window.openAddUniModal = openAddUniModal;
window.openEditUniModal = openEditUniModal;
window.handleSaveUni = handleSaveUni;
window.handleDeleteUni = handleDeleteUni;
window.setStateFilter = setStateFilter;
window.selectUniForScholarship = selectUniForScholarship;
window.handleScholarshipInquiry = handleScholarshipInquiry;
window.generateReferralCode = generateReferralCode;
window.copyText = copyText;
window.shareWhatsApp = shareWhatsApp;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.handleUploadCarousel = handleUploadCarousel;
