/* ==========================================================================
   GTech Admissions — Student Portal Application Logic
   Preserves Supabase OTP Auth, existing tables/workflows, university matrix,
   guidance inquiries, referral validation, and student dashboard.
   ========================================================================== */

const SUPABASE_URL = "https://yefezksjguqjabhjlwqj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllZmVrc2pqZ3VxamFiaGpsd3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTUyNTcsImV4cCI6MjA4NzM5MTI1N30.V8V6w2w1J1i8Q3kR2mN4pL6sT8vW0xY2zA4bC6dE8fG";

const supabaseClient =
  window.supabase && typeof window.supabase.createClient === "function"
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const SESSION_STORAGE_KEY = "gtech_student_session_v2";
const PENDING_REF_STORAGE_KEY = "gtech_pending_referral_code";

let activeStudentSession = null;
let pendingRegistrationData = null;
let pendingLoginEmail = "";
let validatedReferralRecord = null;
let regOtpTimerId = null;
let loginOtpTimerId = null;
let currentStateFilter = "ALL";
let currentSlideIndex = 0;

const UNIVERSITIES_DATA = [
  {
    name: "VIT (Vellore / Chennai)",
    city: "Vellore & Chennai",
    state: "Chennai",
    category: "Entrance Exams",
    mode: "VITEEE / Admission",
    tuitionNote: "Branch-dependent annual tuition; verify exact slab during counseling",
    branches: ["CSE", "CSE (AI & ML)", "ECE", "Mechanical"]
  },
  {
    name: "SRM Institute of Science & Technology",
    city: "Chennai",
    state: "Chennai",
    category: "Entrance Exams",
    mode: "SRMJEEE / Admission",
    tuitionNote: "Tiered fee structure by campus and branch specialization",
    branches: ["CSE", "AI & Data Science", "ECE", "Biotech"]
  },
  {
    name: "Manipal Academy of Higher Education",
    city: "Manipal",
    state: "Karnataka",
    category: "Entrance Exams",
    mode: "MET / Admission",
    tuitionNote: "Category-wise tuition and hostel options per academic year",
    branches: ["CSE", "IT", "ECE", "Mechatronics"]
  },
  {
    name: "KL University (KLEF)",
    city: "Guntur / Vijayawada",
    state: "Andhra Pradesh",
    category: "Entrance Exams",
    mode: "KLEEE / Merit",
    tuitionNote: "Merit scholarship slabs available based on qualifying score",
    branches: ["CSE", "AI & ML", "ECE", "CSE (Cyber Security)"]
  },
  {
    name: "Audisankara University",
    city: "Gudur / Nellore",
    state: "Andhra Pradesh",
    category: "Application Only",
    mode: "Direct / Counseling",
    tuitionNote: "Transparent program fees with guidance support",
    branches: ["CSE", "ECE", "EEE", "Mechanical"]
  },
  {
    name: "Galgotias University",
    city: "Greater Noida",
    state: "UP",
    category: "Application Only",
    mode: "Merit / Application",
    tuitionNote: "Course-wise fee schedule with scholarship eligibility check",
    branches: ["B.Tech CSE", "BCA", "BBA", "B.Pharm"]
  },
  {
    name: "Marwadi University",
    city: "Rajkot",
    state: "Maharashtra",
    category: "Application Only",
    mode: "Application / Merit",
    tuitionNote: "Branch-specific tuition details shared upon inquiry",
    branches: ["CSE", "ICT", "Mechanical", "MBA"]
  },
  {
    name: "Woxsen / Hyderabad Partner Campuses",
    city: "Hyderabad",
    state: "Telangana",
    category: "Entrance Exams",
    mode: "Entrance / Interview",
    tuitionNote: "Program-specific tuition and scholarship evaluation",
    branches: ["CSE (AI & ML)", "Data Science", "B.Des", "BBA"]
  }
];

/* ==========================================================================
   Toast & Input Helpers
   ========================================================================== */

function showToast(title, message, isError = false) {
  const toast = document.getElementById("gtech-toast");
  const icon = document.getElementById("gtech-toast-icon");
  const titleEl = document.getElementById("gtech-toast-title");
  const msgEl = document.getElementById("gtech-toast-msg");

  if (!toast || !titleEl || !msgEl) return;

  titleEl.textContent = title;
  msgEl.textContent = message;
  if (icon) {
    icon.textContent = isError ? "!" : "✓";
  }

  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    hideToast();
  }, 4500);
}

