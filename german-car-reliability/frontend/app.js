/*
 * German Car Reliability - Frontend Logic
 *
 * Handles:
 *   - Populating make/model/year dropdowns from the API
 *   - Searching for a single car
 *   - Rendering complaint data as bar charts and cards
 *   - Clicking a bar filters the complaints list to that component
 *   - Load more button paginates through filtered complaints
 *   - Component tags are split into individual pills with active filter highlighted
 *   - NEW: Shows official recalls for each car with severity flags
 */


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


// === RENDER CAR CARD ===

function renderComponentTags(rawComponentString, activeFilter = null) {
    const parts = splitComponents(rawComponentString);
    if (parts.length === 0) return '';

    return parts.map(part => {
        const cleaned = cleanComponent(part);
        const isMatch = activeFilter && cleaned === activeFilter;
        const cls = isMatch ? 'sample-tag sample-tag-match' : 'sample-tag';
        return `<span class="${cls}">${part}</span>`;
    }).join('');
}

function renderSampleHTML(s, activeFilter = null) {
    const tags = [];
    if (s.crash) tags.push('<span class="sample-crash">CRASH</span>');
    if (s.fire) tags.push('<span class="sample-crash">FIRE</span>');
    if (s.injuries && s.injuries > 0) {
        tags.push(`<span class="sample-crash">${s.injuries} INJ</span>`);
    }

    const componentPills = renderComponentTags(s.component, activeFilter);
    const dateTag = s.date_filed ? `<span class="sample-tag">${s.date_filed}</span>` : '';

    return `
        <div class="sample">
            ${s.summary}
            <div class="sample-meta">
                ${tags.join('')}
                ${componentPills}
                ${dateTag}
            </div>
        </div>
    `;
}

function renderRecallsHTML(recalls) {
    /*
     * Renders the recalls section.
     * Recalls are official manufacturer/government safety notices,
     * not individual complaints. Each shows component, summary,
     * consequence, and remedy.
     */
    if (!recalls || recalls.length === 0) {
        return `
            <div class="recalls-section">
                <div class="samples-title">Official recalls</div>
                <div class="no-recalls">No active recalls for this car.</div>
            </div>
        `;
    }

    const recallsList = recalls.map(r => {
        const flags = [];
        if (r.park_it) flags.push('<span class="recall-flag flag-severe">PARK IT</span>');
        if (r.park_outside) flags.push('<span class="recall-flag flag-severe">PARK OUTSIDE</span>');
        if (r.ota_update) flags.push('<span class="recall-flag flag-mild">OTA UPDATE</span>');

        return `
            <div class="recall-card">
                <div class="recall-header">
                    <div class="recall-campaign">Campaign ${r.campaign_number}</div>
                    ${r.report_date ? `<div class="recall-date">${r.report_date}</div>` : ''}
                </div>
                ${flags.length > 0 ? `<div class="recall-flags">${flags.join('')}</div>` : ''}
                <div class="recall-component">${r.component || 'Unknown component'}</div>
                <div class="recall-body">
                    <div class="recall-section-label">What's wrong</div>
                    <div class="recall-text">${r.summary || 'No summary available.'}</div>
                </div>
                ${r.consequence ? `
                    <div class="recall-body">
                        <div class="recall-section-label">Risk</div>
                        <div class="recall-text">${r.consequence}</div>
                    </div>
                ` : ''}
                ${r.remedy ? `
                    <div class="recall-body">
                        <div class="recall-section-label">Fix</div>
                        <div class="recall-text">${r.remedy}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="recalls-section">
            <div class="samples-title">${recalls.length} official recall${recalls.length === 1 ? '' : 's'}</div>
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
            issuesHTML += `
                <div class="issue-row clickable"
                     onclick="filterByComponent('${car.make}', '${car.model}', ${car.year}, '${issue.component}', '${cardId}')"
                     title="Click to see only ${issue.component} complaints">
                    <div class="issue-name">${issue.component}</div>
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
                <div class="car-name">${car.year} ${car.make} ${car.model}</div>
                <div class="car-total">
                    <strong>${car.total_complaints}</strong> complaints
                    ${recallsCount > 0 ? `<span class="recall-badge">${recallsCount} recall${recallsCount === 1 ? '' : 's'}</span>` : ''}
                </div>
            </div>

            <div class="severity-row">
                ${car.severity.crashes > 0 ? `<div class="badge badge-crash">${car.severity.crashes} crashes</div>` : ""}
                ${car.severity.fires > 0 ? `<div class="badge badge-fire">${car.severity.fires} fires</div>` : ""}
                ${car.severity.injuries > 0 ? `<div class="badge badge-injury">${car.severity.injuries} injuries</div>` : ""}
            </div>

            ${car.top_issues.length > 0 ? `
                <div class="issues-title">Top issues by complaint frequency. Click any bar to filter complaints below.</div>
                ${issuesHTML}
            ` : ''}

            ${renderRecallsHTML(car.recalls)}

            <div class="samples-section">
                <div class="samples-header">
                    <div class="samples-title">Recent owner complaints</div>
                </div>
                <div class="samples-list" id="samples-${cardId}">
                    ${samplesHTML}
                </div>
            </div>
        </div>
    `;
}


// === FILTER BY COMPONENT ===

const filterState = {};

async function filterByComponent(make, model, year, component, cardId) {
    const samplesList = document.getElementById(`samples-${cardId}`);
    const headerEl = document.querySelector(`#${cardId} .samples-header`);

    samplesList.innerHTML = '<div class="loading">Loading...</div>';

    const url = `/api/car/${make}/${model}/${year}/component/${component}?limit=20&offset=0`;
    const res = await fetch(url);

    if (!res.ok) {
        samplesList.innerHTML = `<div class="loading">No ${component} complaints found.</div>`;
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
            ${data.total_matching} ${component} complaint${data.total_matching === 1 ? '' : 's'}
        </div>
        <button class="reset-filter" onclick="resetFilter('${make}', '${model}', ${year}, '${cardId}')">
            Show recent
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

    headerEl.innerHTML = '<div class="samples-title">Recent owner complaints</div>';

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