/*
 * German Car Reliability - Frontend Logic
 */

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sentenceCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

const COMPONENT_CLEANUP = {
    "ENGINE AND ENGINE COOLING": "ENGINE", "SERVICE BRAKES": "BRAKES",
    "SERVICE BRAKES, HYDRAULIC": "BRAKES", "FUEL SYSTEM, GASOLINE": "FUEL SYSTEM",
    "FUEL/PROPULSION SYSTEM": "FUEL SYSTEM", "EXTERIOR LIGHTING": "LIGHTS",
    "FORWARD COLLISION AVOIDANCE": "SAFETY TECH",
    "ELECTRONIC STABILITY CONTROL (ESC)": "STABILITY CONTROL",
    "VEHICLE SPEED CONTROL": "ACCELERATION", "EQUIPMENT ADAPTIVE/MOBILITY": "EQUIPMENT",
    "LATCHES/LOCKS/LINKAGES": "LOCKS", "VISIBILITY/WIPER": "VISIBILITY",
    "UNKNOWN OR OTHER": "OTHER",
};

function cleanComponent(raw) { return COMPONENT_CLEANUP[raw.trim().toUpperCase()] || raw.trim().toUpperCase(); }
function splitComponents(s) { return s ? s.split(",").map(p => p.trim()).filter(Boolean) : []; }

// === DROPDOWNS ===
window.addEventListener("DOMContentLoaded", async () => {
    const makeSel = document.getElementById("make");
    if (!makeSel) return;
    (await (await fetch("/api/makes")).json()).forEach(m => {
        const o = document.createElement("option"); o.value = m; o.textContent = m; makeSel.appendChild(o);
    });
    loadStats();
});

async function loadModels() {
    const make = document.getElementById("make").value;
    const ms = document.getElementById("model"), ys = document.getElementById("year"), btn = document.getElementById("search-btn");
    ms.innerHTML = '<option value="">Select model</option>'; ys.innerHTML = '<option value="">Select year</option>';
    ys.disabled = true; btn.disabled = true;
    if (!make) { ms.disabled = true; return; }
    (await (await fetch("/api/models/" + make)).json()).forEach(m => {
        const o = document.createElement("option"); o.value = m; o.textContent = m; ms.appendChild(o);
    });
    ms.disabled = false;
}

async function loadYears() {
    const make = document.getElementById("make").value, model = document.getElementById("model").value;
    const ys = document.getElementById("year"), btn = document.getElementById("search-btn");
    ys.innerHTML = '<option value="">Select year</option>'; btn.disabled = true;
    if (!model) { ys.disabled = true; return; }
    (await (await fetch("/api/years/" + make + "/" + model)).json()).forEach(y => {
        const o = document.createElement("option"); o.value = y; o.textContent = y; ys.appendChild(o);
    });
    ys.disabled = false;
    ys.onchange = () => { btn.disabled = !ys.value; };
}

async function searchCar() {
    const make = document.getElementById("make").value, model = document.getElementById("model").value, year = document.getElementById("year").value;
    const container = document.getElementById("results");
    container.classList.remove("hidden");
    container.innerHTML = '<div class="loading">Searching...</div>';
    const res = await fetch(`/api/car/${make}/${model}/${year}`);
    if (!res.ok) { container.innerHTML = '<div class="loading">No complaints found.</div>'; return; }
    const data = await res.json();
    container.innerHTML = renderCarCard(data, "single");
    loadTrendChart(make, model, parseInt(year));
    container.scrollIntoView({ behavior: "smooth" });
}

// === RENDER HELPERS ===
function renderComponentTags(raw, af) {
    return splitComponents(raw).map(p => `<span class="${af && cleanComponent(p) === af ? 'sample-tag sample-tag-match' : 'sample-tag'}">${esc(p)}</span>`).join('');
}

function renderSampleHTML(s, af) {
    const tags = [];
    if (s.crash) tags.push('<span class="sample-crash">CRASH</span>');
    if (s.fire) tags.push('<span class="sample-crash">FIRE</span>');
    if (s.injuries && s.injuries > 0) tags.push(`<span class="sample-crash">${s.injuries} INJ</span>`);
    return `<div class="sample">${esc(sentenceCase(s.summary))}<div class="sample-meta">${tags.join('')}${renderComponentTags(s.component, af)}${s.date_filed ? `<span class="sample-tag">${esc(s.date_filed)}</span>` : ''}</div></div>`;
}