function hideToast() {
  const toast = document.getElementById("gtech-toast");
  if (toast) toast.classList.add("hidden");
}

function sanitizeNumericInput(inputEl, maxLen = 15) {
  if (!inputEl) return;
  inputEl.value = inputEl.value.replace(/\D+/g, "").slice(0, maxLen);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeReferralCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function generateStudentId() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `GTA26-${randomPart}`;
}

function generateUniqueReferralCode(studentName) {
  const cleanPrefix = String(studentName || "GTECH")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `GT${cleanPrefix}${suffix}`;
}

/* ==========================================================================
   Header, Profile Dropdown & Session State
   ========================================================================== */

function syncHeaderAndSessionUI() {
  const guestBox = document.getElementById("guest-header-actions");
  const profileMenu = document.getElementById("student-profile-menu");
  const headerName = document.getElementById("header-student-name");
  const dropdownName = document.getElementById("dropdown-student-name");
  const dropdownId = document.getElementById("dropdown-student-id");

  if (activeStudentSession && activeStudentSession.email) {
    if (guestBox) guestBox.classList.add("hidden");
    if (profileMenu) profileMenu.classList.remove("hidden");

    const displayName = activeStudentSession.full_name || "Student";
    const displayId = activeStudentSession.student_id || "—";

    if (headerName) headerName.textContent = displayName;
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownId) dropdownId.textContent = `ID: ${displayId}`;
  } else {
    if (guestBox) guestBox.classList.remove("hidden");
    if (profileMenu) profileMenu.classList.add("hidden");
    const panel = document.getElementById("profile-dropdown-panel");
    if (panel) panel.classList.add("hidden");
  }
}

function toggleProfileDropdown(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById("profile-dropdown-panel");
  const trigger = document.getElementById("profile-menu-trigger");
  if (!panel) return;

  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !isHidden);
  if (trigger) {
    trigger.setAttribute("aria-expanded", String(isHidden));
  }
}

document.addEventListener("click", (event) => {
  const menu = document.getElementById("student-profile-menu");
  const panel = document.getElementById("profile-dropdown-panel");
  if (menu && panel && !menu.contains(event.target)) {
    panel.classList.add("hidden");
    const trigger = document.getElementById("profile-menu-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }
});

async function handleStudentLogout() {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  } catch (err) {
    console.warn("Sign out warning:", err);
  }

  activeStudentSession = null;
  pendingRegistrationData = null;
  pendingLoginEmail = "";
  localStorage.removeItem(SESSION_STORAGE_KEY);

  closeStudentDashboardModal();
  closeAuthModal();
  syncHeaderAndSessionUI();
  showToast("Logged Out", "You have been logged out of the GTech student portal.");
}

async function restoreStudentSession() {
  try {
    const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      if (parsed && parsed.email) {
        activeStudentSession = parsed;
      }
    }

    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      const authUser = data && data.session ? data.session.user : null;
      if (authUser && authUser.email) {
        const profile = await fetchOrCreateStudentProfile(authUser.email, authUser.user_metadata || {});
        activeStudentSession = profile;
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
      }
    }
  } catch (err) {
    console.warn("Session restore note:", err);
  }

  syncHeaderAndSessionUI();
}

/* ==========================================================================
   Referral Link Auto-Fill & Validation
   ========================================================================== */

function clearReferralValidationState() {
  validatedReferralRecord = null;
  const statusEl = document.getElementById("reg-referral-status");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "field-hint hidden";
  }
}

function captureReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawCode = params.get("ref") || params.get("referral") || params.get("code") || "";
  const normalized = normalizeReferralCode(rawCode);

  if (normalized) {
    localStorage.setItem(PENDING_REF_STORAGE_KEY, normalized);
    applyReferralCodeToRegistration(normalized);
  } else {
    const stored = normalizeReferralCode(localStorage.getItem(PENDING_REF_STORAGE_KEY) || "");
    if (stored) {
      applyReferralCodeToRegistration(stored);
    }
  }
}

