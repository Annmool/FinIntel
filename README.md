# FinIntel Dashboard 📈
[![Live Demo](https://img.shields.io/badge/Live_Demo-finintel.pages.dev-blue?style=for-the-badge)](https://finintel.pages.dev/)
[![C++ Quant Core](https://img.shields.io/badge/Compute_Core-C%2B%2B20_%7C_OpenMP-orange?style=for-the-badge)](https://github.com/)

FinIntel is a full-stack investing dashboard and portfolio analytics project. It combines a React interface, an Express and MongoDB API, market-data integrations, Firebase authentication, paper trading, and a native C++20 engine for portfolio simulation and risk analysis.

## 🚀 Key Features

- **C++20 Quantitative Computing Core**:
  - **Multi-Asset Monte Carlo Simulation**: Simulates up to 250,000 portfolio trajectories across correlated assets using Geometric Brownian Motion (GBM) with Cholesky decomposition.
  - Simulates multi-asset price paths using geometric Brownian motion and correlated random inputs.
  - Computes VaR, CVaR, drawdown summaries, and portfolio frontier candidates for the supplied assumptions.
  - Reports runtime and throughput for the selected engine; measurements depend on hardware, inputs, and build configuration. JavaScript fallback timings are not a like-for-like comparison with the native engine.
- **Market Data**: Search supported stocks, view ticker quotes and charts, and see provider and update-time details for currency rates. Provider data may be delayed or differ across sources.
- **AI Market Analyst**: Leverages LLaMA (via Groq) to provide daily morning briefings, analyze news sentiment, and generate actionable technical insights.
- **Paper Trading Simulator**: Practice trading risk-free with virtual accounts and real-time P&L tracking.
- **Real Portfolio Management**: Track actual holdings with real-time profit/loss calculations and export reports to **CSV** or **PDF**.
- **Automated Price Alerts**: Background cron jobs tracking target prices.
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
```

The backend verifies Firebase ID tokens on all user-data routes. Set
`FIREBASE_PROJECT_ID` to the same project as the client if you use a different
Firebase project. Token signature verification uses Google's public signing
certificates, so a Firebase service account key is not required.
Paper trading uses MongoDB transactions; use MongoDB Atlas or another replica
set deployment rather than a standalone MongoDB server.

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

---

## 📝 License
This project is for educational and personal use. Data provided by third-party APIs must be used in accordance with their respective terms of service.
