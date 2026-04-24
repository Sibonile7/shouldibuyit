/*
 * German Car Reliability - Frontend Logic
 *
 * Handles:
 *   - Populating make/model/year dropdowns from the API
 *   - Searching for a single car
 *   - Rendering complaint data as bar charts and cards
 */


// === DROPDOWN POPULATION ===

// Load makes on page load (for the search page)
window.addEventListener("DOMContentLoaded", async () => {
    const makeSel = document.getElementById("make");
    if (!makeSel) return; // Not on search page

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
    container.innerHTML = renderCarCard(data);
    container.scrollIntoView({ behavior: "smooth" });
}


// === RENDER CAR CARD ===

function renderCarCard(car) {
    const maxCount = car.top_issues.length > 0 ? car.top_issues[0].count : 1;

    let issuesHTML = "";
    car.top_issues.forEach((issue, i) => {
        const pct = (issue.count / maxCount) * 100;
        issuesHTML += `
            <div class="issue-row">
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
        <div class="car-card">
            <div class="car-header">
                <div class="car-name">${car.year} ${car.make} ${car.model}</div>
                <div class="car-total"><strong>${car.total_complaints}</strong> complaints</div>
            </div>

            <div class="severity-row">
                ${car.severity.crashes > 0 ? `<div class="badge badge-crash">${car.severity.crashes} crashes</div>` : ""}
                ${car.severity.fires > 0 ? `<div class="badge badge-fire">${car.severity.fires} fires</div>` : ""}
                ${car.severity.injuries > 0 ? `<div class="badge badge-injury">${car.severity.injuries} injuries</div>` : ""}
            </div>

            <div class="issues-title">Top issues by complaint frequency</div>
            ${issuesHTML}

            <div class="samples-title">Recent owner complaints</div>
            ${samplesHTML}
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