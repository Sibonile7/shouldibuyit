/*
 * German Car Reliability - Frontend Logic
 *
 * Features:
 *   - Bar charts with percentages: "ENGINE: 56 (37%)"
 *   - Only 3 complaints shown by default, with "load more"
 *   - Recalls and complaints in clearly separated sections
 *   - Aligned comparison: same components on the same row
 *   - XSS protection, component pill highlighting
 */


// === XSS PROTECTION ===
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


// === COMPONENT NORMALIZATION ===
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

    if (!make) { modelSel.disabled = true; return; }

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

    if (!model) { yearSel.disabled = true; return; }

    const res = await fetch("/api/years/" + make + "/" + model);
    const years = await res.json();
    years.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    });
    yearSel.disabled = false;
    yearSel.onchange = () => { btn.disabled = !yearSel.value; };
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

function renderRecallsHTML(recalls, containerId) {
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

    const renderOneRecall = (r) => {
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
    };

    // Show first 3, hide the rest behind a button
    const visible = recalls.slice(0, 3).map(renderOneRecall).join('');
    const hidden = recalls.slice(3);
    const recallsId = containerId ? `recalls-${containerId}` : `recalls-${Math.random().toString(36).slice(2, 8)}`;

    let loadMoreHTML = '';
    if (hidden.length > 0) {
        // Store hidden recalls as a data attribute so we can render on click
        const hiddenHTML = hidden.map(renderOneRecall).join('');
        loadMoreHTML = `
            <div id="hidden-${recallsId}" style="display:none;">${hiddenHTML}</div>
            <button class="load-more-btn" onclick="showMoreRecalls('${recallsId}')">
                Load more (${hidden.length} remaining recall${hidden.length === 1 ? '' : 's'})
            </button>
        `;
    }

    return `
        <div class="recalls-section" id="${recallsId}">
            <div class="samples-title">${recalls.length} official recall${recalls.length === 1 ? '' : 's'}</div>
            <div class="section-explainer">
                A recall means the manufacturer confirmed a safety defect in this car. The fix is free at any authorized dealer.
                If you're buying this car used, ask the seller if these recalls have been completed.
            </div>
            ${visible}
            ${loadMoreHTML}
        </div>
    `;
}


// === RENDER CAR CARD (single view) ===

