/*
 * German Car Reliability - Frontend Logic
 *
 * Handles:
 *   - Populating make/model/year dropdowns from the API
 *   - Searching for a single car
 *   - Rendering complaint data as bar charts and cards
 *   - Clicking a bar filters the complaints list to that component
 *   - Load more button paginates through filtered complaints
 */


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

function renderCarCard(car, mode) {
    // mode: "single" (full width) or "compare" (side-by-side)
    const cardId = `card-${car.make}-${car.model}-${car.year}`.replace(/\s+/g, "_");
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;

    let issuesHTML = "";
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

    let samplesHTML = "";
    car.sample_complaints.forEach(s => {
        const tags = [];
        if (s.crash) tags.push('<span class="sample-crash">CRASH</span>');
        if (s.fire) tags.push('<span class="sample-crash">FIRE</span>');
        tags.push(`<span class="sample-tag">${s.component}</span>`);

        samplesHTML += `
            <div class="sample">
                ${s.summary}
                <div class="sample-meta">
                    ${tags.join("")}
                </div>
            </div>
        `;
    });

    return `
        <div class="car-card" id="${cardId}">
            <div class="car-header">
                <div class="car-name">${car.year} ${car.make} ${car.model}</div>
                <div class="car-total"><strong>${car.total_complaints}</strong> complaints</div>
            </div>

            <div class="severity-row">
                ${car.severity.crashes > 0 ? `<div class="badge badge-crash">${car.severity.crashes} crashes</div>` : ""}
                ${car.severity.fires > 0 ? `<div class="badge badge-fire">${car.severity.fires} fires</div>` : ""}
                ${car.severity.injuries > 0 ? `<div class="badge badge-injury">${car.severity.injuries} injuries</div>` : ""}
            </div>

            <div class="issues-title">Top issues by complaint frequency. Click any bar to filter complaints below.</div>
            ${issuesHTML}

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

// Track current filter state per card to support pagination
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

    // Save state for "load more" button
    filterState[cardId] = {
        make, model, year, component,
        offset: data.complaints.length,
        total: data.total_matching,
    };

    // Update header to show what's filtered
    headerEl.innerHTML = `
        <div class="samples-title">
            ${data.total_matching} ${component} complaint${data.total_matching === 1 ? '' : 's'}
        </div>
        <button class="reset-filter" onclick="resetFilter('${make}', '${model}', ${year}, '${cardId}')">
            Show recent
        </button>
    `;

    samplesList.innerHTML = data.complaints.map(renderComplaintCard).join("");

    // Add "load more" button if there are more
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

    // Append new complaints
    const newHTML = data.complaints.map(renderComplaintCard).join("");
    samplesList.insertAdjacentHTML("beforeend", newHTML);

    // Update state
    state.offset += data.complaints.length;

    // Add load more button again if still more remaining
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

    samplesList.innerHTML = data.sample_complaints.map(s => {
        const tags = [];
        if (s.crash) tags.push('<span class="sample-crash">CRASH</span>');
        if (s.fire) tags.push('<span class="sample-crash">FIRE</span>');
        tags.push(`<span class="sample-tag">${s.component}</span>`);
        return `
            <div class="sample">
                ${s.summary}
                <div class="sample-meta">${tags.join("")}</div>
            </div>
        `;
    }).join("");

    delete filterState[cardId];
}

function renderComplaintCard(c) {
    const tags = [];
    if (c.crash) tags.push('<span class="sample-crash">CRASH</span>');
    if (c.fire) tags.push('<span class="sample-crash">FIRE</span>');
    if (c.injuries > 0) tags.push(`<span class="sample-crash">${c.injuries} INJ</span>`);
    tags.push(`<span class="sample-tag">${c.component}</span>`);
    if (c.date_filed) tags.push(`<span class="sample-tag">${c.date_filed}</span>`);

    return `
        <div class="sample">
            ${c.summary}
            <div class="sample-meta">${tags.join("")}</div>
        </div>
    `;
}


// === STATS ===

async function loadStats() {
    const el = document.getElementById("stats");
    if (!el) return;

    const res = await fetch("/api/stats");
    const data = await res.json();
    el.textContent = `${data.total_complaints.toLocaleString()} complaints across ${data.total_makes} brands and ${data.total_models} models`;
}