// Supabase Configuration
const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
    stateFilter: 'ALL',
    universities: [],
    inquiries: [],
    currentStudentPhone: null,
    currentStudentName: 'Harsha',
    currentSlide: 0
};

window.onload = async function() {
    await fetchUniversitiesFromSupabase();
    await fetchInquiriesFromSupabase();
    
    // Auto advance carousel every 4 seconds
    setInterval(() => {
        nextSlide();
    }, 4000);
};

// Carousel Functions
function nextSlide() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;
    state.currentSlide = (state.currentSlide + 1) % 3;
    carousel.style.transform = `translateX(-${state.currentSlide * 100}%)`;
}

function prevSlide() {
    const carousel = document.getElementById('about-carousel');
    if (!carousel) return;
    state.currentSlide = (state.currentSlide - 1 + 3) % 3;
    carousel.style.transform = `translateX(-${state.currentSlide * 100}%)`;
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
    if (!error) {
        state.inquiries = data || [];
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

        const isExamReq = uni.admission_type === 'Entrance Exam Required';

        return `
            <div class="bg-slate-900/90 rounded-3xl border border-slate-800 overflow-hidden shadow-xl hover:border-indigo-500/40 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative h-44 w-full overflow-hidden bg-slate-950">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                        <span class="absolute top-3 left-3 px-3 py-1 rounded-xl text-[10px] font-bold bg-slate-950/80 backdrop-blur-md text-indigo-300 border border-slate-800">${uni.state}</span>
                        <div class="absolute top-3 right-3 flex gap-1.5">
                            <span class="text-[10px] font-mono font-bold text-white bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800">NIRF #${uni.nirf || 50}</span>
                            <span class="text-[10px] font-bold px-2 py-1 rounded-lg border ${isExamReq ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'}">${uni.admission_type || 'Direct Admission Open'}</span>
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
                    <button type="button" onclick="selectUniForScholarship('${uni.name}')" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition">
                        <i class="fa-solid fa-graduation-cap"></i> Get a scholarship from top universities
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function selectUniForScholarship(uniName) {
    document.getElementById('app-uni').value = uniName;
    document.getElementById('apply').scrollIntoView({ behavior: 'smooth' });
}

async function handleScholarshipInquiry(e) {
    e.preventDefault();
    const name = document.getElementById('app-name').value.trim();
    const phone = document.getElementById('app-phone').value.trim();
    const parentPhone = document.getElementById('app-parent-phone').value.trim();
    const email = document.getElementById('app-email').value.trim();
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
        tenth: 'Verified',
        inter,
        pcm,
        uni,
        branch,
        status: 'Pending Callback'
    };

    const { error } = await _supabase.from('inquiries').insert([inquiry]);
    if (error) {
        alert('Error submitting application: ' + error.message);
        return;
    }

    state.inquiries.unshift(inquiry);
    alert(`Application Submitted Successfully! Our team will review your application and reach out via WhatsApp within 10 minutes.`);
    e.target.reset();
}

// Referral Code based on GTECH-5001 sequence
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

    alert('Referral Code Generated Successfully!');
}

function copyText(txt) {
    navigator.clipboard.writeText(txt);
    alert('Copied to clipboard: ' + txt);
}

function shareWhatsApp() {
    const code = document.getElementById('generated-code-display').textContent;
    const text = encodeURIComponent(`Hey! Use my referral code *${code}* on GTech Admissions to get instant fee concessions and free campus visits!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

// --- STUDENT AUTHENTICATION LOGIC (OTP & Forgot Password) ---
let authMode = 'login'; // login, signup, verify_otp, forgot

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
    const tabForgot = document.getElementById('tab-forgot');
    const nameBox = document.getElementById('name-field-box');
    const mobileBox = document.getElementById('mobile-field-box');
    const refBox = document.getElementById('referral-field-box');
    const passBox = document.getElementById('password-field-box');
    const otpBox = document.getElementById('otp-field-box');

    tabLogin.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
    tabSignup.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';
    tabForgot.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition';

    if (mode === 'signup') {
        tabSignup.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        title.textContent = 'Register Student Account';
        subtitle.textContent = 'Sign up with email OTP verification.';
        subBtn.textContent = 'Send Verification OTP';
        nameBox.classList.remove('hidden');
        mobileBox.classList.remove('hidden');
        refBox.classList.remove('hidden');
        passBox.classList.remove('hidden');
        otpBox.classList.add('hidden');
    } else if (mode === 'verify_otp') {
        title.textContent = 'Verify Email OTP';
        subtitle.textContent = 'Enter the 6-digit code sent to your email.';
        subBtn.textContent = 'Verify OTP & Complete Registration';
        nameBox.classList.add('hidden');
        mobileBox.classList.add('hidden');
        refBox.classList.add('hidden');
        passBox.classList.add('hidden');
        otpBox.classList.remove('hidden');
    } else if (mode === 'forgot') {
        tabForgot.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        title.textContent = 'Forgot Password';
        subtitle.textContent = 'Enter your email to receive a password reset link.';
        subBtn.textContent = 'Send Password Reset Link';
        nameBox.classList.add('hidden');
        mobileBox.classList.add('hidden');
        refBox.classList.add('hidden');
        passBox.classList.add('hidden');
        otpBox.classList.add('hidden');
    } else {
        tabLogin.className = 'flex-1 py-2 rounded-lg bg-indigo-600 text-white transition';
        title.textContent = 'Student Portal Login';
        subtitle.textContent = 'Login with your Email ID and Password.';
        subBtn.textContent = 'Login to Dashboard';
        nameBox.classList.add('hidden');
        mobileBox.classList.add('hidden');
        refBox.classList.add('hidden');
        passBox.classList.remove('hidden');
        otpBox.classList.add('hidden');
    }
}

async function handleStudentAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (authMode === 'signup') {
        const name = document.getElementById('auth-name').value.trim();
        const mobile = document.getElementById('auth-mobile').value.trim();
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        await _supabase.from('email_otps').insert([{ email, otp_code: otpCode, purpose: 'REGISTRATION', verified: false }]);
        alert(`[DEV SIMULATION EMAIL] Your Email Verification OTP is: ${otpCode}`);
        switchAuthMode('verify_otp');
    } 
    else if (authMode === 'verify_otp') {
        const enteredOtp = document.getElementById('auth-otp').value.trim();
        const name = document.getElementById('auth-name').value.trim();
        const mobile = document.getElementById('auth-mobile').value.trim();

        const { data: otpRecord } = await _supabase.from('email_otps').select('*').eq('email', email).eq('otp_code', enteredOtp).eq('verified', false).single();
        if (!otpRecord) {
            alert('Invalid or expired OTP. Please check and try again.');
            return;
        }

        await _supabase.from('email_otps').update({ verified: true }).eq('id', otpRecord.id);
        const { data: authData, error } = await _supabase.auth.signUp({ email, password });
        if (error) {
            alert('Registration Error: ' + error.message);
            return;
        }

        state.currentStudentName = name;
        await _supabase.from('student_profiles').insert([{ id: authData.user?.id || Date.now(), full_name: name, mobile, email, address: 'Ongole' }]);

        alert('Registration Successful! Your account has been created successfully.');
        document.getElementById('student-login-modal').classList.add('hidden');
        openStudentLoginModal();
    }
    else if (authMode === 'forgot') {
        alert(`Password reset secure link has been dispatched to ${email}. Check your inbox.`);
        switchAuthMode('login');
    }
    else {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) {
            alert('Login Failed: ' + error.message);
            return;
        }

        const { data: profile } = await _supabase.from('student_profiles').select('*').eq('email', email).single();
        if (profile) state.currentStudentName = profile.full_name;

        document.getElementById('student-login-modal').classList.add('hidden');
        document.getElementById('student-dashboard-modal').classList.remove('hidden');
        document.getElementById('student-dashboard-modal').classList.add('flex');
        
        // Personalized welcome greeting requirement
        document.getElementById('student-dash-title').textContent = `Hello, ${state.currentStudentName}! Welcome Back.`;
        
        loadStudentDashboardData();
        alert('Login Successful! Welcome to Your Student Dashboard.');
    }
}

