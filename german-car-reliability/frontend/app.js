/*
 * German Car Reliability - Frontend Logic
 */

function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    const res = await fetch("/api/makes");
    (await res.json()).forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; makeSel.appendChild(o); });
    loadStats();
});

async function loadModels() {
    const make = document.getElementById("make").value;
    const modelSel = document.getElementById("model"), yearSel = document.getElementById("year"), btn = document.getElementById("search-btn");
    modelSel.innerHTML = '<option value="">Select model</option>'; yearSel.innerHTML = '<option value="">Select year</option>';
    yearSel.disabled = true; btn.disabled = true;
    if (!make) { modelSel.disabled = true; return; }
    (await (await fetch("/api/models/" + make)).json()).forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; modelSel.appendChild(o); });
    modelSel.disabled = false;
}

async function loadYears() {
    const make = document.getElementById("make").value, model = document.getElementById("model").value;
    const yearSel = document.getElementById("year"), btn = document.getElementById("search-btn");
    yearSel.innerHTML = '<option value="">Select year</option>'; btn.disabled = true;
    if (!model) { yearSel.disabled = true; return; }
    (await (await fetch("/api/years/" + make + "/" + model)).json()).forEach(y => { const o = document.createElement("option"); o.value = y; o.textContent = y; yearSel.appendChild(o); });
    yearSel.disabled = false;
    yearSel.onchange = () => { btn.disabled = !yearSel.value; };
}

async function searchCar() {
    const make = document.getElementById("make").value, model = document.getElementById("model").value, year = document.getElementById("year").value;
    const container = document.getElementById("results");
    container.classList.remove("hidden");
    container.innerHTML = '<div class="loading">Searching...</div>';
    const res = await fetch(`/api/car/${make}/${model}/${year}`);
    if (!res.ok) { container.innerHTML = '<div class="loading">No complaints found for this car.</div>'; return; }
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
    return `<div class="sample">${esc(s.summary)}<div class="sample-meta">${tags.join('')}${renderComponentTags(s.component, af)}${s.date_filed ? `<span class="sample-tag">${esc(s.date_filed)}</span>` : ''}</div></div>`;
}

let recallSectionCounter = 0;

function renderSingleRecallCard(r) {
    const flags = [];
    if (r.park_it) flags.push('<span class="recall-flag flag-severe">STOP DRIVING</span>');
    if (r.park_outside) flags.push('<span class="recall-flag flag-severe">DO NOT GARAGE</span>');
    if (r.ota_update) flags.push('<span class="recall-flag flag-mild">SOFTWARE FIX AVAILABLE</span>');
    return `<div class="recall-card"><div class="recall-header"><div class="recall-campaign">Campaign ${esc(r.campaign_number)}</div>${r.report_date ? `<div class="recall-date">${esc(r.report_date)}</div>` : ''}</div>${flags.length ? `<div class="recall-flags">${flags.join('')}</div>` : ''}<div class="recall-component">${esc(r.component) || 'Unknown'}</div><div class="recall-body"><div class="recall-section-label">What's wrong</div><div class="recall-text">${esc(r.summary) || 'No description.'}</div></div>${r.consequence ? `<div class="recall-body"><div class="recall-section-label">Why it's dangerous</div><div class="recall-text">${esc(r.consequence)}</div></div>` : ''}${r.remedy ? `<div class="recall-body"><div class="recall-section-label">How it gets fixed (free)</div><div class="recall-text">${esc(r.remedy)}</div></div>` : ''}</div>`;
}

function renderRecallsHTML(recalls) {
    if (!recalls || recalls.length === 0) {
        return `<div class="recalls-section"><div class="samples-title">Official recalls</div><div class="section-explainer">A recall is when the manufacturer confirmed a safety defect and will fix it for free at any dealer.</div><div class="no-recalls">No recalls found for this car.</div></div>`;
    }
    recallSectionCounter++;
    const sid = `recalls-more-${recallSectionCounter}`;
    const vis = recalls.slice(0, 2), hid = recalls.slice(2);
    return `<div class="recalls-section"><div class="samples-title">${recalls.length} official recall${recalls.length === 1 ? '' : 's'}</div><div class="section-explainer">A recall means the manufacturer confirmed a safety defect. The fix is free at any authorized dealer.</div>${vis.map(renderSingleRecallCard).join('')}${hid.length > 0 ? `<div id="${sid}" style="display:none;">${hid.map(renderSingleRecallCard).join('')}</div><button class="load-more-btn" onclick="toggleRecalls('${sid}', this)">Show ${hid.length} more recall${hid.length === 1 ? '' : 's'}</button>` : ''}</div>`;
}