function applyReferralCodeToRegistration(code) {
  const cleanCode = normalizeReferralCode(code);
  if (!cleanCode) return;

  const refInput = document.getElementById("reg-referral");
  const banner = document.getElementById("referral-applied-banner");
  const bannerCode = document.getElementById("banner-ref-code");

  if (refInput) {
    refInput.value = cleanCode;
  }
  if (banner && bannerCode) {
    bannerCode.textContent = cleanCode;
    banner.classList.remove("hidden");
  }
}

async function validateMandatoryReferralCode(rawCode, applicantEmail) {
  const code = normalizeReferralCode(rawCode);
  const cleanEmail = normalizeEmail(applicantEmail);
  const statusEl = document.getElementById("reg-referral-status");

  if (!code) {
    throw new Error("Referral code is mandatory for registration.");
  }

  if (!supabaseClient) {
    throw new Error("Unable to verify referral code right now. Please try again.");
  }

  // Look up genuine referral owner in student_profiles by referral_code
  const { data: referrer, error } = await supabaseClient
    .from("student_profiles")
    .select("student_id, full_name, email, referral_code")
    .ilike("referral_code", code)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Could not validate referral code against database records.");
  }

  if (!referrer || !referrer.referral_code) {
    validatedReferralRecord = null;
    if (statusEl) {
      statusEl.textContent = "Invalid referral code. Please enter a verified student referral code.";
      statusEl.className = "field-hint field-hint-invalid";
    }
    throw new Error("Invalid referral code. Registration requires a valid referral code.");
  }

  // Prevent self-referral
  if (cleanEmail && normalizeEmail(referrer.email) === cleanEmail) {
    validatedReferralRecord = null;
    if (statusEl) {
      statusEl.textContent = "Self-referral is not allowed. Please use another student's referral code.";
      statusEl.className = "field-hint field-hint-invalid";
    }
    throw new Error("You cannot use your own referral code.");
  }

  validatedReferralRecord = referrer;
  if (statusEl) {
    statusEl.textContent = `Valid referral code (${referrer.referral_code}).`;
    statusEl.className = "field-hint field-hint-valid";
  }

  return referrer;
}

/* ==========================================================================
   Auth Modal, Registration OTP & Login OTP
   ========================================================================== */

function openAuthModal(defaultMode = "register") {
  const modal = document.getElementById("student-auth-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  switchStudentAuthMode(defaultMode);
  const storedRef = normalizeReferralCode(localStorage.getItem(PENDING_REF_STORAGE_KEY) || "");
  if (storedRef) {
    applyReferralCodeToRegistration(storedRef);
  }
}

function closeAuthModal() {
  const modal = document.getElementById("student-auth-modal");
  if (modal) modal.classList.add("hidden");
}

function switchStudentAuthMode(mode) {
  const isRegister = mode === "register";
  const regTab = document.getElementById("mode-tab-register");
  const loginTab = document.getElementById("mode-tab-login");
  const regView = document.getElementById("register-view");
  const loginView = document.getElementById("login-view");

  if (regTab) regTab.classList.toggle("is-active", isRegister);
  if (loginTab) loginTab.classList.toggle("is-active", !isRegister);
  if (regView) regView.classList.toggle("hidden", !isRegister);
  if (loginView) loginView.classList.toggle("hidden", isRegister);
}

function setFormError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

function startOtpCountdown(group) {
  const isReg = group === "reg";
  const labelId = isReg ? "reg-otp-timer-label" : "login-otp-timer-label";
  const btnId = isReg ? "btn-resend-reg-otp" : "btn-resend-login-otp";

  if (isReg && regOtpTimerId) clearInterval(regOtpTimerId);
  if (!isReg && loginOtpTimerId) clearInterval(loginOtpTimerId);

  let remaining = 60;
  const labelEl = document.getElementById(labelId);
  const btnEl = document.getElementById(btnId);

  if (btnEl) btnEl.disabled = true;
  if (labelEl) labelEl.textContent = `Resend in ${remaining}s`;

  const intervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      if (labelEl) labelEl.textContent = "You can resend OTP now";
      if (btnEl) btnEl.disabled = false;
    } else if (labelEl) {
      labelEl.textContent = `Resend in ${remaining}s`;
    }
  }, 1000);

  if (isReg) regOtpTimerId = intervalId;
  else loginOtpTimerId = intervalId;
}