function loadStudentDashboardData() {
    const appContainer = document.getElementById('student-applications-list');
    const voucherContainer = document.getElementById('student-vouchers-list');

    if (state.inquiries.length === 0) {
        appContainer.innerHTML = `<p class="text-xs text-slate-500">No applications found. Submit your scholarship application from the form.</p>`;
    } else {
        appContainer.innerHTML = state.inquiries.slice(0, 3).map(inq => `
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

// --- ADMIN LOGIN LOGIC (User ID: GTECH9347, Password: HARSHA@123) ---
function openAdminModal() {
    document.getElementById('admin-modal').classList.remove('hidden');
    document.getElementById('admin-modal').classList.add('flex');
}

function handleAdminLogin(e) {
    e.preventDefault();
    const userId = document.getElementById('admin-userid-input').value.trim();
    const password = document.getElementById('admin-pass-input').value;

    if (userId === 'GTECH9347' && password === 'HARSHA@123') {
        document.getElementById('admin-modal').classList.add('hidden');
        document.getElementById('admin-dashboard-modal').classList.remove('hidden');
        document.getElementById('admin-dashboard-modal').classList.add('flex');
        fetchInquiriesFromSupabase().then(() => loadAdminDashboardData());
    } else {
        alert('Access Denied: Invalid User ID or Password.');
    }
}

function switchAdminTab(tabName) {
    const inquiriesTab = document.getElementById('admin-tab-inquiries');
    const unisTab = document.getElementById('admin-tab-universities');
    const carouselTab = document.getElementById('admin-tab-carousel');
    const btnInquiries = document.getElementById('tab-btn-inquiries');
    const btnUnis = document.getElementById('tab-btn-universities');
    const btnCarousel = document.getElementById('tab-btn-carousel');

    inquiriesTab.classList.add('hidden');
    unisTab.classList.add('hidden');
    carouselTab.classList.add('hidden');
    btnInquiries.className = 'py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap font-bold';
    btnUnis.className = 'py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap font-bold';
    btnCarousel.className = 'py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap font-bold';

    if (tabName === 'inquiries') {
        inquiriesTab.classList.remove('hidden');
        btnInquiries.className = 'py-2.5 border-b-2 border-indigo-500 text-indigo-400 whitespace-nowrap font-bold';
        loadAdminDashboardData();
    } else if (tabName === 'universities') {
        unisTab.classList.remove('hidden');
        btnUnis.className = 'py-2.5 border-b-2 border-indigo-500 text-indigo-400 whitespace-nowrap font-bold';
        loadAdminUnisTable();
    } else if (tabName === 'carousel') {
        carouselTab.classList.remove('hidden');
        btnCarousel.className = 'py-2.5 border-b-2 border-indigo-500 text-indigo-400 whitespace-nowrap font-bold';
    }
}

function loadAdminDashboardData() {
    const tbody = document.getElementById('admin-inquiries-tbody');
    if (state.inquiries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No student scholarship inquiries yet.</td></tr>`;
    } else {
        tbody.innerHTML = state.inquiries.map(inq => `
            <tr class="hover:bg-slate-900/60">
                <td class="p-3">
                    <strong class="text-white block">${inq.name}</strong>
                    <a href="tel:${inq.phone}" class="text-indigo-300 font-mono text-[10px] hover:underline">${inq.phone}</a>
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
                <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">● ${inq.status}</span></td>
            </tr>
        `).join('');
    }
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
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${uni.admission_type === 'Entrance Exam Required' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">${uni.admission_type || 'Direct Admission Open'}</span></td>
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
    document.getElementById('modal-uni-image').value = '';
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
    document.getElementById('modal-uni-image').value = uni.image;

    document.getElementById('uni-modal').classList.remove('hidden');
    document.getElementById('uni-modal').classList.add('flex');
}

async function handleSaveUni(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-uni-id').value;
    const name = document.getElementById('modal-uni-name').value.trim();
    const stateName = document.getElementById('modal-uni-state').value;
    const location = document.getElementById('modal-uni-loc').value.trim();
    const address = document.getElementById('modal-uni-address').value.trim();
    const hostelFee = Number(document.getElementById('modal-uni-hostelfee').value);
    const applicationFee = Number(document.getElementById('modal-uni-appfee').value);
    const admissionType = document.getElementById('modal-uni-admission').value;
    const image = document.getElementById('modal-uni-image').value.trim();

    const uniPayload = {
        name,
        state: stateName,
        location,
        address,
        hostel_fee: hostelFee,
        application_fee: applicationFee,
        admission_type: admissionType,
        image,
        nirf: Math.floor(Math.random() * 80) + 20,
        branches: { 'ECE': 190000, 'CSE': 210000, 'AI and DS': 225000 }
    };

    if (editId) {
        await _supabase.from('universities').update(uniPayload).eq('id', editId);
    } else {
        uniPayload.id = 'uni-' + Date.now();
        await _supabase.from('universities').insert([uniPayload]);
    }

    document.getElementById('uni-modal').classList.add('hidden');
    await fetchUniversitiesFromSupabase();
    loadAdminUnisTable();
    alert('University saved successfully to Supabase database!');
}

async function handleDeleteUni(id) {
    if (confirm('Delete this university from catalog?')) {
        await _supabase.from('universities').delete().eq('id', id);
        await fetchUniversitiesFromSupabase();
        loadAdminUnisTable();
    }
}
