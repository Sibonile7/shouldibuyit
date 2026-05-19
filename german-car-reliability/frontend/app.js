/*
 * German Car Reliability - Frontend Logic
 *
 * Features:
 *   - Dropdown population from the API
 *   - Search for a single car, compare two cars
 *   - Bar charts with clickable component filter
 *   - Load more pagination
 *   - Component tag splitting with active filter highlight
 *   - Recall cards with severity flags
 *   - Plain-language explainers so users understand every section
 *   - XSS protection via esc() helper
 */


// === XSS PROTECTION ===
// All text from the database (complaints, recalls, component names) passes
// through this before being injected into innerHTML. Prevents any HTML
// or script tags in NHTSA data from executing in the browser.
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


// === COMPONENT NORMALIZATION (mirror of backend) ===
const COMPONENT_CLEANUP = {
    "ENGINE AND ENGINE COOLING": "ENGINE",
    "SERVICE BRAKES": "BRAKES",
    "SERVICE BRAKES, HYDRAULIC": "BRAKES",
    "FUEL SYSTEM, GASOLINE": "FUEL SYSTEM",
    "FUEL/PROPULSION SYSTEM": "FUEL SYSTEM",
    "EXTERIOR LIGHTING": "LIGHTS",
    "FORWARD COLLISION AVOIDANCE": "SAFETY TECH",
    "ELECTRONIC STABILITY CONTROL (ESC)": "STABILITY CONTROL",
    "VEHICLE SPEED CONTROL": "ACCELERATION",
    "EQUIPMENT ADAPTIVE/MOBILITY": "EQUIPMENT",
    "LATCHES/LOCKS/LINKAGES": "LOCKS",
    "VISIBILITY/WIPER": "VISIBILITY",
    "UNKNOWN OR OTHER": "OTHER",
};

function cleanComponent(raw) {
    const upper = raw.trim().toUpperCase();
    return COMPONENT_CLEANUP[upper] || upper;
}

function splitComponents(rawComponentString) {
    if (!rawComponentString) return [];
    return rawComponentString.split(",").map(p => p.trim()).filter(Boolean);
}


// === DROPDOWN POPULATION ===

window.addEventListener("DOMContentLoaded", async () => {
    const makeSel = document.getElementById("make");
    if (!makeSel) return;

    const res = await fetch("/api/makes");
    const makes = await res.json();
    makes.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        makeSel.appendChild(opt);
    });

    loadStats();
});


async function loadModels() {
    const make = document.getElementById("make").value;
    const modelSel = document.getElementById("model");
    const yearSel = document.getElementById("year");
    const btn = document.getElementById("search-btn");

    modelSel.innerHTML = '<option value="">Select model</option>';
    yearSel.innerHTML = '<option value="">Select year</option>';
    yearSel.disabled = true;
    btn.disabled = true;

    if (!make) {
        modelSel.disabled = true;
        return;
    }

    const res = await fetch("/api/models/" + make);
    const models = await res.json();
    models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        modelSel.appendChild(opt);
    });
    modelSel.disabled = false;
}


async function loadYears() {
    const make = document.getElementById("make").value;
    const model = document.getElementById("model").value;
    const yearSel = document.getElementById("year");
    const btn = document.getElementById("search-btn");

    yearSel.innerHTML = '<option value="">Select year</option>';
    btn.disabled = true;

    if (!model) {
        yearSel.disabled = true;
        return;
    }

    const res = await fetch("/api/years/" + make + "/" + model);
    const years = await res.json();
    years.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    });
    yearSel.disabled = false;
    yearSel.onchange = () => {
        btn.disabled = !yearSel.value;
    };
}


// === SEARCH ===

async function searchCar() {
    const make = document.getElementById("make").value;
    const model = document.getElementById("model").value;
    const year = document.getElementById("year").value;

    const container = document.getElementById("results");
    container.classList.remove("hidden");
    container.innerHTML = '<div class="loading">Searching...</div>';

    const res = await fetch(`/api/car/${make}/${model}/${year}`);

    if (!res.ok) {
        container.innerHTML = '<div class="loading">No complaints found for this car.</div>';
        return;
    }

    const data = await res.json();
    container.innerHTML = renderCarCard(data, "single");
    container.scrollIntoView({ behavior: "smooth" });
}


// === RENDER HELPERS ===

function renderComponentTags(rawComponentString, activeFilter = null) {
    const parts = splitComponents(rawComponentString);
    if (parts.length === 0) return '';

    return parts.map(part => {
        const cleaned = cleanComponent(part);
        const isMatch = activeFilter && cleaned === activeFilter;
        const cls = isMatch ? 'sample-tag sample-tag-match' : 'sample-tag';
        return `<span class="${cls}">${esc(part)}</span>`;
    }).join('');
}

