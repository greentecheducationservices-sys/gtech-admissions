const SUPABASE_URL = 'https://yefezksjguqjabhjlwqj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AatsIdadiJTKodPXVoDUkg_deaHj95i';
var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_EMAIL = 'admin@gtechadmissions.com';
const OTP_BACKEND_URL = window.GTECH_OTP_API || '';
const MAIL_NOTIFY_URL = window.GTECH_MAIL_API || (OTP_BACKEND_URL ? `${OTP_BACKEND_URL}/send-notification` : '');
const EARLY_OFFER_DEADLINE_ISO = '2027-03-16T23:59:59+05:30';

const SCH_OPTION_LABELS = {
    inter: {
        optionText: 'Inter Marks (%)',
        inputLabel: 'Enter Inter Marks (%)',
        placeholder: 'e.g. 95'
    },
    pcm: {
        optionText: 'PCM Marks (%)',
        inputLabel: 'Enter PCM Marks (%)',
        placeholder: 'e.g. 92'
    },
    mains: {
        optionText: 'JEE Marks / Percentile (%)',
        inputLabel: 'Enter JEE Marks / Percentile (%)',
        placeholder: 'e.g. 88.5'
    },
    eamcet: {
        optionText: 'AP EAMCET Rank',
        inputLabel: 'Enter AP EAMCET Rank',
        placeholder: 'e.g. 12500'
    }
};

const CRITERIA_DISPLAY_LABELS = {
    inter: 'Inter %',
    pcm: 'PCM %',
    mains: 'JEE %',
    eamcet: 'EAMCET Rank'
};

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
    pendingPostLoginAction: null,
    currentSlide: 0,
    incomingReferralCode: '',
    activeDashboardTab: 'dashboard',
    regCooldownTimer: null,
    loginCooldownTimer: null,
    cardScores: {},
    lastScholarshipOffer: null,
    budgetPerYear: null
};

function hideAddedMarksBudgetFilterBar() {
    const stateBar = document.getElementById('state-filter-bar');
    if (stateBar) {
        stateBar.classList.remove('hidden');
        stateBar.style.display = 'flex';
        let parent = stateBar.parentElement;
        while (parent && parent !== document.body) {
            parent.classList.remove('hidden');
            parent = parent.parentElement;
        }
        stateBar.querySelectorAll('.state-btn').forEach(btn => {
            btn.classList.remove('hidden');
            btn.style.display = 'inline-flex';
        });
    }

    const idsToHide = [
        'instant-scholarship-checker',
        'home-cards-filter-section',
        'marks-budget-filter-bar',
        'sch-filter-bar',
        'global-scholarship-filter'
    ];

    idsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function reorderFilterButtonsEntranceFirst() {
    const entranceBtn = document.querySelector('.state-btn[data-state="Entrance Exams"]');
    const allBtn = document.querySelector('.state-btn[data-state="ALL"]');
    if (entranceBtn && allBtn && entranceBtn.parentNode === allBtn.parentNode) {
        allBtn.parentNode.insertBefore(entranceBtn, allBtn);
    }
}

function isBeforeMarch16_2027(dateObj = new Date()) {
    return dateObj.getTime() <= new Date(EARLY_OFFER_DEADLINE_ISO).getTime();
}

function getUniKey(uni, fallbackIdx = 0) {
    return String(uni?.id ?? uni?.name ?? `uni_${fallbackIdx}`);
}

function formatINR(value) {
    const num = Number(value || 0);
    return `₹${num.toLocaleString('en-IN')}`;
}

function normalizeScholarshipConfig(uni) {
    let raw = uni?.scholarship_rules ?? uni?.scholarships ?? uni?.scholarship_config ?? null;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch (_) {
            raw = null;
        }
    }

    let parsedBranches = uni?.branches;
    if (typeof parsedBranches === 'string') {
        try {
            parsedBranches = JSON.parse(parsedBranches);
        } catch (_) {
            parsedBranches = null;
        }
    }

    const slabs = Array.isArray(raw?.slabs)
        ? raw.slabs
        : (Array.isArray(raw?.rules) ? raw.rules : (Array.isArray(raw) ? raw : []));

    const branchScholarships = Array.isArray(raw?.branch_scholarships)
        ? raw.branch_scholarships
        : (Array.isArray(raw?.branchRules) ? raw.branchRules : []);

    const byBranchObj = (raw?.branch_scholarships_by_branch && typeof raw.branch_scholarships_by_branch === 'object')
        ? raw.branch_scholarships_by_branch
        : {};

    if (parsedBranches && typeof parsedBranches === 'object') {
        const entries = Array.isArray(parsedBranches)
            ? parsedBranches.map(item => [item?.branch || item?.name, item])
            : Object.entries(parsedBranches);

        entries.forEach(([bKey, bVal]) => {
            if (!bKey || !bVal || typeof bVal !== 'object') return;
            const bRules = Array.isArray(bVal.slabs)
                ? bVal.slabs
                : (Array.isArray(bVal.scholarships) ? bVal.scholarships : (Array.isArray(bVal.rules) ? bVal.rules : []));
            if (bRules.length > 0) {
                const existing = Array.isArray(byBranchObj[bKey]) ? byBranchObj[bKey] : [];
                byBranchObj[bKey] = [...existing, ...bRules.map(r => ({ ...r, branch: r.branch || bKey }))];
            }
        });
    }

    if (!raw || typeof raw !== 'object') {
        const hasBranchRules = Object.keys(byBranchObj).length > 0;
        if (!hasBranchRules && !uni?.extra_concession_text && !uni?.expert_phone) return null;
        return {
            enabled: hasBranchRules,
            multi_mode: 'best_of',
            slabs: [],
            branch_scholarships: [],
            branch_scholarships_by_branch: byBranchObj,
            extra_concession_text: String(uni?.extra_concession_text || '').trim(),
            expert_phone: String(uni?.expert_phone || '').trim()
        };
    }

    const hasRules =
        raw.enabled === true ||
        slabs.length > 0 ||
        branchScholarships.length > 0 ||
        Object.keys(byBranchObj).length > 0 ||
        Boolean(raw.extra_concession_text || uni?.extra_concession_text);

    return {
        ...raw,
        enabled: hasRules,
        multi_mode: raw.multi_mode || 'best_of',
        slabs,
        branch_scholarships: branchScholarships,
        branch_scholarships_by_branch: byBranchObj,
        extra_concession_text: String(raw.extra_concession_text || uni?.extra_concession_text || '').trim(),
        expert_phone: String(raw.expert_phone || uni?.expert_phone || '').trim()
    };
}

function parseScholarshipRules(rawRulesOrUni) {
    if (!rawRulesOrUni) return null;
    if (typeof rawRulesOrUni === 'object' && ('name' in rawRulesOrUni || 'branches' in rawRulesOrUni || 'scholarship_rules' in rawRulesOrUni)) {
        return normalizeScholarshipConfig(rawRulesOrUni);
    }
    return normalizeScholarshipConfig({ scholarship_rules: rawRulesOrUni });
}

