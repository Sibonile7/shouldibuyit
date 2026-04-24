# shouldibuyit

Reliability intelligence for German cars. A Python pipeline that aggregates government safety complaint data, classifies failure patterns by component and severity, and serves the results through a FastAPI dashboard.

## The problem

Every day, thousands of people ask Reddit the same question: should I buy this car?

They get back opinions from strangers with sample sizes of one. "BMWs are money pits." "Mercedes electrical systems are garbage." "Get a Toyota instead." No complaint counts. No failure timelines. No severity data. No sources. Just vibes.

Meanwhile, the U.S. government maintains a public database of owner-reported vehicle complaints going back to 1949, updated daily, with structured fields for component category, crash and fire flags, injury counts, and free-text summaries describing exactly what went wrong. This data is free, requires no API key, and covers every car sold in the United States, including Mercedes-Benz, BMW, Audi, Volkswagen, and Porsche.

shouldibuyit bridges that gap. Instead of scrolling through Reddit threads for hours, a buyer types in a make, model, and year, and gets back a ranked list of the most common problems based on thousands of real owner complaints, not a handful of forum posts.

## What it does

Given a car (for example, a 2014 Mercedes-Benz C-Class), the dashboard shows:

- The most reported problems, ranked by complaint frequency
- Severity indicators: how many complaints involved crashes, fires, or injuries
- A side-by-side comparison against other models in the same class
- The raw complaint summaries so buyers can read the original owner reports

The data comes from the NHTSA (National Highway Traffic Safety Administration) Complaints API, a public U.S. government dataset containing millions of owner-filed safety complaints.

## Architecture

```
NHTSA Complaints API          Reddit API (Phase 2)
        |                              |
        v                              v
  nhtsa_fetcher.py              reddit_fetcher.py
        |                              |
        v                              v
   ┌──────────────────────────────────────┐
   │           SQLite database            │
   │   complaints, models, insights       │
   └──────────────────────────────────────┘
                    |
                    v
          FastAPI backend (Python)
           /api/car/{make}/{model}/{year}
           /api/compare
           /api/top-issues
                    |
                    v
         Plain HTML/CSS/JS dashboard
```

## Design decisions

**NHTSA as the primary data source, not Reddit.** Reddit discussions are valuable for subjective owner experience, but they are unstructured, biased toward negative experiences, and legally complicated to use commercially. NHTSA complaint data is structured, free, public domain, and already categorized by component. It serves as the factual backbone. Reddit is the supplementary layer for context that NHTSA cannot provide: repair costs, owner satisfaction, and subjective experience. This separation means the core pipeline stays reliable even if the Reddit layer fails or is removed.

**SQLite instead of PostgreSQL or MongoDB.** This is a read-heavy application with a bounded dataset (German cars, 2010 to present). SQLite handles this workload without requiring a database server, which means zero infrastructure cost and zero configuration. The entire database is a single file that can be version-controlled, backed up by copying, and deployed by uploading.

**Plain HTML frontend instead of React.** The complexity of this project lives in the data pipeline and the API layer, not the frontend. A plain HTML/CSS/JS frontend with fetch calls to the API is simpler to build, simpler to deploy, and simpler to debug. FastAPI serves the static files directly, so the entire application runs as a single process. If the frontend needs to become more sophisticated later, it can be replaced without touching the backend.

**German cars only, not all cars.** Narrowing the scope makes the product more useful, not less. A dashboard covering every car ever made would be shallow. A dashboard focused exclusively on Mercedes-Benz, BMW, Audi, Volkswagen, and Porsche can go deeper: mapping platform/chassis codes to model names, tracking generational differences (W204 vs W205 C-Class), and eventually incorporating brand-specific community knowledge from dedicated subreddits.

**Complaint counts over sentiment scores.** Many similar tools use NLP sentiment analysis to rate cars as "positive" or "negative." This project deliberately avoids that. A complaint count of 287 for electrical system failures is more actionable than a sentiment score of 0.34. Buyers do not need to know that Reddit is "somewhat negative" about a car. They need to know that 287 people reported the same electrical problem and 12 of those involved a crash.

## Data sources

**NHTSA Complaints API** (primary)
- Endpoint: `api.nhtsa.gov/complaints/complaintsByVehicle?make={MAKE}&model={MODEL}&modelYear={YEAR}`
- No API key required
- Public domain (U.S. government data)
- Fields: component category, crash/fire/injury flags, owner summary, date of incident
- Coverage: 1949 to present, updated daily

**Reddit API** (Phase 2, supplementary)
- Free tier: 100 queries per minute with authenticated access
- Subreddits: r/cars, r/mercedes_benz, r/BMW, r/Audi, r/Volkswagen
- Used for: repair cost estimates, subjective owner experience, purchase recommendations

## Tech stack

- Python 3.10+
- FastAPI (backend API and static file serving)
- SQLite (data storage)
- httpx (async HTTP client for NHTSA API)
- HTML, CSS, vanilla JavaScript (frontend)
- Chart.js (data visualization)

## Project structure

```
shouldibuyit/
├── ingestion/
│   ├── nhtsa_fetcher.py      # Fetches complaint data from NHTSA API
│   ├── config.py             # German car brands, models, year ranges
│   ├── reddit_fetcher.py     # Phase 2: Reddit data collection
│   └── classifier.py         # Phase 2: AI problem/advantage classification
├── backend/
│   ├── main.py               # FastAPI app entry point
│   ├── routes.py             # API endpoint definitions
│   ├── database.py           # SQLite connection and queries
│   └── models.py             # Pydantic response schemas
├── frontend/
│   ├── index.html            # Search page
│   ├── compare.html          # Side-by-side comparison
│   ├── style.css             # Shared styles
│   └── app.js                # API calls and rendering
├── data/
│   └── cars.db               # SQLite database (not committed)
├── requirements.txt
├── .env                      # API credentials (not committed)
├── .gitignore
└── README.md
```

## Current status

Under active development. The NHTSA data pipeline is the current focus.

<!-- 
Add after the dashboard is built:

## Screenshot

[Dashboard screenshot here]

## Setup and installation

```bash
git clone https://github.com/yourname/shouldibuyit.git
cd shouldibuyit
pip install -r requirements.txt
python ingestion/nhtsa_fetcher.py
uvicorn backend.main:app
```

## API documentation

Document the three endpoints with example requests and responses.

## What I learned

Write this section last. Cover:
- What surprised you about the NHTSA data
- Where AI classification worked well and where it didn't
- What you would do differently if starting over
- What you'd add with more time
-->