function handleOtpBoxInput(inputEl, group, index) {
  inputEl.value = inputEl.value.replace(/\D+/g, "").slice(0, 1);
  const boxes = document.querySelectorAll(`.${group}-otp-box`);
  if (inputEl.value && index < boxes.length - 1) {
    boxes[index + 1].focus();
  }
}

function handleOtpBoxKeydown(event, group, index) {
  const boxes = document.querySelectorAll(`.${group}-otp-box`);
  if (event.key === "Backspace" && !event.currentTarget.value && index > 0) {
    boxes[index - 1].focus();
  }
}

function collectOtpCode(group) {
  const boxes = document.querySelectorAll(`.${group}-otp-box`);
  return Array.from(boxes)
    .map((box) => box.value.trim())
    .join("");
}

function clearOtpBoxes(group) {
  const boxes = document.querySelectorAll(`.${group}-otp-box`);
  boxes.forEach((box) => {
    box.value = "";
  });
}

async function handleSendRegistrationOtp(event) {
  if (event) event.preventDefault();
  setFormError("reg-error-msg", "");

  const name = String(document.getElementById("reg-name")?.value || "").trim();
  const phone = String(document.getElementById("reg-phone")?.value || "").trim();
  const email = normalizeEmail(document.getElementById("reg-email")?.value || "");
  const referralCode = normalizeReferralCode(document.getElementById("reg-referral")?.value || "");

  if (!name || !phone || !email || !referralCode) {
    setFormError("reg-error-msg", "Please fill in Name, Phone Number, Email Address, and a valid Referral Code.");
    return;
  }

  if (phone.length < 10) {
    setFormError("reg-error-msg", "Please enter a valid phone number.");
    return;
  }

  const sendBtn = document.getElementById("btn-send-reg-otp");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const referrer = await validateMandatoryReferralCode(referralCode, email);

    if (!supabaseClient) {
      throw new Error("Authentication service is unavailable.");
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          full_name: name,
          phone,
          referred_by_code: referrer.referral_code
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Could not send verification OTP.");
    }

    pendingRegistrationData = {
      full_name: name,
      phone,
      email,
      referred_by_code: referrer.referral_code,
      referred_by_student_id: referrer.student_id || null
    };

    clearOtpBoxes("reg");
    const otpPanel = document.getElementById("reg-otp-panel");
    if (otpPanel) otpPanel.classList.remove("hidden");
    startOtpCountdown("reg");

    const firstBox = document.querySelector(".reg-otp-box");
    if (firstBox) firstBox.focus();

    showToast("OTP Sent", `A 6-digit verification code has been sent to ${email}.`);
  } catch (err) {
    setFormError("reg-error-msg", err.message || "Registration OTP failed.");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function handleVerifyRegistrationOtp() {
  setFormError("reg-error-msg", "");
  const token = collectOtpCode("reg");

  if (token.length !== 6) {
    setFormError("reg-error-msg", "Please enter all 6 digits of the email OTP.");
    return;
  }

  if (!pendingRegistrationData || !pendingRegistrationData.email) {
    setFormError("reg-error-msg", "Please request a registration OTP first.");
    return;
  }

  const verifyBtn = document.getElementById("btn-verify-reg-otp");
  if (verifyBtn) verifyBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: pendingRegistrationData.email,
      token,
      type: "email"
    });

    if (error) {
      throw new Error(error.message || "Token has expired or is invalid.");
    }

    // Re-validate referral right before saving to prevent tampering
    const referrer = await validateMandatoryReferralCode(
      pendingRegistrationData.referred_by_code,
      pendingRegistrationData.email
    );

    const newStudentId = generateStudentId();
    const ownReferralCode = generateUniqueReferralCode(pendingRegistrationData.full_name);

    const profilePayload = {
      student_id: newStudentId,
      full_name: pendingRegistrationData.full_name,
      email: pendingRegistrationData.email,
      phone: pendingRegistrationData.phone,
      referral_code: ownReferralCode,
      referred_by_code: referrer.referral_code,
      admission_status: "Registered & Verified",
      auth_user_id: data && data.user ? data.user.id : null
    };

    await saveStudentProfileAndReferral(profilePayload, referrer);

    activeStudentSession = profilePayload;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profilePayload));
    localStorage.removeItem(PENDING_REF_STORAGE_KEY);
    pendingRegistrationData = null;

    syncHeaderAndSessionUI();

    document.getElementById("student-register-form")?.classList.add("hidden");
    document.getElementById("reg-otp-panel")?.classList.add("hidden");

    const idDisp = document.getElementById("generated-student-id-display");
    const refDisp = document.getElementById("generated-referral-code-display");
    if (idDisp) idDisp.textContent = profilePayload.student_id;
    if (refDisp) refDisp.textContent = profilePayload.referral_code;

    document.getElementById("reg-success-panel")?.classList.remove("hidden");
    showToast("Registration Complete", "WELCOME TO GTECH FAMILY!");
  } catch (err) {
    setFormError("reg-error-msg", err.message || "OTP verification failed.");
  } finally {
    if (verifyBtn) verifyBtn.disabled = false;
  }
}