function getBranchRulesListForUni(uni, targetBranch = '') {
    const rules = normalizeScholarshipConfig(uni) || {};
    const collected = [];

    const addRule = (r, fallbackBranch = '') => {
        if (!r || typeof r !== 'object') return;
        const bName = String(r.branch || fallbackBranch || '').trim();
        if (!bName || bName.toUpperCase() === 'ALL') return;

        const minVal = Number(r.min ?? r.min_percent ?? r.minPercentage ?? r.from ?? 0);
        const maxVal = Number(r.max ?? r.max_percent ?? r.maxPercentage ?? r.to ?? 100);
        const val = Number(r.value ?? r.discount ?? r.percentage ?? r.amount ?? r.concession ?? 0);
        const type = r.type || (r.amount && !r.percentage ? 'flat' : 'percent');
        const criterion = String(r.criterion || r.criteria || 'inter').trim().toLowerCase();

        const isDup = collected.some(
            item =>
                item.branch.toLowerCase() === bName.toLowerCase() &&
                item.criterion === criterion &&
                Number(item.min) === minVal &&
                Number(item.max) === maxVal &&
                Number(item.value) === val &&
                item.type === type
        );

        if (!isDup) {
            collected.push({
                ...r,
                branch: bName,
                criterion,
                min: minVal,
                max: maxVal,
                value: val,
                type,
                note: r.note || r.label || ''
            });
        }
    };

    if (Array.isArray(rules.branch_scholarships)) {
        rules.branch_scholarships.forEach(r => addRule(r));
    }

    if (rules.branch_scholarships_by_branch && typeof rules.branch_scholarships_by_branch === 'object') {
        Object.entries(rules.branch_scholarships_by_branch).forEach(([bKey, listOrObj]) => {
            const items = Array.isArray(listOrObj) ? listOrObj : (listOrObj && typeof listOrObj === 'object' ? [listOrObj] : []);
            items.forEach(r => addRule(r, bKey));
        });
    }

    if (Array.isArray(rules.slabs)) {
        rules.slabs.forEach(s => addRule(s));
    }

    if (!targetBranch) return collected;
    const cleanTarget = String(targetBranch).trim().toLowerCase();
    return collected.filter(r => String(r.branch || '').trim().toLowerCase() === cleanTarget);
}