function toggleRecalls(id, btn) {
    const el = document.getElementById(id);
    if (el.style.display === "none") { el.style.display = "block"; btn.textContent = "Show fewer recalls"; }
    else { el.style.display = "none"; btn.textContent = `Show ${el.querySelectorAll('.recall-card').length} more recalls`; }
}

// === VERDICT BADGE ===
function renderVerdict(verdict) {
    if (!verdict) return '';
    const cls = `verdict-${verdict.verdict}`;
    const reasons = verdict.reasons.map(r => `<span class="verdict-reason">${esc(r)}</span>`).join('');
    return `<div class="verdict-box ${cls}">
        <div class="verdict-label">${esc(verdict.label)}</div>
        <div class="verdict-reasons">${reasons}</div>
    </div>`;
}

// === WORST YEAR WARNING ===
function renderWorstYearWarning(wy, currentYear) {
    if (!wy) return '';
    const isCurrent = wy.year === currentYear;
    return `<div class="worst-year-warning ${isCurrent ? 'worst-year-current' : ''}">
        <div class="worst-year-title">${isCurrent ? 'You are viewing the worst model year' : 'Worst year to avoid: ' + wy.year}</div>
        <div class="worst-year-detail">The ${wy.year} model has ${wy.complaints} complaints, ${wy.ratio}x higher than the average of other years (${wy.avg_other_years}). ${isCurrent ? 'Consider a different model year.' : ''}</div>
    </div>`;
}

// === TREND CHART ===
async function loadTrendChart(make, model, currentYear) {
    const c = document.getElementById("trend-chart-container");
    if (!c) return;
    const res = await fetch(`/api/trend/${make}/${model}`);
    if (!res.ok) { c.innerHTML = ''; return; }
    const trend = await res.json();
    if (trend.length < 2) { c.innerHTML = ''; return; }
    const mx = Math.max(...trend.map(t => t.complaints), 1);
    const bars = trend.map(t => {
        const h = Math.max((t.complaints / mx) * 120, 2);
        const active = t.year === currentYear;
        let bc = 'trend-bar';
        if (active) bc += ' trend-bar-active';
        else if (t.crashes > 0 || t.fires > 0) bc += ' trend-bar-severity';
        return `<div class="trend-col"><div class="trend-count">${t.complaints}</div><div class="${bc}" style="height:${h}px;" title="${t.year}: ${t.complaints} complaints"></div><div class="trend-year ${active ? 'trend-year-active' : ''}">${t.year}</div></div>`;
    }).join('');
    c.innerHTML = `<div class="trend-section"><div class="samples-title">Complaints by model year</div><div class="section-explainer">How this model compares across years. The highlighted bar is the year you searched. Taller bar = more complaints.</div><div class="trend-chart">${bars}</div></div>`;
}