async function saveStudentProfileAndReferral(profile, referrer) {
  if (!supabaseClient) return;

  const { error: profileError } = await supabaseClient
    .from("student_profiles")
    .upsert(profile, { onConflict: "email" });

  if (profileError) {
    console.warn("Profile upsert note:", profileError.message);
  }

  // Record verified referral relationship while avoiding duplicates or self-referrals
  if (
    referrer &&
    referrer.referral_code &&
    normalizeEmail(referrer.email) !== normalizeEmail(profile.email)
  ) {
    const { data: existingRef } = await supabaseClient
      .from("student_referrals")
      .select("id")
      .eq("referred_email", profile.email)
      .limit(1)
      .maybeSingle();

    if (!existingRef) {
      const { error: refError } = await supabaseClient
        .from("student_referrals")
        .insert({
          referrer_referral_code: referrer.referral_code,
          referrer_student_id: referrer.student_id || null,
          referred_student_id: profile.student_id,
          referred_name: profile.full_name,
          referred_email: profile.email,
          status: "completed"
        });

      if (refError) {
        console.warn("Referral insert note:", refError.message);
      }
    }
  }
}

async function handleSendLoginOtp(event) {
  if (event) event.preventDefault();
  setFormError("login-error-msg", "");

  const emailInput = document.getElementById("login-email");
  const email = normalizeEmail(emailInput ? emailInput.value : pendingLoginEmail);

  if (!email) {
    setFormError("login-error-msg", "Please enter your registered email address.");
    return;
  }

  const sendBtn = document.getElementById("btn-send-login-otp");
  if (sendBtn) sendBtn.disabled = true;

  try {
    if (!supabaseClient) {
      throw new Error("Authentication service is unavailable.");
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false
      }
    });

    if (error) {
      throw new Error(error.message || "Could not send login OTP.");
    }

    pendingLoginEmail = email;
    clearOtpBoxes("login");
    document.getElementById("login-otp-panel")?.classList.remove("hidden");
    startOtpCountdown("login");

    const firstBox = document.querySelector(".login-otp-box");
    if (firstBox) firstBox.focus();

    showToast("Login OTP Sent", `Check ${email} for your 6-digit login code.`);
  } catch (err) {
    setFormError("login-error-msg", err.message || "Failed to send login OTP.");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function handleVerifyLoginOtp() {
  setFormError("login-error-msg", "");
  const token = collectOtpCode("login");
  const email = normalizeEmail(pendingLoginEmail || document.getElementById("login-email")?.value || "");

  if (!email) {
    setFormError("login-error-msg", "Email missing. Please request a login OTP again.");
    return;
  }

  if (token.length !== 6) {
    setFormError("login-error-msg", "Please enter all 6 digits of the login OTP.");
    return;
  }

  const verifyBtn = document.getElementById("btn-verify-login-otp");
  if (verifyBtn) verifyBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email,
      token,
      type: "email"
    });

    if (error) {
      throw new Error(error.message || "Token has expired or is invalid.");
    }

    const meta = (data && data.user && data.user.user_metadata) || {};
    const profile = await fetchOrCreateStudentProfile(email, meta);

    activeStudentSession = profile;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
    syncHeaderAndSessionUI();
    closeAuthModal();
    openDashboardSection("overview");
    showToast("Login Successful", "WELCOME TO GTECH FAMILY!");
  } catch (err) {
    setFormError("login-error-msg", err.message || "Token has expired or is invalid.");
  } finally {
    if (verifyBtn) verifyBtn.disabled = false;
  }
}