function renderVerdict(verdict) {
    if (!verdict) return '';
    return `<div class="verdict-box verdict-${verdict.verdict}"><div class="verdict-label">${esc(verdict.label)}</div><div class="verdict-reasons">${verdict.reasons.map(r => `<span class="verdict-reason">${esc(r)}</span>`).join('')}</div></div>`;
}

function renderWorstYearWarning(wy, currentYear) {
    if (!wy) return '';
    const isCurrent = wy.year === currentYear;
    return `<div class="worst-year-warning ${isCurrent ? 'worst-year-current' : ''}"><div class="worst-year-title">${isCurrent ? 'You are viewing the worst model year' : 'Worst year to avoid: ' + wy.year}</div><div class="worst-year-detail">The ${wy.year} model has ${wy.complaints} complaints, ${wy.ratio}x higher than average (${wy.avg_other_years}). ${isCurrent ? 'Consider a different model year.' : ''}</div></div>`;
}

async function loadTrendChart(make, model, currentYear) {
    const c = document.getElementById("trend-chart-container");
    if (!c) return;
    const res = await fetch(`/api/trend/${make}/${model}`);
    if (!res.ok) { c.innerHTML = ''; return; }
    const trend = await res.json();
    if (trend.length < 2) { c.innerHTML = ''; return; }
    const mx = Math.max(...trend.map(t => t.complaints), 1);
    c.innerHTML = `<div class="trend-section"><div class="samples-title">Complaints by model year</div><div class="section-explainer">Taller bar = more complaints. Highlighted = year you searched.</div><div class="trend-chart">${trend.map(t => {
        const h = Math.max((t.complaints / mx) * 120, 2);
        const active = t.year === currentYear;
        let bc = 'trend-bar';
        if (active) bc += ' trend-bar-active';
        else if (t.crashes > 0 || t.fires > 0) bc += ' trend-bar-severity';
        return `<div class="trend-col"><div class="trend-count">${t.complaints}</div><div class="${bc}" style="height:${h}px;"></div><div class="trend-year ${active ? 'trend-year-active' : ''}">${t.year}</div></div>`;
    }).join('')}</div></div>`;
}

function renderMiniRecall(r) {
    const flags = [];
    if (r.park_it) flags.push('<span class="recall-flag flag-severe">STOP DRIVING</span>');
    if (r.park_outside) flags.push('<span class="recall-flag flag-severe">DO NOT GARAGE</span>');
    if (r.ota_update) flags.push('<span class="recall-flag flag-mild">SOFTWARE FIX</span>');
    return `<div class="recall-card-mini"><div class="recall-campaign">${esc(r.campaign_number)}</div>${flags.length ? `<span class="recall-mini-flags">${flags.join('')}</span>` : ''}<div class="recall-component-mini">${esc(r.component) || 'Unknown'}</div></div>`;
}

// === HELPER: build complaints page URL with optional compare context ===
function complaintsUrl(car, component, compareContext) {
    let url = `/static/complaints.html?make=${car.make}&model=${car.model}&year=${car.year}&component=${component || 'ALL'}&page=1`;
    if (compareContext) {
        url += `&car1=${compareContext.car1}&car2=${compareContext.car2}`;
    }
    return url;
}

function recallsUrl(car, compareContext) {
    let url = `/static/recalls.html?make=${car.make}&model=${car.model}&year=${car.year}`;
    if (compareContext) {
        url += `?car1=${compareContext.car1}&car2=${compareContext.car2}`;
    }
    return url;
}