// === CAR CARD ===
function renderCarCard(car, mode) {
    const cardId = `card-${car.make}-${car.model}-${car.year}`.replace(/\s+/g, "_");
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;
    const total = car.total_complaints || 1;

    let issuesHTML = "";
    car.top_issues.forEach((issue, i) => {
        const pct = (issue.count / maxCount) * 100;
        const percent = Math.round((issue.count / total) * 100);
        const sc = esc(issue.component);
        issuesHTML += `<div class="issue-row clickable" data-make="${esc(car.make)}" data-model="${esc(car.model)}" data-year="${car.year}" data-component="${sc}" data-card="${esc(cardId)}" title="Click to see ${sc} complaints"><div class="issue-name">${sc}</div><div class="issue-bar-track"><div class="issue-bar-fill bar-${i+1}" style="width:${pct}%"></div></div><div class="issue-count">${issue.count} <span class="issue-pct">(${percent}%)</span></div></div>`;
    });

    const samplesHTML = car.sample_complaints.map(s => renderSampleHTML(s, null)).join('');
    const rc = (car.recalls || []).length;
    const rem = car.total_complaints - car.sample_complaints.length;

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
            ${car.top_issues.length > 0 ? `<div class="issues-title">Most common problems. Click any bar to see those complaints.</div>${issuesHTML}` : ''}
            <div id="trend-chart-container"></div>
            <div class="samples-section">
                <div class="samples-header"><div class="samples-title">Owner complaints</div></div>
                <div class="section-explainer">These are reports filed by real car owners to the US government (NHTSA).</div>
                <div class="samples-list" id="samples-${cardId}">
                    ${samplesHTML}
                    ${rem > 0 ? `<button class="load-more-btn" onclick="loadAllComplaints('${esc(car.make)}','${esc(car.model)}',${car.year},'${esc(cardId)}')">Load more (${rem} remaining)</button>` : ''}
                </div>
            </div>
            ${renderRecallsHTML(car.recalls)}
            <div class="vin-check">Before buying, check the exact VIN for open recalls at <a href="https://www.nhtsa.gov/recalls" target="_blank">nhtsa.gov/recalls</a></div>
        </div>
    `;
}

// === ALIGNED COMPARISON ===
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

    const rows = allC.map((comp, i) => {
        const c1=issues1[comp]||0, c2=issues2[comp]||0;
        const bc=`bar-${Math.min(i+1,10)}`;
        return `<div class="aligned-row"><div class="aligned-cell aligned-left"><div class="aligned-count ${c1===0?'zero':''}">${c1} <span class="issue-pct">(${c1>0?Math.round((c1/t1)*100):0}%)</span></div><div class="aligned-bar-track"><div class="aligned-bar-fill-left ${bc}" style="width:${(c1/gMax)*100}%"></div></div></div><div class="aligned-component">${esc(comp)}</div><div class="aligned-cell aligned-right"><div class="aligned-bar-track"><div class="aligned-bar-fill-right ${bc}" style="width:${(c2/gMax)*100}%"></div></div><div class="aligned-count ${c2===0?'zero':''}">${c2} <span class="issue-pct">(${c2>0?Math.round((c2/t2)*100):0}%)</span></div></div></div>`;
    }).join('');

    const r1=(car1.recalls||[]).length, r2=(car2.recalls||[]).length;
    const id1=`card-${car1.make}-${car1.model}-${car1.year}`.replace(/\s+/g,"_");
    const id2=`card-${car2.make}-${car2.model}-${car2.year}`.replace(/\s+/g,"_");

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

    const detail = (car, cid) => `
        <div class="compare-detail-card" id="${cid}">
            <div class="samples-title">${esc(car.make)} ${esc(car.model)} complaints</div>
            <div class="section-explainer">Reports filed by owners to the US government.</div>
            <div class="samples-list" id="samples-${cid}">
                ${car.sample_complaints.map(s => renderSampleHTML(s, null)).join('')}
                ${car.total_complaints > car.sample_complaints.length ? `<button class="load-more-btn" onclick="loadAllComplaints('${esc(car.make)}','${esc(car.model)}',${car.year},'${esc(cid)}')">Load more (${car.total_complaints - car.sample_complaints.length} remaining)</button>` : ''}
            </div>
        </div>`;

    return `<div class="compare-aligned">
        <div class="compare-headers"><div class="compare-header-left">${hdr(car1,r1)}</div><div class="compare-header-right">${hdr(car2,r2)}</div></div>
        <div class="aligned-section-title">Problem comparison: same issue, side by side</div>
        <div class="section-explainer" style="text-align:center">Each row shows the same component. Bigger bar = more complaints.</div>
        ${rows}
        <div class="compare-details-grid">${detail(car1,id1)}${detail(car2,id2)}</div>
        <div class="compare-recalls-section">
            <div class="aligned-section-title">Official recalls</div>
            <div class="section-explainer" style="text-align:center">A recall means the manufacturer confirmed a safety defect. The fix is free at any dealer.</div>
            <div class="compare-recalls-grid">
                <div class="compare-recall-col"><div class="compare-recall-header">${esc(car1.make)} ${esc(car1.model)}: ${r1} recall${r1===1?'':'s'}</div>${r1===0?'<div class="no-recalls">No recalls.</div>':car1.recalls.slice(0,2).map(renderSingleRecallCard).join('')+(car1.recalls.length>2?`<div id="cr1" style="display:none">${car1.recalls.slice(2).map(renderSingleRecallCard).join('')}</div><button class="load-more-btn" onclick="toggleRecalls('cr1',this)">Show ${car1.recalls.length-2} more</button>`:'')}</div>
                <div class="compare-recall-col"><div class="compare-recall-header">${esc(car2.make)} ${esc(car2.model)}: ${r2} recall${r2===1?'':'s'}</div>${r2===0?'<div class="no-recalls">No recalls.</div>':car2.recalls.slice(0,2).map(renderSingleRecallCard).join('')+(car2.recalls.length>2?`<div id="cr2" style="display:none">${car2.recalls.slice(2).map(renderSingleRecallCard).join('')}</div><button class="load-more-btn" onclick="toggleRecalls('cr2',this)">Show ${car2.recalls.length-2} more</button>`:'')}</div>
            </div>
        </div>
        <div class="vin-check">Before buying, check the exact VIN for open recalls at <a href="https://www.nhtsa.gov/recalls" target="_blank">nhtsa.gov/recalls</a></div>
    </div>`;
}

// === CLICK HANDLER ===
document.addEventListener("click", function(e) {
    const row = e.target.closest(".issue-row.clickable");
    if (!row) return;
    const { make, model, year, component, card } = row.dataset;
    if (make && model && year && component && card) filterByComponent(make, model, parseInt(year), component, card);
});

// === LOAD / FILTER / PAGINATE ===
const filterState = {};

async function loadAllComplaints(make, model, year, cardId) {
    const list = document.getElementById(`samples-${cardId}`);
    list.innerHTML = '<div class="loading">Loading...</div>';
    const res = await fetch(`/api/car/${make}/${model}/${year}/component/ALL?limit=20&offset=0`);
    if (!res.ok) { list.innerHTML = '<div class="loading">Could not load.</div>'; return; }
    const data = await res.json();
    filterState[cardId] = { make, model, year, component: "ALL", offset: data.complaints.length, total: data.total_matching };
    list.innerHTML = data.complaints.map(c => renderSampleHTML(c, null)).join('');
    if (data.has_more) { const b = document.createElement("button"); b.className = "load-more-btn"; b.textContent = `Load more (${data.total_matching - data.complaints.length} remaining)`; b.onclick = () => loadMoreComplaints(cardId); list.appendChild(b); }
}

async function filterByComponent(make, model, year, component, cardId) {
    const list = document.getElementById(`samples-${cardId}`);
    const header = document.querySelector(`#${cardId} .samples-header`);
    if (!list) return;
    list.innerHTML = '<div class="loading">Loading...</div>';
    const res = await fetch(`/api/car/${make}/${model}/${year}/component/${component}?limit=20&offset=0`);
    if (!res.ok) { list.innerHTML = `<div class="loading">No ${esc(component)} complaints.</div>`; return; }
    const data = await res.json();
    filterState[cardId] = { make, model, year, component, offset: data.complaints.length, total: data.total_matching };
    if (header) header.innerHTML = `<div class="samples-title">${data.total_matching} ${esc(component)} complaint${data.total_matching===1?'':'s'}</div><button class="reset-filter" onclick="resetFilter('${esc(make)}','${esc(model)}',${year},'${esc(cardId)}')">Show all</button>`;
    list.innerHTML = data.complaints.map(c => renderSampleHTML(c, component.toUpperCase())).join('');
    if (data.has_more) { const b = document.createElement("button"); b.className = "load-more-btn"; b.textContent = `Load more (${data.total_matching - data.complaints.length} remaining)`; b.onclick = () => loadMoreComplaints(cardId); list.appendChild(b); }
}