async function fetchOrCreateStudentProfile(email, metadata = {}) {
  const cleanEmail = normalizeEmail(email);

  if (supabaseClient) {
    const { data: existing } = await supabaseClient
      .from("student_profiles")
      .select("*")
      .ilike("email", cleanEmail)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const ensuredCode = existing.referral_code || generateUniqueReferralCode(existing.full_name || cleanEmail);
      const ensuredId = existing.student_id || generateStudentId();
      if (!existing.referral_code || !existing.student_id) {
        await supabaseClient
          .from("student_profiles")
          .update({ referral_code: ensuredCode, student_id: ensuredId })
          .eq("email", existing.email);
      }
      return {
        ...existing,
        student_id: ensuredId,
        referral_code: ensuredCode
      };
    }
  }

  const fallbackName =
    metadata.full_name ||
    cleanEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    student_id: generateStudentId(),
    full_name: fallbackName,
    email: cleanEmail,
    phone: metadata.phone || "—",
    referral_code: generateUniqueReferralCode(fallbackName),
    admission_status: "Active Student",
    scholarship_info: null,
    fee_details: null
  };
}

/* ==========================================================================
   Student Dashboard & Referral System (Authenticated Only)
   ========================================================================== */

function openDashboardSection(tabName = "overview") {
  if (!activeStudentSession || !activeStudentSession.email) {
    openAuthModal("login");
    return;
  }

  const modal = document.getElementById("student-dashboard-modal");
  if (!modal) return;

  populateStudentDashboardData();
  modal.classList.remove("hidden");
  switchDashboardTab(tabName);
}

function closeStudentDashboardModal() {
  const modal = document.getElementById("student-dashboard-modal");
  if (modal) modal.classList.add("hidden");
}

function switchDashboardTab(tabName) {
  const validTabs = ["overview", "applications", "profile", "referral"];
  const target = validTabs.includes(tabName) ? tabName : "overview";

  document.querySelectorAll(".dash-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-dash-tab") === target);
  });

  validTabs.forEach((name) => {
    const panel = document.getElementById(`dash-panel-${name}`);
    if (panel) panel.classList.toggle("hidden", name !== target);
  });

  if (target === "applications") {
    loadStudentApplications();
  } else if (target === "referral") {
    loadStudentReferralStats();
  }
}