// === CAR CARD (single view, no compare context) ===
function renderCarCard(car, mode) {
    const cardId = `card-${car.make}-${car.model}-${car.year}`.replace(/\s+/g, "_");
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;
    const total = car.total_complaints || 1;
    const rc = (car.recalls || []).length;

    let issuesHTML = "";
    car.top_issues.forEach((issue, i) => {
        const pct = (issue.count / maxCount) * 100;
        const percent = Math.round((issue.count / total) * 100);
        const sc = esc(issue.component);
        const link = complaintsUrl(car, issue.component, null);
        issuesHTML += `<a href="${link}" class="issue-row clickable" title="View all ${sc} complaints"><div class="issue-name">${sc}</div><div class="issue-bar-track"><div class="issue-bar-fill bar-${i+1}" style="width:${pct}%"></div></div><div class="issue-count">${issue.count} <span class="issue-pct">(${percent}%)</span></div></a>`;
    });

    const samplesHTML = car.sample_complaints.map(s => renderSampleHTML(s, null)).join('');
    const remaining = car.total_complaints - car.sample_complaints.length;
    const cLink = complaintsUrl(car, 'ALL', null);
    const rLink = `/static/recalls.html?make=${car.make}&model=${car.model}&year=${car.year}`;
    const previewRecalls = (car.recalls || []).slice(0, 2);

    return `
        <div class="car-card" id="${cardId}">
            <div class="car-header">
                <div class="car-name">${car.year} ${esc(car.make)} ${esc(car.model)}</div>
                <div class="car-total"><strong>${car.total_complaints}</strong> complaints ${rc > 0 ? `<span class="recall-badge">${rc} recall${rc===1?'':'s'}</span>` : ''}</div>
            </div>
            ${renderVerdict(car.verdict)}
            ${renderWorstYearWarning(car.worst_year, car.year)}
            <div class="severity-row">
                ${car.severity.crashes > 0 ? `<div class="badge badge-crash">${car.severity.crashes} crash${car.severity.crashes===1?'':'es'}</div>` : ""}
                ${car.severity.fires > 0 ? `<div class="badge badge-fire">${car.severity.fires} fire${car.severity.fires===1?'':'s'}</div>` : ""}
                ${car.severity.injuries > 0 ? `<div class="badge badge-injury">${car.severity.injuries} injur${car.severity.injuries===1?'y':'ies'}</div>` : ""}
            </div>
            ${car.top_issues.length > 0 ? `<div class="issues-title">Most common problems. Click any bar to view all complaints for that issue.</div>${issuesHTML}` : ''}
            <div id="trend-chart-container"></div>
            <div class="samples-section">
                <div class="samples-header"><div class="samples-title">Owner complaints</div></div>
                <div class="section-explainer">Reports filed by real car owners to the US government (NHTSA).</div>
                <div class="samples-list">${samplesHTML}</div>
                ${remaining > 0 ? `<a href="${cLink}" class="load-more-btn">Load more (${remaining} remaining)</a>` : ''}
            </div>
            <div class="recalls-section">
                <div class="samples-title">Official recalls${rc > 0 ? ` (${rc})` : ''}</div>
                <div class="section-explainer">A recall means the manufacturer confirmed a safety defect. The fix is free at any dealer.</div>
                ${rc === 0 ? '<div class="no-recalls">No recalls found.</div>' :
                    previewRecalls.map(renderMiniRecall).join('') +
                    `<a href="${rLink}" class="load-more-btn">${rc > 2 ? `Load more (${rc - 2} remaining)` : 'View recall details'}</a>`
                }
            </div>
            <div class="vin-check">Before buying, check the exact VIN at <a href="https://www.nhtsa.gov/recalls" target="_blank">nhtsa.gov/recalls</a></div>
        </div>
    `;
}