async function loadMoreComplaints(cardId) {
    const state = filterState[cardId]; if (!state) return;
    const list = document.getElementById(`samples-${cardId}`);
    const old = list.querySelector(".load-more-btn"); if (old) old.remove();
    const res = await fetch(`/api/car/${state.make}/${state.model}/${state.year}/component/${state.component}?limit=20&offset=${state.offset}`);
    if (!res.ok) return;
    const data = await res.json();
    list.insertAdjacentHTML("beforeend", data.complaints.map(c => renderSampleHTML(c, state.component === "ALL" ? null : state.component.toUpperCase())).join(''));
    state.offset += data.complaints.length;
    if (data.has_more) { const b = document.createElement("button"); b.className = "load-more-btn"; b.textContent = `Load more (${state.total - state.offset} remaining)`; b.onclick = () => loadMoreComplaints(cardId); list.appendChild(b); }
}

async function resetFilter(make, model, year, cardId) {
    const list = document.getElementById(`samples-${cardId}`);
    const header = document.querySelector(`#${cardId} .samples-header`);
    if (!list) return;
    list.innerHTML = '<div class="loading">Loading...</div>';
    const data = await (await fetch(`/api/car/${make}/${model}/${year}`)).json();
    if (header) header.innerHTML = '<div class="samples-title">Owner complaints</div>';
    list.innerHTML = data.sample_complaints.map(s => renderSampleHTML(s, null)).join('');
    const rem = data.total_complaints - data.sample_complaints.length;
    if (rem > 0) { const b = document.createElement("button"); b.className = "load-more-btn"; b.textContent = `Load more (${rem} remaining)`; b.onclick = () => loadAllComplaints(make, model, year, cardId); list.appendChild(b); }
    delete filterState[cardId];
}

async function loadStats() {
    const el = document.getElementById("stats"); if (!el) return;
    const data = await (await fetch("/api/stats")).json();
    let text = `${data.total_complaints.toLocaleString()} complaints across ${data.total_makes} brands and ${data.total_models} models`;
    if (data.total_recalls > 0) text += ` and ${data.total_recalls.toLocaleString()} recalls`;
    el.textContent = text;
}