function populateStudentDashboardData() {
  if (!activeStudentSession) return;

  const studentName = activeStudentSession.full_name || "Student";
  const studentId = activeStudentSession.student_id || "—";
  const email = activeStudentSession.email || "—";
  const phone = activeStudentSession.phone || "—";
  const referralCode = activeStudentSession.referral_code || "";

  document.getElementById("dash-topbar-name").textContent = studentName;
  document.getElementById("dash-topbar-sub").textContent = `Student ID: ${studentId}`;
  document.getElementById("dash-welcome-title").textContent = "WELCOME TO GTECH FAMILY!";
  document.getElementById("dash-student-greeting").textContent = `Student: ${studentName}`;
  document.getElementById("dash-student-id").textContent = studentId;

  // Profile tab
  document.getElementById("profile-detail-name").textContent = studentName;
  document.getElementById("profile-detail-id").textContent = studentId;
  document.getElementById("profile-detail-email").textContent = email;
  document.getElementById("profile-detail-phone").textContent = phone;

  // Admission Status steps
  const statusBadge = document.getElementById("dash-admission-status-badge");
  if (statusBadge) {
    statusBadge.textContent = activeStudentSession.admission_status || "Registered";
  }

  const stepsEl = document.getElementById("admission-process-flow");
  if (stepsEl) {
    const steps = [
      "Account Verified",
      "Counseling & Choice Filling",
      "Application & Documents",
      "Admission Confirmation"
    ];
    stepsEl.innerHTML = steps
      .map(
        (label, idx) => `
          <div class="detail-box">
            <span class="detail-label">Step ${idx + 1}</span>
            <strong>${label}</strong>
          </div>
        `
      )
      .join("");
  }

  // Scholarship Details
  const scholarshipEl = document.getElementById("dash-scholarship-content");
  if (scholarshipEl) {
    scholarshipEl.textContent =
      activeStudentSession.scholarship_info ||
      "Scholarship eligibility is evaluated with your counselor based on your target university, branch, and academic records.";
  }

  // Fee Details — show genuine record only when available
  const feeEl = document.getElementById("dash-fee-content");
  if (feeEl) {
    if (activeStudentSession.fee_details) {
      feeEl.textContent = activeStudentSession.fee_details;
    } else {
      feeEl.textContent =
        "No personal fee ledger record has been assigned yet. Once your university and branch are confirmed, your verified fee details will appear here.";
    }
  }

  // Referral share controls
  const refCodeEl = document.getElementById("my-referral-code-value");
  const refLinkEl = document.getElementById("my-referral-link-input");
  const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`;

  if (refCodeEl) refCodeEl.textContent = referralCode || "—";
  if (refLinkEl) refLinkEl.value = referralCode ? shareUrl : "";
}

async function loadStudentApplications() {
  const listEl = document.getElementById("student-applications-list");
  if (!listEl || !activeStudentSession || !activeStudentSession.email) return;

  listEl.innerHTML = `<p class="card-body-copy">Loading your applications...</p>`;

  try {
    if (!supabaseClient) {
      listEl.innerHTML = `<p class="card-body-copy">No application records found yet.</p>`;
      return;
    }

    const { data, error } = await supabaseClient
      .from("inquiries")
      .select("*")
      .ilike("email", normalizeEmail(activeStudentSession.email))
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      listEl.innerHTML = `
        <div class="detail-box">
          <strong>No applications submitted yet</strong>
          <p class="card-body-copy">Use the Expert Guidance form to submit your preferred university and course.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = data
      .map(
        (item) => `
          <div class="detail-box">
            <div class="card-head-row">
              <strong>${item.course || item.interested_course || "Admission Inquiry"}</strong>
              <span class="badge-pill">${item.status || "Submitted"}</span>
            </div>
            <p class="card-body-copy">
              University: ${item.university || item.preferred_university || "To be assigned"} • Assistance: ${item.assistance_type || "Guidance"}
            </p>
          </div>
        `
      )
      .join("");
  } catch (err) {
    listEl.innerHTML = `<p class="card-body-copy">Unable to load applications right now.</p>`;
  }
}

async function loadStudentReferralStats() {
  const totalEl = document.getElementById("referral-stat-total");
  const completedEl = document.getElementById("referral-stat-completed");

  if (!totalEl || !completedEl) return;

  // Always default to genuine counts (0 when none) — never fake counts or earnings
  totalEl.textContent = "0";
  completedEl.textContent = "0";

  if (!supabaseClient || !activeStudentSession || !activeStudentSession.referral_code) {
    return;
  }

  try {
    const code = normalizeReferralCode(activeStudentSession.referral_code);
    const { data, error } = await supabaseClient
      .from("student_referrals")
      .select("id, status")
      .eq("referrer_referral_code", code);

    if (!error && Array.isArray(data)) {
      const totalCount = data.length;
      const completedCount = data.filter((row) => row.status === "completed" || row.status === "verified").length;
      totalEl.textContent = String(totalCount);
      completedEl.textContent = String(completedCount);
    }
  } catch (err) {
    console.warn("Referral stats load note:", err);
  }
}

function copyReferralCode() {
  if (!activeStudentSession || !activeStudentSession.referral_code) return;
  navigator.clipboard?.writeText(activeStudentSession.referral_code);
  showToast("Copied", `Referral code ${activeStudentSession.referral_code} copied.`);
}

function copyReferralLink() {
  const input = document.getElementById("my-referral-link-input");
  if (!input || !input.value) return;
  navigator.clipboard?.writeText(input.value);
  showToast("Link Copied", "Your referral link is ready to share.");
}

