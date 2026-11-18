# FinIntel Dashboard 📈
[![Live Demo](https://img.shields.io/badge/Live_Demo-finintel.pages.dev-blue?style=for-the-badge)](https://finintel.pages.dev/)
[![C++ Quant Core](https://img.shields.io/badge/Compute_Core-C%2B%2B20_%7C_OpenMP-orange?style=for-the-badge)](https://github.com/)

FinIntel is a full-stack investing dashboard and portfolio analytics project. It combines a React interface, an Express and MongoDB API, market-data integrations, Firebase authentication, paper trading, and a native C++20 engine for portfolio simulation and risk analysis.

## 🚀 Key Features

- **C++20 Quantitative Computing Core**:
  - **Multi-Asset Monte Carlo Simulation**: Simulates up to 200,000 portfolio trajectories, subject to a workload limit based on asset count and horizon.
  - Simulates multi-asset price paths using geometric Brownian motion and correlated random inputs.
  - Computes VaR, CVaR, drawdown summaries, and portfolio frontier candidates for the supplied assumptions.
  - Reports runtime and throughput for the selected engine; measurements depend on hardware, inputs, and build configuration. JavaScript fallback timings are not a like-for-like comparison with the native engine.
- **Market Data**: Search supported stocks, view ticker quotes and charts, and see provider and update-time details for currency rates. Provider data may be delayed or differ across sources.
- **Market Briefing and AI Summaries**: Read sourced headlines and request an AI summary of the indicators and news shown for a stock.
- **Paper Trading Simulator**: Practice with a virtual USD account and fills based on recent verified market quotes.
- **Real Portfolio Management**: Track actual holdings with real-time profit/loss calculations and export reports to **CSV** or **PDF**.
- **Price Triggers**: A background job checks targets and records their status for display in the dashboard.
- **Stock Screener**: Discover new investment opportunities based on fundamental and technical metrics.

---

## 🛠️ Tech Stack

**Quantitative Core:**
- C++20 with OpenMP parallel processing
- Multi-asset Cholesky decomposition & stochastic differential equation discretization

**Frontend:**
- React 19, React Router v7
- Framer Motion, HTML5 Canvas High-DPI Charts
- Lucide React, Lightweight Charts, jsPDF & AutoTable, Firebase Auth

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose
- Child-process JSON interface to the C++ core
- Node-Cron, Node-Cache, Groq SDK (LLaMA AI)

---

## 📁 Project Structure

```text
stock-insight-dashboard/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── QuantLab.js     # Interactive C++ Quant Lab & Benchmark HUD
│   │   ├── StockChart.js   # Lightweight financial charting
│   │   ├── Screener.js     # Stock screener
│   │   └── App.js          # Main application & routing
│   └── package.json
├── server/                 # Node.js Backend & C++ Engine
│   ├── quant_core/         # Native C++ Quantitative Computing Core
│   │   ├── quant_engine.cpp# C++20 OpenMP engine source
│   │   └── quant_engine.exe# Compiled high-performance native binary
│   ├── quant_service.js    # Node.js service & benchmark wrapper
│   ├── index.js            # Express API & routing
│   └── package.json
└── README.md
```

---

## ⚙️ Local Development Setup

### 1. Prerequisites
- Node.js 20.19+ (required by the current Mongoose version)
- MongoDB account/cluster
- API Keys for Groq, Twelve Data, and Finnhub
- Firebase Project for authentication

### 2. Backend Setup
Navigate to the `server` directory and install dependencies:
```bash
cd server
npm install
```

Create a `.env` file in the `server` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
GROQ_KEY=your_groq_api_key
STOCK_API_KEY=your_twelve_data_api_key
FINNHUB_API_KEY=your_finnhub_api_key
EXCHANGERATE_API_KEY=your_exchangerate_api_key
FIREBASE_PROJECT_ID=finintel-a64ec
STOCK_API_KEYS=optional_comma_separated_twelve_data_keys
ALPHA_VANTAGE_API_KEY=optional_alpha_vantage_key
```

The backend verifies Firebase ID tokens on all user-data routes. Set
`FIREBASE_PROJECT_ID` to the same project as the client if you use a different
Firebase project. Token signature verification uses Google's public signing
certificates, so a Firebase service account key is not required.
Paper trading uses MongoDB transactions; use MongoDB Atlas or another replica
set deployment. Paper buy and sell requests require an `orderId`. Retry the
same order with the same ID. Partial orders support up to four decimal places
and must settle to at least one USD cent. Full closes also support legacy
positions with higher precision when the proceeds meet the minimum.

Quant Lab cloud runs show the inputs and their source. Custom historical runs
use adjusted daily closes converted to USD with date-matched exchange rates
and require at least 15 common price observations. Presets use fixed scenario
inputs. Browser runs use a worker and identify preset or hypothetical inputs.

Stock charts use Twelve Data and Yahoo Finance, with an optional Alpha Vantage
daily-history fallback for plain U.S. tickers. Configure additional authorized
Twelve Data keys through `STOCK_API_KEYS` and Alpha Vantage keys through
`ALPHA_VANTAGE_API_KEY` or `ALPHA_VANTAGE_API_KEYS`. Quota and authentication
failures temporarily cool down the affected key. Provider errors and malformed
candles fall through to the next feed. Chart responses include a source.
Paper execution continues to require a verified matching quote and timestamp.

The gold and silver panel refreshes once per minute through `/api/metals`.
It uses Gold API spot references and explicitly labeled Yahoo Finance futures
references if spot is unavailable. Quotes show USD per troy ounce and their
provider update time. INR per gram is an indicative FX conversion using
31.1034768 grams per troy ounce. Taxes, retail premiums, purity adjustments, and
making charges are excluded. Last available quotes remain labeled during outages.

Start the backend server:
```bash
npm run dev
```

### 3. Frontend Setup
Navigate to the `client` directory and install dependencies:
```bash
cd ../client
npm install
```

Set up your Firebase configuration in `client/src/firebase.js` if you haven't already.

Start the React app:
```bash
npm start
```

The app will run locally at [http://localhost:3000](http://localhost:3000) and the API will be available at [http://localhost:5000](http://localhost:5000).

### Paper settlement integration tests

Run `npm run test:integration` from `server/` against a disposable local
MongoDB replica set. The default URI is
`mongodb://127.0.0.1:27018/?replicaSet=rs0`. Set `PAPER_TEST_MONGO_URI` for a
different loopback port or replica-set name. The suite uses fixed quote
fixtures and a uniquely named database that it drops on teardown.

To reproduce the CI setup with Docker, start the container and initialize the
replica set. Run the suite once `db.hello().isWritablePrimary` is true.

```sh
docker run --rm -d --name finintel-mongo-test -p 127.0.0.1:27018:27018 mongo:8.0.16 --replSet rs0 --port 27018 --bind_ip_all
docker exec finintel-mongo-test mongosh --quiet --port 27018 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27018"}]})'
npm run test:integration
docker stop finintel-mongo-test
```

### Interpreting Quant Lab timings

The native engine timer measures its computation after input parsing and
validation. Measure the full API request separately to include history
lookups, process startup, and response handling. When comparing runs, record
the arguments, machine, compiler flags, and thread count. Use the same
model and work when comparing engines, repeat the runs, and report a median
and a tail percentile alongside the sample count.

---

## 📝 License
This project is for educational and personal use. Data provided by third-party APIs must be used in accordance with their respective terms of service.