function renderCarCard(car, mode) {
    const cardId = `card-${car.make}-${car.model}-${car.year}`.replace(/\s+/g, "_");
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;
    const totalComplaints = car.total_complaints || 1;

    let issuesHTML = "";
    if (car.top_issues.length > 0) {
        car.top_issues.forEach((issue, i) => {
            const pct = (issue.count / maxCount) * 100;
            const percent = Math.round((issue.count / totalComplaints) * 100);
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
                    <div class="issue-count">${issue.count} <span class="issue-pct">(${percent}%)</span></div>
                </div>
            `;
        });
    }

    const samplesHTML = car.sample_complaints
        .map(s => renderSampleHTML(s, null))
        .join('');

    const recallsCount = (car.recalls || []).length;
    const remainingComplaints = car.total_complaints - car.sample_complaints.length;

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

            <div class="samples-section">
                <div class="samples-header">
                    <div class="samples-title">Owner complaints</div>
                </div>
                <div class="section-explainer">
                    These are reports filed by real car owners to the US government (NHTSA) describing problems they experienced.
                </div>
                <div class="samples-list" id="samples-${cardId}">
                    ${samplesHTML}
                    ${remainingComplaints > 0 ? `
                        <button class="load-more-btn" onclick="loadAllComplaints('${esc(car.make)}', '${esc(car.model)}', ${car.year}, '${esc(cardId)}')">
                            Load more (${remainingComplaints} remaining)
                        </button>
                    ` : ''}
                </div>
            </div>

            ${renderRecallsHTML(car.recalls, cardId)}
        </div>
    `;
}


// === ALIGNED COMPARISON RENDERING ===

function renderAlignedComparison(cars) {
    /*
     * Takes two car objects and renders them with components aligned on the same row.
     * If BMW has ENGINE at 56 and Mercedes has ENGINE at 12, they appear side by side.
     * Components that only appear in one car show 0 for the other.
     */
    if (cars.length !== 2) {
        // Fallback: render as separate cards
        return cars.map(c => renderCarCard(c, "compare")).join('');
    }

    const car1 = cars[0];
    const car2 = cars[1];

    // Build lookup of component -> count for each car
    const issues1 = {};
    const issues2 = {};
    const total1 = car1.total_complaints || 1;
    const total2 = car2.total_complaints || 1;

    (car1.top_issues || []).forEach(i => { issues1[i.component] = i.count; });
    (car2.top_issues || []).forEach(i => { issues2[i.component] = i.count; });

    // Get all unique components, sorted by max count across both cars
    const allComponents = [...new Set([...Object.keys(issues1), ...Object.keys(issues2)])];
    allComponents.sort((a, b) => {
        const maxA = Math.max(issues1[a] || 0, issues2[a] || 0);
        const maxB = Math.max(issues1[b] || 0, issues2[b] || 0);
        return maxB - maxA;
    });

    // Find max count for bar width scaling
    const globalMax = Math.max(
        ...allComponents.map(c => Math.max(issues1[c] || 0, issues2[c] || 0)),
        1
    );

    // Build aligned rows
    const alignedRows = allComponents.map((comp, i) => {
        const count1 = issues1[comp] || 0;
        const count2 = issues2[comp] || 0;
        const pct1 = (count1 / globalMax) * 100;
        const pct2 = (count2 / globalMax) * 100;
        const percent1 = Math.round((count1 / total1) * 100);
        const percent2 = Math.round((count2 / total2) * 100);
        const barClass = `bar-${Math.min(i + 1, 10)}`;

        return `
            <div class="aligned-row">
                <div class="aligned-cell aligned-left">
                    <div class="aligned-count ${count1 === 0 ? 'zero' : ''}">${count1} <span class="issue-pct">(${count1 > 0 ? percent1 : 0}%)</span></div>
                    <div class="aligned-bar-track">
                        <div class="aligned-bar-fill-left ${barClass}" style="width: ${pct1}%"></div>
                    </div>
                </div>
                <div class="aligned-component">${esc(comp)}</div>
                <div class="aligned-cell aligned-right">
                    <div class="aligned-bar-track">
                        <div class="aligned-bar-fill-right ${barClass}" style="width: ${pct2}%"></div>
                    </div>
                    <div class="aligned-count ${count2 === 0 ? 'zero' : ''}">${count2} <span class="issue-pct">(${count2 > 0 ? percent2 : 0}%)</span></div>
                </div>
            </div>
        `;
    }).join('');

    // Build header for each car
    const recalls1 = (car1.recalls || []).length;
    const recalls2 = (car2.recalls || []).length;

    const cardId1 = `card-${car1.make}-${car1.model}-${car1.year}`.replace(/\s+/g, "_");
    const cardId2 = `card-${car2.make}-${car2.model}-${car2.year}`.replace(/\s+/g, "_");

    return `
        <div class="compare-aligned">
            <div class="compare-headers">
                <div class="compare-header-left">
                    <div class="car-name">${car1.year} ${esc(car1.make)} ${esc(car1.model)}</div>
                    <div class="car-total">
                        <strong>${car1.total_complaints}</strong> complaints
                        ${recalls1 > 0 ? `<span class="recall-badge">${recalls1} recall${recalls1 === 1 ? '' : 's'}</span>` : ''}
                    </div>
                    <div class="severity-row">
                        ${car1.severity.crashes > 0 ? `<div class="badge badge-crash">${car1.severity.crashes} crash${car1.severity.crashes === 1 ? '' : 'es'}</div>` : ""}
                        ${car1.severity.fires > 0 ? `<div class="badge badge-fire">${car1.severity.fires} fire${car1.severity.fires === 1 ? '' : 's'}</div>` : ""}
                        ${car1.severity.injuries > 0 ? `<div class="badge badge-injury">${car1.severity.injuries} injur${car1.severity.injuries === 1 ? 'y' : 'ies'}</div>` : ""}
                    </div>
                </div>
                <div class="compare-header-right">
                    <div class="car-name">${car2.year} ${esc(car2.make)} ${esc(car2.model)}</div>
                    <div class="car-total">
                        <strong>${car2.total_complaints}</strong> complaints
                        ${recalls2 > 0 ? `<span class="recall-badge">${recalls2} recall${recalls2 === 1 ? '' : 's'}</span>` : ''}
                    </div>
                    <div class="severity-row">
                        ${car2.severity.crashes > 0 ? `<div class="badge badge-crash">${car2.severity.crashes} crash${car2.severity.crashes === 1 ? '' : 'es'}</div>` : ""}
                        ${car2.severity.fires > 0 ? `<div class="badge badge-fire">${car2.severity.fires} fire${car2.severity.fires === 1 ? '' : 's'}</div>` : ""}
                        ${car2.severity.injuries > 0 ? `<div class="badge badge-injury">${car2.severity.injuries} injur${car2.severity.injuries === 1 ? 'y' : 'ies'}</div>` : ""}
                    </div>
                </div>
            </div>

            <div class="aligned-section-title">Problem comparison: same issue, side by side</div>
            <div class="section-explainer" style="text-align:center;">
                Each row shows the same component for both cars. Bigger bar = more complaints. Percentage shows how much of that car's total complaints are for this component.
            </div>

            ${alignedRows}

            <div class="compare-details-grid">
                <div class="compare-detail-card" id="${cardId1}">
                    <div class="samples-title">${esc(car1.make)} ${esc(car1.model)} owner complaints</div>
                    <div class="section-explainer">Reports filed by real car owners to the US government.</div>
                    <div class="samples-list" id="samples-${cardId1}">
                        ${car1.sample_complaints.map(s => renderSampleHTML(s, null)).join('')}
                        ${car1.total_complaints > car1.sample_complaints.length ? `
                            <button class="load-more-btn" onclick="loadAllComplaints('${esc(car1.make)}', '${esc(car1.model)}', ${car1.year}, '${esc(cardId1)}')">
                                Load more (${car1.total_complaints - car1.sample_complaints.length} remaining)
                            </button>
                        ` : ''}
                    </div>
                    ${renderRecallsHTML(car1.recalls, cardId1)}
                </div>
                <div class="compare-detail-card" id="${cardId2}">
                    <div class="samples-title">${esc(car2.make)} ${esc(car2.model)} owner complaints</div>
                    <div class="section-explainer">Reports filed by real car owners to the US government.</div>
                    <div class="samples-list" id="samples-${cardId2}">
                        ${car2.sample_complaints.map(s => renderSampleHTML(s, null)).join('')}
                        ${car2.total_complaints > car2.sample_complaints.length ? `
                            <button class="load-more-btn" onclick="loadAllComplaints('${esc(car2.make)}', '${esc(car2.model)}', ${car2.year}, '${esc(cardId2)}')">
                                Load more (${car2.total_complaints - car2.sample_complaints.length} remaining)
                            </button>
                        ` : ''}
                    </div>
                    ${renderRecallsHTML(car2.recalls, cardId2)}
                </div>
            </div>
        </div>
    `;
}


// === CLICK HANDLER FOR BARS ===

document.addEventListener("click", function(e) {
    const row = e.target.closest(".issue-row.clickable");
    if (!row) return;
    const { make, model, year, component, card } = row.dataset;
    if (make && model && year && component && card) {
        filterByComponent(make, model, parseInt(year), component, card);
    }
});


// === SHOW MORE RECALLS ===

function showMoreRecalls(recallsId) {
    const section = document.getElementById(recallsId);
    if (!section) return;
    const hidden = document.getElementById(`hidden-${recallsId}`);
    const btn = section.querySelector(".load-more-btn");
    if (hidden) {
        hidden.style.display = "block";
    }
    if (btn) btn.remove();
}


// === LOAD ALL COMPLAINTS (from the 3-default view) ===

async function loadAllComplaints(make, model, year, cardId) {
    const samplesList = document.getElementById(`samples-${cardId}`);
    samplesList.innerHTML = '<div class="loading">Loading...</div>';

    // Fetch all complaints (no component filter, just paginated)
    const url = `/api/car/${make}/${model}/${year}`;
    const res = await fetch(url);
    const data = await res.json();

    // Show first 20 of all complaints
    const allSamples = data.sample_complaints || [];

    // Actually we need the component endpoint without a filter
    // Fetch first 20 using the full car endpoint won't give us all
    // Let's use a generic component fetch
    const compUrl = `/api/car/${make}/${model}/${year}/component/ALL?limit=20&offset=0`;
    const compRes = await fetch(compUrl);

    if (!compRes.ok) {
        // Fallback: show what we have from the summary
        samplesList.innerHTML = allSamples.map(s => renderSampleHTML(s, null)).join('');
        return;
    }

    const compData = await compRes.json();

    filterState[cardId] = {
        make, model, year,
        component: "ALL",
        offset: compData.complaints.length,
        total: compData.total_matching,
    };

    samplesList.innerHTML = compData.complaints
        .map(c => renderSampleHTML(c, null))
        .join('');

    if (compData.has_more) {
        const loadMore = document.createElement("button");
        loadMore.className = "load-more-btn";
        loadMore.textContent = `Load more (${compData.total_matching - compData.complaints.length} remaining)`;
        loadMore.onclick = () => loadMoreComplaints(cardId);
        samplesList.appendChild(loadMore);
    }
}


// === FILTER BY COMPONENT ===

const filterState = {};

async function filterByComponent(make, model, year, component, cardId) {
    const samplesList = document.getElementById(`samples-${cardId}`);
    const headerEl = document.querySelector(`#${cardId} .samples-header`);
    if (!samplesList) return;

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

    if (headerEl) {
        headerEl.innerHTML = `
            <div class="samples-title">
                ${data.total_matching} ${esc(component)} complaint${data.total_matching === 1 ? '' : 's'}
            </div>
            <button class="reset-filter" onclick="resetFilter('${esc(make)}', '${esc(model)}', ${year}, '${esc(cardId)}')">
                Show all
            </button>
        `;
    }

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

    if (!res.ok) return;

    const data = await res.json();
    const newHTML = data.complaints
        .map(c => renderSampleHTML(c, state.component === "ALL" ? null : state.component.toUpperCase()))
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
    if (!samplesList) return;

    samplesList.innerHTML = '<div class="loading">Loading...</div>';

    const res = await fetch(`/api/car/${make}/${model}/${year}`);
    const data = await res.json();

    if (headerEl) {
        headerEl.innerHTML = '<div class="samples-title">Owner complaints</div>';
    }

    samplesList.innerHTML = data.sample_complaints
        .map(s => renderSampleHTML(s, null))
        .join('');

    const remaining = data.total_complaints - data.sample_complaints.length;
    if (remaining > 0) {
        const loadMore = document.createElement("button");
        loadMore.className = "load-more-btn";
        loadMore.textContent = `Load more (${remaining} remaining)`;
        loadMore.onclick = () => loadAllComplaints(make, model, year, cardId);
        samplesList.appendChild(loadMore);
    }

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