function shareReferralOnWhatsApp() {
  if (!activeStudentSession || !activeStudentSession.referral_code) return;
  const link = `${window.location.origin}/?ref=${encodeURIComponent(activeStudentSession.referral_code)}`;
  const text = `Join GTech Admissions using my referral code ${activeStudentSession.referral_code}: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

/* ==========================================================================
   Universities, Carousel & Guidance Inquiry Form
   ========================================================================== */

function setStateFilter(stateName) {
  currentStateFilter = stateName;
  document.querySelectorAll(".state-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-state") === stateName);
  });
  renderUniversities();
}

function renderUniversities() {
  const grid = document.getElementById("universities-grid");
  if (!grid) return;

  const query = String(document.getElementById("uni-search")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = UNIVERSITIES_DATA.filter((uni) => {
    const matchesRegion =
      currentStateFilter === "ALL" ||
      uni.state === currentStateFilter ||
      uni.category === currentStateFilter;

    const hay = `${uni.name} ${uni.city} ${uni.state} ${uni.mode} ${uni.branches.join(" ")}`.toLowerCase();
    const matchesQuery = !query || hay.includes(query);
    return matchesRegion && matchesQuery;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="card-body-copy">No matching universities found for your filter.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (uni) => `
        <article class="info-card">
          <div class="card-head-row">
            <span class="badge-pill">${uni.mode}</span>
            <span class="detail-label">${uni.city}</span>
          </div>
          <h3 class="feature-title">${uni.name}</h3>
          <p class="feature-desc">${uni.tuitionNote}</p>
          <div class="filter-bar">
            ${uni.branches.map((branch) => `<span class="state-btn">${branch}</span>`).join("")}
          </div>
          <button type="button" onclick="selectUniversityForGuidance('${uni.name.replace(/'/g, "\\'")}')" class="btn btn-secondary btn-compact">
            Request Guidance for This Campus
          </button>
        </article>
      `
    )
    .join("");
}

function selectUniversityForGuidance(uniName) {
  const uniInput = document.getElementById("guide-uni");
  if (uniInput) uniInput.value = uniName;
  document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
}

function focusGuidanceSection(assistanceType) {
  const selectEl = document.getElementById("guide-assistance");
  if (selectEl && assistanceType) {
    const matchingOption = Array.from(selectEl.options).find((opt) => opt.value === assistanceType);
    if (matchingOption) selectEl.value = assistanceType;
  }
  document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
}

function nextSlide() {
  const track = document.getElementById("about-carousel");
  if (!track) return;
  const totalSlides = track.children.length;
  if (!totalSlides) return;
  currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
  track.scrollTo({ left: currentSlideIndex * track.clientWidth, behavior: "smooth" });
}

function prevSlide() {
  const track = document.getElementById("about-carousel");
  if (!track) return;
  const totalSlides = track.children.length;
  if (!totalSlides) return;
  currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
  track.scrollTo({ left: currentSlideIndex * track.clientWidth, behavior: "smooth" });
}

async function handleGuidanceSubmission(event) {
  event.preventDefault();
  const submitBtn = document.getElementById("btn-submit-guidance");
  if (submitBtn) submitBtn.disabled = true;

  const payload = {
    student_name: String(document.getElementById("guide-name")?.value || "").trim(),
    phone: String(document.getElementById("guide-phone")?.value || "").trim(),
    email: normalizeEmail(document.getElementById("guide-email")?.value || ""),
    course: String(document.getElementById("guide-course")?.value || "").trim(),
    university: String(document.getElementById("guide-uni")?.value || "").trim(),
    assistance_type: String(document.getElementById("guide-assistance")?.value || "").trim(),
    status: "Submitted"
  };

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from("inquiries").insert(payload);
      if (error) {
        console.warn("Inquiry insert note:", error.message);
      }
    }

    document.getElementById("guidance-inquiry-form")?.reset();
    showToast("Request Submitted", "Our GTech guidance team will contact you shortly.");
  } catch (err) {
    showToast("Submission Error", "Please try again in a moment.", true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ==========================================================================
   Initialization
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  renderUniversities();
  captureReferralFromUrl();
  await restoreStudentSession();
});