function formatRuleBenefit(rule) {
    const val = Number(rule?.value || 0);
    if (rule?.type === 'flat') return `${formatINR(val)}/yr Off`;
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
            ${slabsHtml}
            ${chosenBranchNoticeHtml}
            ${branchBreakdownHtml}
            ${extraFooterHtml}
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

function isCriterionAllowedForUni(uni, criterionKey) {
    const allowed = getAllowedCriteriaForUni(uni);
    return allowed.includes(String(criterionKey || '').toLowerCase());
}

function syncGlobalCriteriaHint() {
    const hintEl = document.getElementById('sch-allowed-criteria-hint');
    if (!hintEl) return;

    const visibleUnis = state.universities.filter(
        u => !isEntranceExamOnlyMode(u) && matchesStateFilter(u, state.stateFilter)
    );
    if (visibleUnis.length === 0) {
        hintEl.textContent = 'Criteria follow Admin rules per university';
        return;
    }

    const interOnlyCount = visibleUnis.filter(u => {
        const list = getAllowedCriteriaForUni(u);
        return list.length === 1 && list[0] === 'inter';
    }).length;

    if (interOnlyCount === visibleUnis.length) {
        hintEl.textContent = 'Admin Rule: Inter % only for visible universities';
    } else if (interOnlyCount > 0) {
        hintEl.textContent = `Admin Rule: ${interOnlyCount} university card(s) restricted to Inter % only`;
    } else {
        hintEl.textContent = 'Criteria follow Admin rules per university';
    }
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

function calculateFallbackMeritDiscount(optionKey, score, branchFee) {
    if (optionKey === 'eamcet') {
        if (score <= 5000) return { discount: Math.round(branchFee * 0.4), label: 'AP EAMCET Top Rank Merit (40%)' };
        if (score <= 15000) return { discount: Math.round(branchFee * 0.25), label: 'AP EAMCET Merit Slab (25%)' };
        if (score <= 35000) return { discount: Math.round(branchFee * 0.15), label: 'AP EAMCET Concession (15%)' };
        return { discount: 0, label: '' };
    }

    if (score >= 95) return { discount: Math.round(branchFee * 0.4), label: 'Merit Slab 95%+ (40% Off)' };
    if (score >= 90) return { discount: Math.round(branchFee * 0.3), label: 'Merit Slab 90–94.9% (30% Off)' };
    if (score >= 85) return { discount: Math.round(branchFee * 0.2), label: 'Merit Slab 85–89.9% (20% Off)' };
    if (score >= 75) return { discount: Math.round(branchFee * 0.1), label: 'Merit Slab 75–84.9% (10% Off)' };
    return { discount: 0, label: '' };
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
    document.getElementById('modal-sch-branch-name').textContent = `${offer.branchName} • ${SCH_OPTION_LABELS[offer.optionKey]?.optionText || 'Marks'}: ${offer.score}`;
    document.getElementById('modal-actual-fee').textContent = `${formatINR(offer.actualFee)}/yr (${formatINR(offer.actualFee * 4)} / 4 Years)`;
    document.getElementById('modal-sch-badge-label').textContent = `You Got Scholarship (${offer.label})`;
    document.getElementById('modal-sch-discount').textContent = `- ${formatINR(offer.discount)}/yr`;
    document.getElementById('modal-final-fee').textContent = `${formatINR(offer.finalFee)}/yr | 4 Years Fee: ${formatINR(fourYrTotal)}`;

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
        to: to || ADMIN_EMAIL,
        adminEmail: ccAdmin ? ADMIN_EMAIL : null,
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

    console.info('[Gtech Student Mail Notification]', payload);
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

async function generateNextGtechId() {
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
            const bTag = w.slab.branch && w.slab.branch !== 'ALL' ? `${w.slab.branch} ` : '';
            return `${bTag}${String(w.slab.criterion).toUpperCase()} (${w.slab.type === 'flat' ? formatINR(w.slab.value) : w.slab.value + '%'})`;
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
    const branchPrefix = top.slab.branch && top.slab.branch !== 'ALL' ? `${top.slab.branch} • ` : '';
    const label = top.slab.criterion2
        ? `${branchPrefix}${String(top.slab.criterion).toUpperCase()} + ${String(top.slab.criterion2).toUpperCase()} Qualified`
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

function openExpertConcessionCall(uniName, uniKey) {
    const uni = state.universities.find((u, idx) => getUniKey(u, idx) === uniKey);
    const rules = parseScholarshipRules(uni) || {};
    const scoreState = state.cardScores[uniKey] || {};
    const summaryBits = [
        scoreState.branch ? `Chosen Branch: ${scoreState.branch}` : '',
        scoreState.inter ? `Inter: ${scoreState.inter}%` : '',
        scoreState.pcm ? `PCM: ${scoreState.pcm}%` : '',
        scoreState.mains ? `JEE Mains: ${scoreState.mains}` : '',
        scoreState.eamcet ? `EAMCET Rank: ${scoreState.eamcet}` : ''
    ].filter(Boolean).join(', ');

    if (rules.expert_phone) {
        showToast(
            'Expert Desk & Concession Request',
            `Call ${rules.expert_phone} for ${uniName} extra fee concession${summaryBits ? ` (${summaryBits})` : ''}.`,
            'success'
        );
    }
    openScholarshipModal(uniName, 'Scholarship Based on Marks');
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
                            <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/95 text-indigo-800 border border-indigo-100 shadow-xs">${statesDisplay}</span>
                            <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                                ${uni.nirf ? `<span class="text-[10px] font-mono font-bold text-slate-900 bg-white/95 px-2 py-0.5 rounded-lg border border-slate-200">NIRF #${uni.nirf}</span>` : ''}
                                <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white">Entrance Exam Only</span>
                            </div>
                        </div>

                        <div class="p-4 sm:p-5">
                            <h3 class="font-black text-base text-slate-900 leading-snug">${uni.name}</h3>
                            <p class="text-xs text-slate-600 mt-1 flex items-start gap-1.5">
                                <i class="fa-solid fa-location-dot text-indigo-600 mt-0.5 shrink-0"></i>
                                <span>${uni.address || ''}</span>
                            </p>
                            ${campusPills}

                            <div class="mt-3 p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-1.5 text-xs">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="font-black uppercase tracking-wider text-indigo-900 text-[11px]">
                                        <i class="fa-solid fa-file-pen mr-1"></i> Entrance Exam Admission
                                    </span>
                                    <span class="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-extrabold">Exam Only</span>
                                </div>
                                ${uni.entrance_exam_name ? `<p class="text-indigo-950 font-bold">Entrance Exam: <span class="font-mono">${uni.entrance_exam_name}</span></p>` : ''}
                                <p class="text-slate-600 text-[11px]">We assist with entrance exam applications only—not direct admissions.</p>
                            </div>

                            <div class="mt-3 p-2.5 rounded-xl bg-sky-50/70 border border-sky-100 text-xs">
                                <span class="text-[10px] text-sky-800 block font-semibold">Application Fee</span>
                                <strong class="text-sky-900 text-xs">₹${Number(uni.application_fee || 0).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5 pt-0">
                        <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Get Expert Application Help')" class="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                            <i class="fa-solid fa-headset"></i> Get Expert Application Help
                        </button>
                    </div>
                </div>
            `;
        }

        const eamcetAvailable = isAP && String(uni.eamcet_seats || 'not_available').toLowerCase() === 'available';
        const mgmtAvailable = !isAP || String(uni.management_seats || 'available').toLowerCase() === 'available';

        const branches = parseBranchesObject(uni.branches);
        const branchEntries = Object.entries(branches);
        const scoreState = getCardScoreState(uniKey, branches);

        const branchRows = branchEntries.length > 0
            ? branchEntries.map(([branch, fee]) => {
                const yrFee = Number(fee || 0);
                const isChosen = scoreState.branch === branch;
                return `
                    <div class="flex justify-between items-center py-1 border-b border-sky-100 text-[11px] gap-2 ${isChosen ? 'bg-indigo-50/80 px-1.5 rounded-lg' : ''}">
                        <span class="text-slate-700 font-bold">${branch} ${isChosen ? '<span class="text-[9px] font-black text-indigo-700">(Chosen)</span>' : ''}</span>
                        <span class="text-emerald-700 font-extrabold text-right">${formatINR(yrFee)}/yr <span class="text-[10px] text-slate-500 font-semibold">(${formatINR(yrFee * 4)} / 4 Years)</span></span>
                    </div>
                `;
            }).join('')
            : `<p class="text-[11px] text-slate-500">Branch fee details will be shared during counselling/application.</p>`;

        const rules = parseScholarshipRules(uni);
        const allowedCriteria = getAllowedCriteriaForUni(uni);
        const isInterOnlyCard = allowedCriteria.length === 1 && allowedCriteria[0] === 'inter';

        const selectedFee = Number(branches[scoreState.branch] ?? Object.values(branches)[0] ?? 0);
        const initialEval = evaluateUniversityScholarship(uni, {
            branch: scoreState.branch,
            selectedFee,
            inter: scoreState.inter,
            pcm: scoreState.pcm,
            mains: scoreState.mains,
            eamcet: scoreState.eamcet
        });

        const scholarshipBreakdownHtml = buildScholarshipBreakdownHtml(uni, scoreState.branch);

        const inputFieldMeta = {
            inter: { placeholder: 'Inter %', val: scoreState.inter || '' },
            pcm: { placeholder: 'PCM %', val: scoreState.pcm || '' },
            mains: { placeholder: 'JEE %', val: scoreState.mains || '' },
            eamcet: { placeholder: 'EAMCET Rank', val: scoreState.eamcet || '' }
        };

        const scoreInputsHtml = isInterOnlyCard
            ? `<div class="text-[11px]">
                <input type="number" step="any" placeholder="Inter %" value="${scoreState.inter || ''}" oninput="updateCardScoreAndRefresh('${safeUniKey}', 'inter', this.value)" class="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono">
               </div>`
            : `<div class="grid grid-cols-${Math.min(allowedCriteria.length, 3)} gap-1.5 text-[11px]">
                ${allowedCriteria.map(cKey => {
                    const meta = inputFieldMeta[cKey] || { placeholder: cKey.toUpperCase(), val: scoreState[cKey] || '' };
                    return `<input type="number" step="any" placeholder="${meta.placeholder}" value="${meta.val}" oninput="updateCardScoreAndRefresh('${safeUniKey}', '${cKey}', this.value)" class="bg-white border border-indigo-200 rounded-lg px-2 py-1.5 text-[11px] font-mono">`;
                }).join('')}
               </div>`;

        const calculatorWidgetHtml = branchEntries.length > 0 ? `
            <div data-single-marks-mode="${isInterOnlyCard ? 'true' : 'false'}" class="mt-3 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-[10px] font-black uppercase tracking-wider text-indigo-900">
                        <i class="fa-solid fa-calculator mr-1"></i> Scholarship &amp; Fee Filter
                    </span>
                    <div class="flex items-center gap-1.5">
                        ${isInterOnlyCard ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">Inter % Only</span>` : ''}
                        ${rules?.enabled ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">Auto Slab Active</span>` : ''}
                    </div>
                </div>

                <div class="space-y-1">
                    <label class="block text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">Chosen Branch</label>
                    <select onchange="updateCardScoreAndRefresh('${safeUniKey}', 'branch', this.value)" class="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-800">
                        ${branchEntries.map(([bName, bFee]) => `<option value="${String(bName).replace(/"/g, '&quot;')}" ${scoreState.branch === bName ? 'selected' : ''}>${bName} — ${formatINR(bFee)}/yr</option>`).join('')}
                    </select>
                </div>

                ${scoreInputsHtml}

                <div id="uni-calc-box-${uniKey}" class="p-2.5 rounded-xl bg-white border border-indigo-100">
                    ${initialEval.discountAmount > 0 ? `
                        <div class="space-y-1 text-[11px]">
                            <div class="flex justify-between"><span class="text-slate-600 font-semibold">Chosen Branch (${scoreState.branch || 'Selected'}):</span><span class="font-bold text-slate-900">${formatINR(selectedFee)}/yr</span></div>
                            <div class="flex justify-between"><span class="text-emerald-800 font-bold">You Got Scholarship (${initialEval.breakdownText}):</span><span class="font-black text-emerald-700">-${formatINR(initialEval.discountAmount)}/yr</span></div>
                            <div class="flex justify-between text-xs"><span class="font-black text-indigo-950">Tuition Per Year / 4 Years Fee:</span><span class="font-black text-indigo-700">${formatINR(initialEval.netTuition)}/yr • ${formatINR(initialEval.fourYearTuition)}</span></div>
                        </div>
                    ` : `
                        <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-indigo-900">
                            <span>Chosen Branch (${scoreState.branch || 'Selected'}): <strong>${formatINR(selectedFee)}/yr</strong> • 4 Years Fee: <strong>${formatINR(selectedFee * 4)}</strong></span>
                            <span class="font-bold text-indigo-700">${isInterOnlyCard ? 'Enter Inter % to preview' : 'Enter marks/JEE to preview'}</span>
                        </div>
                    `}
                </div>

                <button type="button" onclick="openExpertConcessionCall('${safeUniName}', '${safeUniKey}')" class="w-full py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition">
                    <i class="fa-solid fa-phone-volume"></i>
                    <span>Call to Expert for Extra Fee Concession</span>
                </button>
            </div>
        ` : '';

        if (isAP) {
            return `
                <div class="bg-white rounded-3xl border border-sky-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-300 transition duration-300 flex flex-col justify-between">
                    <div>
                        <div class="relative aspect-[16/9] w-full overflow-hidden bg-sky-50">
                            <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-transparent to-transparent"></div>
                            <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/95 text-sky-800 border border-sky-100 shadow-xs">${statesDisplay}</span>
                            <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                                ${uni.nirf ? `<span class="text-[10px] font-mono font-bold text-slate-900 bg-white/95 px-2 py-0.5 rounded-lg border border-slate-200">NIRF #${uni.nirf}</span>` : ''}
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg ${eamcetAvailable ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'}">
                                    ${eamcetAvailable ? 'EAMCET Seats Available' : 'EAMCET Seats Not Available'}
                                </span>
                            </div>
                        </div>

                        <div class="p-4 sm:p-5">
                            <h3 class="font-black text-base text-slate-900 leading-snug">${uni.name}</h3>
                            <p class="text-xs text-slate-600 mt-1 flex items-start gap-1.5">
                                <i class="fa-solid fa-location-dot text-sky-600 mt-0.5 shrink-0"></i>
                                <span>${uni.address || ''}</span>
                            </p>
                            ${campusPills}

                            ${eamcetAvailable ? `
                                <div class="mt-3 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[11px] font-black uppercase tracking-wider text-emerald-900">
                                            <i class="fa-solid fa-landmark mr-1"></i> AP EAMCET Quota
                                        </span>
                                        <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold">Available</span>
                                    </div>
                                    <div class="flex justify-between items-center text-xs py-1 border-b border-emerald-200/80">
                                        <span class="text-emerald-900 font-semibold">Tuition Fee</span>
                                        <strong class="text-emerald-800">Reimbursement by Govt of AP</strong>
                                    </div>
                                    <div class="flex justify-between items-center text-xs pt-0.5">
                                        <span class="text-emerald-900 font-semibold">Hostel Fee Only</span>
                                        <strong class="text-slate-900">₹${Number(uni.hostel_fee || 0).toLocaleString('en-IN')}/yr</strong>
                                    </div>
                                </div>
                            ` : ''}

                            ${mgmtAvailable ? `
                                <div class="mt-3 p-3 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-1.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[11px] font-black uppercase tracking-wider text-sky-900">Management Quota Tuition</span>
                                        <span class="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">Direct Seat</span>
                                    </div>
                                    <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                        ${branchRows}
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 pt-1.5 text-xs">
                                        <div class="p-2 rounded-xl bg-amber-50 border border-amber-100">
                                            <span class="text-[10px] text-amber-800 block font-semibold">Hostel Fee</span>
                                            <strong class="text-amber-900">₹${Number(uni.hostel_fee || 0).toLocaleString('en-IN')}/yr</strong>
                                        </div>
                                        <div class="p-2 rounded-xl bg-white border border-sky-100">
                                            <span class="text-[10px] text-sky-800 block font-semibold">Application Fee</span>
                                            <strong class="text-sky-900">₹${Number(uni.application_fee || 0).toLocaleString('en-IN')}</strong>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${scholarshipBreakdownHtml}
                            ${calculatorWidgetHtml}
                        </div>
                    </div>

                    <div class="p-4 sm:p-5 pt-0 space-y-2">
                        ${eamcetAvailable && mgmtAvailable ? `
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button type="button" onclick="openScholarshipModal('${safeUniName}', 'EAMCET Counselling Help')" class="w-full py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                    <i class="fa-solid fa-compass"></i> EAMCET Counselling Help
                                </button>
                                <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Apply Management Quota')" class="w-full py-2.5 px-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                    <i class="fa-solid fa-file-signature"></i> Apply Management Quota
                                </button>
                            </div>
                        ` : eamcetAvailable ? `
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'EAMCET Counselling Help')" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-compass"></i> EAMCET Counselling Help
                            </button>
                        ` : mgmtAvailable ? `
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Apply Management Quota')" class="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-file-signature"></i> Apply Management Quota
                            </button>
                        ` : ''}

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Scholarship Based on Marks')" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-award"></i> Scholarship Form
                            </button>
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Visiting Application')" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:opacity-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-route"></i> Visiting Application
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        const badgeClass = isEntranceAndDirect
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200';

        return `
            <div class="bg-white rounded-3xl border border-sky-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-300 transition duration-300 flex flex-col justify-between">
                <div>
                    <div class="relative aspect-[16/9] w-full overflow-hidden bg-sky-50">
                        <img src="${uni.image}" alt="${uni.name}" class="w-full h-full object-cover object-center">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-transparent to-transparent"></div>
                        <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/95 text-sky-800 border border-sky-100 shadow-xs">${statesDisplay}</span>
                        <div class="absolute top-2.5 right-2.5 flex flex-wrap justify-end gap-1">
                            ${uni.nirf ? `<span class="text-[10px] font-mono font-bold text-slate-900 bg-white/95 px-2 py-0.5 rounded-lg border border-slate-200">NIRF #${uni.nirf}</span>` : ''}
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg border ${badgeClass}">${mode}</span>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5">
                        <h3 class="font-black text-base text-slate-900 leading-snug">${uni.name}</h3>
                        <p class="text-xs text-slate-600 mt-1 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-sky-600 mt-0.5 shrink-0"></i>
                            <span>${uni.address || ''}</span>
                        </p>
                        ${campusPills}

                        <div class="mt-4 p-3 rounded-2xl bg-sky-50/70 border border-sky-100">
                            <p class="text-[11px] font-bold text-sky-800 mb-2 uppercase tracking-wide">Branch Tuition Fees (Tuition Per Year &amp; 4 Years Fee):</p>
                            <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                ${branchRows}
                            </div>
                        </div>

                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                                <span class="text-[10px] text-amber-800 block font-semibold">Hostel Fee</span>
                                <strong class="text-amber-900 text-xs">₹${Number(uni.hostel_fee || 0).toLocaleString('en-IN')}/yr</strong>
                            </div>
                            <div class="p-2.5 rounded-xl bg-sky-50/70 border border-sky-100">
                                <span class="text-[10px] text-sky-800 block font-semibold">Application Fee</span>
                                <strong class="text-sky-900 text-xs">₹${Number(uni.application_fee || 0).toLocaleString('en-IN')}</strong>
                            </div>
                        </div>

                        ${scholarshipBreakdownHtml}
                        ${calculatorWidgetHtml}
                    </div>
                </div>

                <div class="p-4 sm:p-5 pt-0 space-y-2">
                    ${isEntranceAndDirect ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Get Expert Application Help')" class="w-full py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-headset"></i> Get Expert Application Help
                            </button>
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Scholarship Based on Marks')" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:opacity-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-award"></i> Scholarship Form
                            </button>
                        </div>
                    ` : `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Scholarship Based on Marks')" class="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-award"></i> Scholarship Form
                            </button>
                            <button type="button" onclick="openScholarshipModal('${safeUniName}', 'Visiting Application')" class="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
                                <i class="fa-solid fa-route"></i> Visiting Application
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function openScholarshipModal(uniName = '', assistanceType = '') {
    if (!state.currentStudent) {
        state.pendingPostLoginAction = {
            type: 'scholarship_form',
            uniName: uniName || '',
            assistanceType: assistanceType || 'Scholarship Based on Marks'
        };
        const formLabel = assistanceType || 'Scholarship / Visiting Application';
        openAuthModal('login', `Please sign in or register first to access the ${formLabel} form.`);
        showToast('Login Required', `Please login or register first to open ${formLabel}.`, 'error');
        return;
    }

    const modal = document.getElementById('scholarship-app-modal');
    if (!modal) return;

    const uniInput = document.getElementById('guide-uni');
    const assistSelect = document.getElementById('guide-assistance');
    const banner = document.getElementById('guide-mode-banner');

    if (uniInput) {
        uniInput.value = uniName || '';
    }
    if (assistSelect && assistanceType) {
        assistSelect.value = assistanceType;
    }

    populateCampusSelectForUniversity(uniName);

    if (banner) {
        if (assistanceType === 'Get Expert Application Help') {
            banner.textContent = 'Entrance Exam Application Support Only: We assist with entrance exam applications only—not direct admissions.';
            banner.classList.remove('hidden');
        } else if (assistanceType === 'EAMCET Counselling Help') {
            banner.textContent = 'AP EAMCET Quota: Tuition fee is reimbursement by Govt of AP. Only Hostel Fee applies.';
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    prefillGuidanceFormWithStudent();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeScholarshipApplicationModal() {
    const modal = document.getElementById('scholarship-app-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function closeScholarshipModal() {
    closeScholarshipApplicationModal();
}

function prefillGuidanceFormWithStudent() {
    if (!state.currentStudent) return;
    const nameEl = document.getElementById('guide-name');
    const phoneEl = document.getElementById('guide-phone');
    const emailEl = document.getElementById('guide-email');
    if (nameEl) nameEl.value = state.currentStudent.full_name || '';
    if (phoneEl) phoneEl.value = state.currentStudent.mobile || '';
    if (emailEl) emailEl.value = state.currentStudent.email || '';
}

async function handleGuidanceSubmission(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-guidance');

    const name = document.getElementById('guide-name').value.trim();
    const phone = document.getElementById('guide-phone').value.replace(/\D+/g, '').trim();
    const email = document.getElementById('guide-email').value.trim().toLowerCase();
    const course = document.getElementById('guide-course').value;
    const rawUni = document.getElementById('guide-uni').value.trim();
    const campusWrap = document.getElementById('guide-campus-wrap');
    const selectedCampus = (campusWrap && !campusWrap.classList.contains('hidden'))
        ? (document.getElementById('guide-campus')?.value || '').trim()
        : '';
    const preferredUni = selectedCampus
        ? `${rawUni || 'University'} (${selectedCampus} Campus)`
        : rawUni;
    const assistanceType = document.getElementById('guide-assistance').value;

    const inter1st = document.getElementById('guide-inter-1st').value.trim();
    const inter2nd = document.getElementById('guide-inter-2nd').value.trim();
    const interTotal = document.getElementById('guide-inter-total').value.trim();
    const pcm600 = document.getElementById('guide-pcm-600').value.trim();
    const jeeMarks = document.getElementById('guide-jee').value.trim();
    const eamcetRank = document.getElementById('guide-eamcet').value.trim();

    if (!name || !phone || !email || !course || !assistanceType) {
        showToast('Missing Details', 'Please fill out all required fields.', 'error');
        return;
    }

    const marksSummary = [
        inter1st ? `Inter 1st Year: ${inter1st}` : '',
        inter2nd ? `Inter 2nd Year: ${inter2nd}` : '',
        interTotal ? `Total in Intermediate: ${interTotal}` : '',
        pcm600 ? `PCM Marks (600 with practicals): ${pcm600}` : '',
        jeeMarks ? `JEE Marks: ${jeeMarks}` : '',
        eamcetRank ? `EAMCET Rank: ${eamcetRank}` : ''
    ].filter(Boolean).join(' | ');

    const payload = {
        id: Date.now(),
        name,
        phone,
        email,
        branch: course,
        uni: preferredUni || 'General Scholarship Pool',
        assistance_type: assistanceType,
        inter_1st_marks: inter1st || null,
        inter_2nd_marks: inter2nd || null,
        inter_marks: interTotal || null,
        pcm_marks: pcm600 || null,
        jee_score: marksSummary || jeeMarks || null,
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
                jee_score: `${assistanceType}${marksSummary ? ' • ' + marksSummary : ''}`,
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
            to: email,
            ccAdmin: true,
            eventType: 'application_submitted',
            subject: `Gtech Admissions: ${assistanceType} Submitted (${name})`,
            text: [
                `Hello ${name},`,
                ``,
                `Your ${assistanceType} has been submitted successfully on Gtech Admissions.`,
                `Our expert will reach you within 10 mins.`,
                ``,
                `Application Details:`,
                `• Name: ${name}`,
                `• Phone: ${phone}`,
                `• Email: ${email}`,
                `• Course: ${course}`,
                `• University: ${payload.uni}`,
                `• Marks Summary: ${marksSummary || 'Not Provided'}`,
                `• Status: Pending Callback`,
                ``,
                `— Gtech Admissions (Admissions and Guidance Portal)`
            ].join('\n'),
            details: payload
        });

        showToast(
            'Application Submitted',
            'Application submitted! Update sent to your mail and our expert will reach you within 10 mins.',
            'success'
        );
        e.target.reset();
        document.getElementById('guide-inter-total').value = '';
        document.getElementById('guide-campus-wrap')?.classList.add('hidden');
        prefillGuidanceFormWithStudent();
        closeScholarshipApplicationModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'SUBMIT APPLICATION';
        }
    }
}

function openAuthModal(mode = 'login', noticeText = '') {
    const modal = document.getElementById('student-auth-modal');
    const noticeBox = document.getElementById('auth-redirect-notice');
    const noticeMsg = document.getElementById('auth-redirect-notice-text');

    if (noticeBox && noticeMsg) {
        if (noticeText) {
            noticeMsg.textContent = noticeText;
            noticeBox.classList.remove('hidden');
        } else {
            noticeBox.classList.add('hidden');
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchStudentAuthMode(mode);
}

function closeAuthModal() {
    const modal = document.getElementById('student-auth-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function continueAfterAuth() {
    closeAuthModal();
    if (state.pendingPostLoginAction && state.pendingPostLoginAction.type === 'scholarship_form') {
        const pending = state.pendingPostLoginAction;
        state.pendingPostLoginAction = null;
        openScholarshipModal(pending.uniName, pending.assistanceType);
    } else {
        openStudentDashboardModal('dashboard');
    }
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

        const gtechId = await generateNextGtechId();
        const earlyOfferQualified = isBeforeMarch16_2027();
        const earlyOfferText = earlyOfferQualified
            ? '₹2,000 OFF Unlocked (₹1,000 Admission Fee + ₹1,000 College Fee before March 16, 2027)'
            : null;

        const newStudent = {
            id: gtechId,
            student_id: gtechId,
            full_name: regData.full_name,
            mobile: regData.mobile,
            email: regData.email,
            referral_code: gtechId,
            referred_by_code: regData.referred_by_code || null,
            early_offer_eligible: earlyOfferQualified,
            early_offer_discount: earlyOfferQualified ? 2000 : 0,
            early_offer_note: earlyOfferText
        };

        let { data: inserted, error } = await _supabase
            .from('student_profiles')
            .insert([newStudent])
            .select()
            .maybeSingle();

        if (error) {
            const minimalStudent = {
                id: gtechId,
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

        const profile = { ...newStudent, ...(inserted || {}) };
        profile.student_id = profile.student_id || profile.id || gtechId;
        if (typeof profile.early_offer_eligible !== 'boolean') {
            profile.early_offer_eligible = earlyOfferQualified;
        }

        state.currentStudent = profile;
        state.pendingRegistration = null;
        localStorage.removeItem('gtech_pending_reg');
        localStorage.setItem('gtech_student_session', JSON.stringify(profile));

        updateHeaderForLoggedInStudent(profile);
        prefillGuidanceFormWithStudent();

        await sendMailNotification({
            to: profile.email,
            ccAdmin: true,
            eventType: 'new_student_registered',
            subject: `Congrats! Welcome to Gtech Family — Gtech ID: ${profile.student_id}`,
            text: [
                `Congrats ${profile.full_name}, Welcome to the Gtech Family!`,
                ``,
                `Your Gtech ID is: ${profile.student_id}`,
                `Your Referral Code is: ${profile.student_id}`,
                earlyOfferQualified
                    ? `Special Offer (Registered before March 16, 2027): ₹2,000 OFF total (₹1,000/- off Admission Fee + ₹1,000/- off College Fee).`
                    : ``,
                `Refer friends and earn up to ₹30,000/- referral benefit—added to tuition after your friend's admission is done.`,
                ``,
                `— Gtech Admissions (Admissions and Guidance Portal)`
            ].filter(Boolean).join('\n'),
            details: profile
        });

        document.getElementById('student-register-form').classList.add('hidden');
        document.getElementById('reg-otp-panel').classList.add('hidden');
        document.getElementById('generated-student-id-display').textContent = profile.student_id;

        const offerMsgEl = document.getElementById('reg-early-offer-msg');
        if (offerMsgEl && earlyOfferQualified) {
            offerMsgEl.textContent = 'Congrats! Before March 16, 2027 offer unlocked: ₹1,000/- off Admission Fee + ₹1,000/- off College Fee (₹2,000 OFF)!';
        }

        document.getElementById('reg-success-panel').classList.remove('hidden');
        showToast(
            'Congrats! Welcome to Gtech Family',
            earlyOfferQualified
                ? `Gtech ID ${profile.student_id} created! ₹1,000 admission + ₹1,000 college fee discount unlocked.`
                : `Gtech ID ${profile.student_id} generated!`,
            'success'
        );

        if (earlyOfferQualified) {
            setTimeout(() => {
                openEarlyOfferModal(profile.student_id);
            }, 450);
        }
    } catch (err) {
        showInlineError(errId, err.message || 'Invalid OTP code.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Complete Registration';
    }
}

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
        showToast('Welcome Back', `Signed in as ${profile.full_name}.`, 'success');
        continueAfterAuth();
    } catch (err) {
        showInlineError(errId, err.message || 'Invalid OTP code.');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Continue';
    }
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
        nameSpan.textContent = profile.full_name || 'Student Portal';
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

function closeStudentDashboardModal() {
    const modal = document.getElementById('student-dashboard-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function handleStudentLogout() {
    await _supabase.auth.signOut().catch(() => {});
    state.authUser = null;
    state.currentStudent = null;
    state.financeRecord = null;
    localStorage.removeItem('gtech_student_session');
    resetHeaderToLoggedOut();
    closeStudentDashboardModal();
    showToast('Signed Out', 'You have signed out of your student portal.', 'success');
}

function switchDashboardSection(tabName) {
    state.activeDashboardTab = tabName;
    const tabs = ['dashboard', 'referral'];

    tabs.forEach(t => {
        const sectionEl = document.getElementById(`dash-section-${t}`);
        const btnEl = document.getElementById(`dash-tab-btn-${t}`);
        if (!sectionEl || !btnEl) return;

        if (t === tabName) {
            sectionEl.classList.remove('hidden');
            btnEl.className = 'px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-indigo-600 text-white text-[10px] sm:text-xs font-extrabold whitespace-nowrap shrink-0 shadow-xs transition flex items-center gap-1';
        } else {
            sectionEl.classList.add('hidden');
            btnEl.className = 'px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-slate-700 hover:bg-white text-[10px] sm:text-xs font-bold whitespace-nowrap shrink-0 transition flex items-center gap-1';
        }
    });
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

function getUniversityWiseApplications(student) {
    const myApps = state.inquiries.filter(inq =>
        (inq.email && student.email && inq.email.toLowerCase() === student.email.toLowerCase()) ||
        (inq.phone && student.mobile && String(inq.phone).includes(String(student.mobile)))
    );

    const groupedMap = new Map();
    myApps.forEach(app => {
        const uniName = (app.uni || 'General Scholarship Pool').trim() || 'General Scholarship Pool';
        const key = uniName.toLowerCase();
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                uniName,
                applications: []
            });
        }
        groupedMap.get(key).applications.push(app);
    });

    return Array.from(groupedMap.values());
}

function openUniversityStatusModal(uniName) {
    const modal = document.getElementById('university-status-modal');
    const titleEl = document.getElementById('uni-status-modal-title');
    const bodyEl = document.getElementById('uni-status-modal-body');
    if (!modal || !titleEl || !bodyEl) return;

    const cleanTargetName = String(uniName || '').replace(/\s*\(.*Campus\)\s*$/i, '').trim().toLowerCase();
    const matchedUni = state.universities.find(
        u => u.name && u.name.trim().toLowerCase() === cleanTargetName
    );
    const isEntranceOnly = matchedUni ? isEntranceExamOnlyMode(matchedUni) : false;

    const fin = state.financeRecord || {};
    const stuApps = state.currentStudent ? getUniversityWiseApplications(state.currentStudent) : [];
    const group = stuApps.find(g => g.uniName.toLowerCase() === String(uniName || '').trim().toLowerCase());
    const latestApp = group?.applications?.[0] || {};

    const rawAdminStatus = String(
        fin.scholarship_status || latestApp.scholarship_status || latestApp.status || 'Under Review'
    ).trim();

    const approvedAmount = Number(fin.scholarship_amount || latestApp.scholarship_amount || 0);
    const isScholarshipApproved =
        rawAdminStatus.toLowerCase().includes('approv') ||
        Boolean(fin.scholarship_approved === true || latestApp.scholarship_approved === true) ||
        approvedAmount > 0;

    titleEl.textContent = uniName;

    let feeStructureHtml = '';
    if (isEntranceOnly) {
        const appFeeText = matchedUni?.application_fee
            ? formatINR(matchedUni.application_fee)
            : (fin.application_fee ? formatINR(fin.application_fee) : 'As per university');
        feeStructureHtml = `
            <div class="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1">
                <span class="font-bold text-indigo-900 block">Entrance Exam Only Mode</span>
                ${matchedUni?.entrance_exam_name ? `<span class="text-[11px] text-indigo-800 block">Entrance Exam: <strong>${matchedUni.entrance_exam_name}</strong></span>` : ''}
                <span class="text-[11px] text-indigo-800 block">Application Fee: <strong>${appFeeText}</strong></span>
            </div>
        `;
    } else if (matchedUni && matchedUni.branches) {
        const branches = parseBranchesObject(matchedUni.branches);
        const entries = Object.entries(branches);
        const branchRowsHtml = entries.length > 0
            ? entries.map(([branch, fee]) => {
                const yrFee = Number(fee || 0);
                const bRules = getBranchRulesListForUni(matchedUni, branch);
                const bRuleNote = bRules.length > 0
                    ? `<span class="block text-[10px] font-bold text-purple-800">Scholarship: ${bRules.map(r => `${formatRuleRange(r)} → ${formatRuleBenefit(r)}`).join(', ')}</span>`
                    : '';
                return `
                    <div class="flex items-center justify-between py-1.5 border-b border-sky-100 last:border-none gap-2">
                        <div>
                            <span class="font-bold text-slate-700">${branch}</span>
                            ${bRuleNote}
                        </div>
                        <span class="font-extrabold text-indigo-700 text-right shrink-0">${formatINR(yrFee)}/yr <span class="text-[10px] text-slate-500 font-semibold">(${formatINR(yrFee * 4)} / 4 Years)</span></span>
                    </div>
                `;
            }).join('')
            : `<p class="text-slate-500">Fee structure will be updated by admin shortly.</p>`;

        const hostelFeeText = matchedUni?.hostel_fee
            ? `${formatINR(matchedUni.hostel_fee)}/yr`
            : (fin.hostel_fee ? formatINR(fin.hostel_fee) : 'As per university');

        const appFeeText = matchedUni?.application_fee
            ? formatINR(matchedUni.application_fee)
            : (fin.application_fee ? formatINR(fin.application_fee) : 'As per university');

        feeStructureHtml = `
            <div class="max-h-40 overflow-y-auto pr-1">${branchRowsHtml}</div>
            <div class="grid grid-cols-2 gap-2 pt-2">
                <div class="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <span class="text-[10px] text-amber-800 font-semibold block">Hostel Fee</span>
                    <strong class="text-slate-900">${hostelFeeText}</strong>
                </div>
                <div class="p-2 rounded-xl bg-sky-50 border border-sky-200">
                    <span class="text-[10px] text-sky-800 font-semibold block">Application Fee</span>
                    <strong class="text-slate-900">${appFeeText}</strong>
                </div>
            </div>
        `;
    } else if (fin.total_university_fee) {
        const yrFee = Number(fin.total_university_fee || 0);
        feeStructureHtml = `
            <div class="flex items-center justify-between py-1.5">
                <span class="font-bold text-slate-700">University Tuition Fee</span>
                <span class="font-extrabold text-indigo-700">${formatINR(yrFee)}/yr (${formatINR(yrFee * 4)} / 4 Years)</span>
            </div>
        `;
    } else {
        feeStructureHtml = `<p class="text-slate-500">Fee structure will be updated by admin shortly.</p>`;
    }

    const slabSummaryHtml = matchedUni ? buildScholarshipBreakdownHtml(matchedUni, latestApp.branch || '') : '';

    const offerBadgeHtml = state.currentStudent?.early_offer_eligible
        ? `<div class="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] font-bold text-indigo-900">
             Early Registration Offer (Before March 16, 2027): ₹1,000/- off Admission Fee + ₹1,000/- off College Fee (₹2,000 OFF).
           </div>`
        : '';

    bodyEl.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-sky-800 block">University Name</span>
            <strong class="text-sm font-black text-slate-900 block">${uniName}</strong>
            ${matchedUni?.address ? `<span class="text-[11px] text-slate-600 block">${matchedUni.address}</span>` : ''}
        </div>

        <div class="p-3.5 rounded-2xl bg-white border border-sky-200 space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">Fee Structure</span>
            ${feeStructureHtml}
        </div>

        ${slabSummaryHtml}
        ${offerBadgeHtml}

        <div class="p-4 rounded-2xl ${isScholarshipApproved ? 'bg-emerald-50 border border-emerald-300' : 'bg-amber-50 border border-amber-200'} space-y-2">
            <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider ${isScholarshipApproved ? 'text-emerald-800' : 'text-amber-800'}">Scholarship Status</span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${isScholarshipApproved ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'}">${isScholarshipApproved ? 'Approved' : rawAdminStatus}</span>
            </div>
            ${isScholarshipApproved
                ? `<div class="pt-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">Approved Scholarship Amount</span>
                    <strong class="text-xl font-black text-emerald-800">${formatINR(approvedAmount)}</strong>
                   </div>`
                : `<p class="text-[11px] text-amber-800">Scholarship amount will become visible once approved by admin.</p>`
            }
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeUniversityStatusModal() {
    const modal = document.getElementById('university-status-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderStudentDashboard() {
    const stu = state.currentStudent;
    if (!stu) return;

    const gtechCode = (stu.student_id || stu.id || 'GTECH6001').toUpperCase();
    const myRefCode = (stu.referral_code || gtechCode).toUpperCase();

    document.getElementById('dash-topbar-name').textContent = stu.full_name || 'Student Portal';
    document.getElementById('dash-topbar-id').textContent = `Gtech ID: ${gtechCode}`;
    document.getElementById('student-welcome-name').textContent = `Hello, ${stu.full_name}!`;
    document.getElementById('student-dash-id').textContent = gtechCode;

    const offerCard = document.getElementById('dash-early-offer-card');
    if (offerCard) {
        const showOffer = Boolean(stu.early_offer_eligible) || (Number(stu.early_offer_discount || 0) > 0);
        offerCard.classList.toggle('hidden', !showOffer);
    }

    const uniGroups = getUniversityWiseApplications(stu);
    const uniListEl = document.getElementById('applied-scholarship-universities-list');

    if (uniGroups.length === 0) {
        uniListEl.innerHTML = `<p class="text-xs text-slate-500 p-3.5 rounded-2xl bg-sky-50/60 border border-sky-100">No scholarship university applications submitted yet. Click "+ Apply University Scholarship" to get started.</p>`;
    } else {
        uniListEl.innerHTML = uniGroups.map(group => {
            const safeUni = group.uniName.replace(/'/g, "\\'");
            const coursesText = group.applications
                .map(a => `${a.assistance_type || 'Scholarship Based on Marks'} (${a.branch || 'Course'})`)
                .join(' • ');

            return `
                <div class="p-4 rounded-2xl bg-sky-50/60 border border-sky-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="min-w-0">
                        <strong class="text-sm font-black text-slate-900 block break-words">${group.uniName}</strong>
                        <p class="text-[11px] text-slate-600 mt-0.5">${coursesText}</p>
                    </div>
                    <button type="button" onclick="openUniversityStatusModal('${safeUni}')" class="self-start sm:self-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-xs transition flex items-center gap-1.5 shrink-0">
                        <i class="fa-solid fa-circle-info text-[11px]"></i>
                        <span>Status</span>
                    </button>
                </div>
            `;
        }).join('');
    }

    const admStatusEl = document.getElementById('applied-universities-admission-status');
    const stageBadge = document.getElementById('dash-current-stage-badge');

    if (uniGroups.length === 0) {
        stageBadge.textContent = 'No Applications';
        admStatusEl.innerHTML = `<p class="text-xs text-slate-500 p-3.5 rounded-2xl bg-sky-50/60 border border-sky-100">Your university admission status will appear here once you apply.</p>`;
    } else {
        const latestStatus = uniGroups[0].applications[0]?.status || 'Pending Callback';
        stageBadge.textContent = latestStatus;

        admStatusEl.innerHTML = uniGroups.map(group => {
            const latest = group.applications[0] || {};
            const admState = latest.admission_status || latest.status || 'Pending Callback';
            return `
                <div class="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div class="min-w-0">
                        <strong class="text-slate-900 font-extrabold block">${group.uniName}</strong>
                        <span class="text-[11px] text-slate-600">${latest.branch || 'Program'} • ${latest.assistance_type || 'Application'}</span>
                    </div>
                    <span class="self-start sm:self-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 font-extrabold text-[10px] border border-indigo-200 shrink-0">${admState}</span>
                </div>
            `;
        }).join('');
    }

    const fin = state.financeRecord || {};
    const visibleReferralAmount = Number(fin.referral_earnings || 0);
    const shareLink = `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(myRefCode)}`;

    document.getElementById('my-referral-code-text').textContent = myRefCode;
    document.getElementById('my-referral-link-input').value = shareLink;
    document.getElementById('ref-tab-amount').textContent = formatINR(visibleReferralAmount);

    const referralInquiries = state.inquiries.filter(inq =>
        inq.referral_code && String(inq.referral_code).toUpperCase() === myRefCode
    );

    const referredCount = Math.max(state.referredStudents.length, referralInquiries.length);
    document.getElementById('ref-tab-pending-count').textContent = String(referredCount);

    const refListEl = document.getElementById('my-referred-students-list');
    if (state.referredStudents.length === 0 && referralInquiries.length === 0) {
        refListEl.innerHTML = `<p class="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border border-slate-200">No referred students yet. Share your referral code to earn up to ₹30,000/- added to tuition after your friend's admission is done.</p>`;
    } else {
        const items = state.referredStudents.length > 0
            ? state.referredStudents.map(rs => ({
                name: rs.full_name || 'Referred Student',
                id: rs.student_id || rs.id || '',
                status: 'Registered'
            }))
            : referralInquiries.map(ri => ({
                name: ri.name || 'Referred Applicant',
                id: ri.branch || '',
                status: ri.status || 'In Process'
            }));

        refListEl.innerHTML = items.map(item => `
            <div class="p-3 rounded-xl bg-sky-50/60 border border-sky-200 flex items-center justify-between gap-2 text-xs">
                <div>
                    <strong class="text-slate-900 block">${item.name}</strong>
                    ${item.id ? `<span class="text-[11px] font-mono text-slate-600">${item.id}</span>` : ''}
                </div>
                <span class="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[10px]">${item.status}</span>
            </div>
        `).join('');
    }
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
    const msg = encodeURIComponent(`Join Gtech Admissions for B.Tech, Degree & Medical admissions, scholarships, and free campus visits! Register before March 16, 2027 for ₹2,000 OFF and use my Referral Code ${code} (up to ₹30,000/- tuition benefit): ${link}`);
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

function subscribeToUniversityScholarshipChanges() {
    _supabase
        .channel('gtech-universities-scholarship-sync')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'universities' },
            async () => {
                await fetchUniversitiesFromSupabase();
            }
        )
        .subscribe();
}

function subscribeToStudentMailUpdates() {
    _supabase
        .channel('gtech-student-updates')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'inquiries' },
            async (payload) => {
                const updated = payload.new || {};
                const old = payload.old || {};
                if (!updated.email) return;

                if (updated.status && updated.status !== old.status) {
                    const isApproved = String(updated.status).toLowerCase().includes('approv');
                    await sendMailNotification({
                        to: updated.email,
                        ccAdmin: false,
                        eventType: isApproved ? 'application_approved' : 'application_status_updated',
                        subject: isApproved
                            ? `Gtech Admissions: Application Approved (${updated.uni || 'University'})`
                            : `Gtech Admissions Update: Status Changed to ${updated.status}`,
                        text: [
                            `Hello ${updated.name || 'Student'},`,
                            ``,
                            isApproved
                                ? `Good news! Your application for ${updated.uni || 'your chosen university'} (${updated.branch || ''}) has been APPROVED.`
                                : `Your application status for ${updated.uni || 'your chosen university'} (${updated.branch || ''}) has been updated to: ${updated.status}.`,
                            ``,
                            `Sign in to your Gtech Student Portal using your registered email to view your Gtech ID and status.`,
                            `— Gtech Admissions (Admissions and Guidance Portal)`
                        ].join('\n'),
                        details: updated
                    });

                    if (state.currentStudent && state.currentStudent.email?.toLowerCase() === updated.email.toLowerCase()) {
                        await fetchInquiriesFromSupabase();
                        renderStudentDashboard();
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'student_finances' },
            async (payload) => {
                const fin = payload.new || {};
                const old = payload.old || {};
                if (!fin.email) return;

                const referralChanged = Number(fin.referral_earnings || 0) !== Number(old.referral_earnings || 0);
                const scholarshipChanged = Number(fin.scholarship_amount || 0) !== Number(old.scholarship_amount || 0);
                const statusChanged = String(fin.scholarship_status || '') !== String(old.scholarship_status || '');

                if (referralChanged || scholarshipChanged || statusChanged || payload.eventType === 'INSERT') {
                    await sendMailNotification({
                        to: fin.email,
                        ccAdmin: false,
                        eventType: referralChanged ? 'referral_amount_updated' : 'scholarship_status_updated',
                        subject: referralChanged
                            ? `Gtech Admissions: Referral Amount Updated (₹${Number(fin.referral_earnings || 0).toLocaleString('en-IN')})`
                            : `Gtech Admissions: Scholarship Status Updated`,
                        text: [
                            `Hello Student,`,
                            ``,
                            `Your Gtech Admissions portal has a new update:`,
                            referralChanged ? `• Referral Amount: ₹${Number(fin.referral_earnings || 0).toLocaleString('en-IN')}` : '',
                            scholarshipChanged || statusChanged
                                ? `• Scholarship Status: ${fin.scholarship_status || (Number(fin.scholarship_amount || 0) > 0 ? 'Approved' : 'Under Review')}`
                                : '',
                            ``,
                            `Sign in to your Gtech Student Portal with your Gtech ID to view details.`,
                            `— Gtech Admissions (Admissions and Guidance Portal)`
                        ].filter(Boolean).join('\n'),
                        details: fin
                    });

                    if (state.currentStudent && state.currentStudent.email?.toLowerCase() === fin.email.toLowerCase()) {
                        state.financeRecord = fin;
                        renderStudentDashboard();
                    }
                }
            }
        )
        .subscribe();
}

window.showToast = showToast;
window.hideToast = hideToast;
window.openEarlyOfferModal = openEarlyOfferModal;
window.closeEarlyOfferModal = closeEarlyOfferModal;
window.sanitizeNumericInput = sanitizeNumericInput;
window.calculateIntermediateTotal = calculateIntermediateTotal;
window.handleOtpBoxInput = handleOtpBoxInput;
window.handleOtpBoxKeydown = handleOtpBoxKeydown;
window.handleGlobalBudgetChange = handleGlobalBudgetChange;
window.applyGlobalMarksFilter = applyGlobalMarksFilter;
window.clearGlobalMarksFilter = clearGlobalMarksFilter;
window.handleScholarshipOptionChange = handleScholarshipOptionChange;
window.checkStudentScholarship = checkStudentScholarship;
window.openScholarshipCongratsModal = openScholarshipCongratsModal;
window.closeScholarshipCongratsModal = closeScholarshipCongratsModal;
window.proceedWithScholarshipApplication = proceedWithScholarshipApplication;
window.openScholarshipModal = openScholarshipModal;
window.closeScholarshipApplicationModal = closeScholarshipApplicationModal;
window.closeScholarshipModal = closeScholarshipModal;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.continueAfterAuth = continueAfterAuth;
window.switchStudentAuthMode = switchStudentAuthMode;
window.handleSendRegistrationOtp = handleSendRegistrationOtp;
window.handleVerifyRegistrationOtp = handleVerifyRegistrationOtp;
window.handleSendLoginOtp = handleSendLoginOtp;
window.handleVerifyLoginOtp = handleVerifyLoginOtp;
window.handleStudentLogout = handleStudentLogout;
window.openStudentDashboardModal = openStudentDashboardModal;
window.closeStudentDashboardModal = closeStudentDashboardModal;
window.switchDashboardSection = switchDashboardSection;
window.openUniversityStatusModal = openUniversityStatusModal;
window.closeUniversityStatusModal = closeUniversityStatusModal;
window.copyMyReferralCode = copyMyReferralCode;
window.copyMyReferralLink = copyMyReferralLink;
window.shareReferralWhatsApp = shareReferralWhatsApp;
window.shareReferralInstagram = shareReferralInstagram;
window.setStateFilter = setStateFilter;
window.handleGuidanceSubmission = handleGuidanceSubmission;
window.updateCardScoreAndRefresh = updateCardScoreAndRefresh;
window.openExpertConcessionCall = openExpertConcessionCall;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;

async function initGtechPortal() {
    hideAddedMarksBudgetFilterBar();
    reorderFilterButtonsEntranceFirst();

    const searchInput = document.getElementById('uni-search');
    if (searchInput) searchInput.value = '';

    detectIncomingReferralLink();
    handleScholarshipOptionChange();
    listenToAuthChanges();
    await restoreStudentSession();
    await fetchUniversitiesFromSupabase();
    await fetchInquiriesFromSupabase();
    await loadActiveCarousel();
    subscribeToStudentMailUpdates();
    subscribeToUniversityScholarshipChanges();

    setInterval(() => {
        nextSlide();
    }, 4500);
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initGtechPortal, { once: true });
} else {
    initGtechPortal();
}