// === ALIGNED COMPARISON (passes car1/car2 context to complaint links) ===
function renderAlignedComparison(cars) {
    if (cars.length !== 2) return cars.map(c => renderCarCard(c, "compare")).join('');
    const car1 = cars[0], car2 = cars[1];
    const issues1 = {}, issues2 = {};
    const t1 = car1.total_complaints || 1, t2 = car2.total_complaints || 1;
    (car1.top_issues || []).forEach(i => { issues1[i.component] = i.count; });
    (car2.top_issues || []).forEach(i => { issues2[i.component] = i.count; });
    const allC = [...new Set([...Object.keys(issues1), ...Object.keys(issues2)])];
    allC.sort((a, b) => Math.max(issues1[b]||0, issues2[b]||0) - Math.max(issues1[a]||0, issues2[a]||0));
    const gMax = Math.max(...allC.map(c => Math.max(issues1[c]||0, issues2[c]||0)), 1);

    // Compare context so back links work
    const ctx = {
        car1: `${car1.make}/${car1.model}/${car1.year}`,
        car2: `${car2.make}/${car2.model}/${car2.year}`,
    };

    const rows = allC.map((comp, i) => {
        const c1=issues1[comp]||0, c2=issues2[comp]||0;
        const bc=`bar-${Math.min(i+1,10)}`;
        return `<div class="aligned-row"><div class="aligned-cell aligned-left"><div class="aligned-count ${c1===0?'zero':''}">${c1} <span class="issue-pct">(${c1>0?Math.round((c1/t1)*100):0}%)</span></div><div class="aligned-bar-track"><div class="aligned-bar-fill-left ${bc}" style="width:${(c1/gMax)*100}%"></div></div></div><div class="aligned-component">${esc(comp)}</div><div class="aligned-cell aligned-right"><div class="aligned-bar-track"><div class="aligned-bar-fill-right ${bc}" style="width:${(c2/gMax)*100}%"></div></div><div class="aligned-count ${c2===0?'zero':''}">${c2} <span class="issue-pct">(${c2>0?Math.round((c2/t2)*100):0}%)</span></div></div></div>`;
    }).join('');

    const r1=(car1.recalls||[]).length, r2=(car2.recalls||[]).length;

    const hdr = (car, rc) => `
        <div class="car-name">${car.year} ${esc(car.make)} ${esc(car.model)}</div>
        <div class="car-total"><strong>${car.total_complaints}</strong> complaints ${rc>0?`<span class="recall-badge">${rc} recall${rc===1?'':'s'}</span>`:''}</div>
        ${renderVerdict(car.verdict)}
        ${car.worst_year ? renderWorstYearWarning(car.worst_year, car.year) : ''}
        <div class="severity-row">
            ${car.severity.crashes>0?`<div class="badge badge-crash">${car.severity.crashes} crash${car.severity.crashes===1?'':'es'}</div>`:''}
            ${car.severity.fires>0?`<div class="badge badge-fire">${car.severity.fires} fire${car.severity.fires===1?'':'s'}</div>`:''}
            ${car.severity.injuries>0?`<div class="badge badge-injury">${car.severity.injuries} injur${car.severity.injuries===1?'y':'ies'}</div>`:''}
        </div>`;

    const detail = (car) => {
        const cLink = complaintsUrl(car, 'ALL', ctx);
        const rLink = `/static/recalls.html?make=${car.make}&model=${car.model}&year=${car.year}&car1=${ctx.car1}&car2=${ctx.car2}`;
        const rc = (car.recalls||[]).length;
        const remaining = car.total_complaints - car.sample_complaints.length;
        return `
            <div class="compare-detail-card">
                <div class="samples-title">${esc(car.make)} ${esc(car.model)} complaints</div>
                <div class="samples-list">${car.sample_complaints.map(s => renderSampleHTML(s, null)).join('')}</div>
                ${remaining > 0 ? `<a href="${cLink}" class="load-more-btn">Load more (${remaining} remaining)</a>` : ''}
                <div style="margin-top:20px">
                    <div class="samples-title">${rc} recall${rc===1?'':'s'}</div>
                    ${rc === 0 ? '<div class="no-recalls">No recalls.</div>' : `<a href="${rLink}" class="load-more-btn">View recalls</a>`}
                </div>
            </div>`;
    };

    return `<div class="compare-aligned">
        <div class="compare-headers"><div class="compare-header-left">${hdr(car1,r1)}</div><div class="compare-header-right">${hdr(car2,r2)}</div></div>
        <div class="aligned-section-title">Problem comparison: same issue, side by side</div>
        <div class="section-explainer" style="text-align:center">Each row shows the same component. Bigger bar = more complaints.</div>
        ${rows}
        <div class="compare-details-grid">${detail(car1)}${detail(car2)}</div>
    </div>`;
}

// === STATS ===
async function loadStats() {
    const el = document.getElementById("stats"); if (!el) return;
    const data = await (await fetch("/api/stats")).json();
    let text = `${data.total_complaints.toLocaleString()} complaints across ${data.total_makes} brands and ${data.total_models} models`;
    if (data.total_recalls > 0) text += ` and ${data.total_recalls.toLocaleString()} recalls`;
    el.textContent = text;
}