function renderSampleHTML(s, activeFilter = null) {
    const tags = [];
    if (s.crash) tags.push('<span class="sample-crash">CRASH</span>');
    if (s.fire) tags.push('<span class="sample-crash">FIRE</span>');
    if (s.injuries && s.injuries > 0) {
        tags.push(`<span class="sample-crash">${esc(s.injuries)} INJ</span>`);
    }

    const componentPills = renderComponentTags(s.component, activeFilter);
    const dateTag = s.date_filed ? `<span class="sample-tag">${esc(s.date_filed)}</span>` : '';

    return `
        <div class="sample">
            ${esc(s.summary)}
            <div class="sample-meta">
                ${tags.join('')}
                ${componentPills}
                ${dateTag}
            </div>
        </div>
    `;
}

function renderRecallsHTML(recalls) {
    if (!recalls || recalls.length === 0) {
        return `
            <div class="recalls-section">
                <div class="samples-title">Official recalls</div>
                <div class="section-explainer">
                    A recall is when the manufacturer officially confirmed a safety defect and will fix it for free at any dealer.
                </div>
                <div class="no-recalls">No recalls found for this car.</div>
            </div>
        `;
    }

    const recallsList = recalls.map(r => {
        const flags = [];
        if (r.park_it) flags.push('<span class="recall-flag flag-severe" title="Do not drive this car until the recall repair is done.">STOP DRIVING</span>');
        if (r.park_outside) flags.push('<span class="recall-flag flag-severe" title="Do not park this car in a garage. There is a fire risk even when parked.">DO NOT GARAGE</span>');
        if (r.ota_update) flags.push('<span class="recall-flag flag-mild" title="This recall can be fixed with a software update sent to the car wirelessly.">SOFTWARE FIX AVAILABLE</span>');

        return `
            <div class="recall-card">
                <div class="recall-header">
                    <div class="recall-campaign">Campaign ${esc(r.campaign_number)}</div>
                    ${r.report_date ? `<div class="recall-date">${esc(r.report_date)}</div>` : ''}
                </div>
                ${flags.length > 0 ? `<div class="recall-flags">${flags.join('')}</div>` : ''}
                <div class="recall-component">${esc(r.component) || 'Unknown component'}</div>
                <div class="recall-body">
                    <div class="recall-section-label">What's wrong</div>
                    <div class="recall-text">${esc(r.summary) || 'No description available.'}</div>
                </div>
                ${r.consequence ? `
                    <div class="recall-body">
                        <div class="recall-section-label">Why it's dangerous</div>
                        <div class="recall-text">${esc(r.consequence)}</div>
                    </div>
                ` : ''}
                ${r.remedy ? `
                    <div class="recall-body">
                        <div class="recall-section-label">How it gets fixed (free)</div>
                        <div class="recall-text">${esc(r.remedy)}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="recalls-section">
            <div class="samples-title">${recalls.length} official recall${recalls.length === 1 ? '' : 's'}</div>
            <div class="section-explainer">
                A recall means the manufacturer confirmed a safety defect in this car. The fix is free at any authorized dealer.
                If you're buying this car used, ask the seller if these recalls have been completed.
            </div>
            ${recallsList}
        </div>
    `;
}

function renderCarCard(car, mode) {
    const cardId = `card-${car.make}-${car.model}-${car.year}`.replace(/\s+/g, "_");
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;

    let issuesHTML = "";
    if (car.top_issues.length > 0) {
        car.top_issues.forEach((issue, i) => {
            const pct = (issue.count / maxCount) * 100;
            const safeComponent = esc(issue.component);
            issuesHTML += `
                <div class="issue-row clickable"
                     data-make="${esc(car.make)}" data-model="${esc(car.model)}"
                     data-year="${car.year}" data-component="${safeComponent}"
                     data-card="${esc(cardId)}"
                     title="Click to see only ${safeComponent} complaints">
                    <div class="issue-name">${safeComponent}</div>
                    <div class="issue-bar-track">
                        <div class="issue-bar-fill bar-${i + 1}" style="width: ${pct}%"></div>
                    </div>
                    <div class="issue-count">${issue.count}</div>
                </div>
            `;
        });
    }

    const samplesHTML = car.sample_complaints
        .map(s => renderSampleHTML(s, null))
        .join('');

    const recallsCount = (car.recalls || []).length;

    return `
        <div class="car-card" id="${cardId}">
            <div class="car-header">
                <div class="car-name">${car.year} ${esc(car.make)} ${esc(car.model)}</div>
                <div class="car-total">
                    <strong>${car.total_complaints}</strong> complaints
                    ${recallsCount > 0 ? `<span class="recall-badge">${recallsCount} recall${recallsCount === 1 ? '' : 's'}</span>` : ''}
                </div>
            </div>

            <div class="severity-row">
                ${car.severity.crashes > 0 ? `<div class="badge badge-crash" title="Number of complaints where the owner reported a crash.">${car.severity.crashes} crash${car.severity.crashes === 1 ? '' : 'es'}</div>` : ""}
                ${car.severity.fires > 0 ? `<div class="badge badge-fire" title="Number of complaints where the owner reported a fire.">${car.severity.fires} fire${car.severity.fires === 1 ? '' : 's'}</div>` : ""}
                ${car.severity.injuries > 0 ? `<div class="badge badge-injury" title="Number of injuries reported across all complaints for this car.">${car.severity.injuries} injur${car.severity.injuries === 1 ? 'y' : 'ies'}</div>` : ""}
            </div>

            ${car.top_issues.length > 0 ? `
                <div class="issues-title">Most common problems. Click any bar to see those complaints.</div>
                ${issuesHTML}
            ` : ''}

            ${renderRecallsHTML(car.recalls)}

            <div class="samples-section">
                <div class="samples-header">
                    <div class="samples-title">Owner complaints</div>
                </div>
                <div class="section-explainer">
                    These are reports filed by real car owners to the US government (NHTSA) describing problems they experienced.
                </div>
                <div class="samples-list" id="samples-${cardId}">
                    ${samplesHTML}
                </div>
            </div>
        </div>
    `;
}


// === CLICK HANDLER FOR BARS (uses data-* attributes, not inline onclick) ===

document.addEventListener("click", function(e) {
    const row = e.target.closest(".issue-row.clickable");
    if (!row) return;
    const { make, model, year, component, card } = row.dataset;
    if (make && model && year && component && card) {
        filterByComponent(make, model, parseInt(year), component, card);
    }
});


// === FILTER BY COMPONENT ===

const filterState = {};

async function filterByComponent(make, model, year, component, cardId) {
    const samplesList = document.getElementById(`samples-${cardId}`);
    const headerEl = document.querySelector(`#${cardId} .samples-header`);

    samplesList.innerHTML = '<div class="loading">Loading...</div>';

    const url = `/api/car/${make}/${model}/${year}/component/${component}?limit=20&offset=0`;
    const res = await fetch(url);

    if (!res.ok) {
        samplesList.innerHTML = `<div class="loading">No ${esc(component)} complaints found.</div>`;
        return;
    }

    const data = await res.json();

    filterState[cardId] = {
        make, model, year, component,
        offset: data.complaints.length,
        total: data.total_matching,
    };

    headerEl.innerHTML = `
        <div class="samples-title">
            ${data.total_matching} ${esc(component)} complaint${data.total_matching === 1 ? '' : 's'}
        </div>
        <button class="reset-filter" onclick="resetFilter('${esc(make)}', '${esc(model)}', ${year}, '${esc(cardId)}')">
            Show all
        </button>
    `;

    samplesList.innerHTML = data.complaints
        .map(c => renderSampleHTML(c, component.toUpperCase()))
        .join('');

    if (data.has_more) {
        const loadMore = document.createElement("button");
        loadMore.className = "load-more-btn";
        loadMore.textContent = `Load more (${data.total_matching - data.complaints.length} remaining)`;
        loadMore.onclick = () => loadMoreComplaints(cardId);
        samplesList.appendChild(loadMore);
    }
}

async function loadMoreComplaints(cardId) {
    const state = filterState[cardId];
    if (!state) return;

    const samplesList = document.getElementById(`samples-${cardId}`);
    const oldButton = samplesList.querySelector(".load-more-btn");
    if (oldButton) oldButton.remove();

    const url = `/api/car/${state.make}/${state.model}/${state.year}/component/${state.component}?limit=20&offset=${state.offset}`;
    const res = await fetch(url);
    const data = await res.json();

    const newHTML = data.complaints
        .map(c => renderSampleHTML(c, state.component.toUpperCase()))
        .join('');
    samplesList.insertAdjacentHTML("beforeend", newHTML);

    state.offset += data.complaints.length;

    if (data.has_more) {
        const loadMore = document.createElement("button");
        loadMore.className = "load-more-btn";
        loadMore.textContent = `Load more (${state.total - state.offset} remaining)`;
        loadMore.onclick = () => loadMoreComplaints(cardId);
        samplesList.appendChild(loadMore);
    }
}

async function resetFilter(make, model, year, cardId) {
    const samplesList = document.getElementById(`samples-${cardId}`);
    const headerEl = document.querySelector(`#${cardId} .samples-header`);

    samplesList.innerHTML = '<div class="loading">Loading...</div>';

    const res = await fetch(`/api/car/${make}/${model}/${year}`);
    const data = await res.json();

    headerEl.innerHTML = '<div class="samples-title">Owner complaints</div>';

    samplesList.innerHTML = data.sample_complaints
        .map(s => renderSampleHTML(s, null))
        .join('');

    delete filterState[cardId];
}


// === STATS ===

async function loadStats() {
    const el = document.getElementById("stats");
    if (!el) return;

    const res = await fetch("/api/stats");
    const data = await res.json();
    let text = `${data.total_complaints.toLocaleString()} complaints across ${data.total_makes} brands and ${data.total_models} models`;
    if (data.total_recalls && data.total_recalls > 0) {
        text += ` and ${data.total_recalls.toLocaleString()} recalls`;
    }
    el.textContent = text;
}