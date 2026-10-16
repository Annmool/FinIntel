# FinIntel Dashboard 📈
[![Live Demo](https://img.shields.io/badge/Live_Demo-finintel.pages.dev-blue?style=for-the-badge)](https://finintel.pages.dev/)
[![C++ Quant Core](https://img.shields.io/badge/Compute_Core-C%2B%2B20_%7C_OpenMP-orange?style=for-the-badge)](https://github.com/)

FinIntel is an institutional-grade financial dashboard, portfolio analytics system, and quantitative risk platform. Combining a modern full-stack web interface with a **native high-performance C++20 quantitative computing engine**, it delivers sub-millisecond multi-asset Monte Carlo simulations, Value-at-Risk (VaR/CVaR), and Markowitz Modern Portfolio Theory optimization.

## 🚀 Key Features

- **⚡ C++20 Quantitative Computing Core (New!)**:
  - **Multi-Asset Monte Carlo Simulation**: Simulates up to 250,000 portfolio trajectories across correlated assets using Geometric Brownian Motion (GBM) with Cholesky decomposition.
  - **OpenMP Multi-Threaded Parallelism**: 8 parallel worker threads using 64-bit Mersenne Twister PRNG (`std::mt19937_64`) processing over **75,000,000 simulation steps/sec**.
  - **Institutional Risk Metrics**: Empirical & Parametric 95% and 99% Value-at-Risk (VaR), Conditional VaR (Expected Shortfall), and Maximum Drawdown distributions.
  - **Markowitz Efficient Frontier & Portfolio Optimization**: Solves for the Maximum Sharpe Ratio (Tangency) Portfolio and Minimum Volatility Portfolio with dynamic rebalancing recommendations.
  - **Live V8 vs C++ Engine Benchmarking**: Live side-by-side execution timer demonstrating 4x to 80x speedup over single-threaded JavaScript.
- **Real-Time Market Data**: Search global stocks, high-frequency ticker tapes, and interactive charts (Lightweight Charts).
- **AI Market Analyst**: Leverages LLaMA (via Groq) to provide daily morning briefings, analyze news sentiment, and generate actionable technical insights.
- **Paper Trading Simulator**: Practice trading risk-free with virtual accounts and real-time P&L tracking.
- **Real Portfolio Management**: Track actual holdings with real-time profit/loss calculations and export reports to **CSV** or **PDF**.
- **Automated Price Alerts**: Background cron jobs tracking target prices.
- **Stock Screener**: Discover new investment opportunities based on fundamental and technical metrics.

---

## 🛠️ Tech Stack

**High-Performance Quantitative Core:**
- **C++20** compiled with MSYS2 GCC 14.2 (UCRT64, x86_64)
- **OpenMP** parallel processing & SIMD vectorization
- Multi-asset Cholesky decomposition & stochastic differential equation discretization

**Frontend:**
- React 19, React Router v7
- Framer Motion, HTML5 Canvas High-DPI Charts
- Lucide React, Lightweight Charts, jsPDF & AutoTable, Firebase Auth

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose
- Child-process IPC pipeline streaming binary JSON directly to the C++ Core
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
- Node.js (v18+ recommended)
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
```

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
