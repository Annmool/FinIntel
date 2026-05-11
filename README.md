# FinIntel Dashboard 📈

FinIntel is a professional, production-grade financial dashboard and portfolio management platform built with the MERN stack. It empowers users with real-time stock data, paper trading capabilities, AI-driven market insights, and comprehensive portfolio tracking.

## 🚀 Features

- **Real-Time Market Data**: Search global stocks, view high-frequency ticker tapes, and interactive charts (powered by Lightweight Charts).
- **AI Market Analyst**: Leverages LLaMA (via Groq) to provide daily morning briefings, analyze news sentiment, and generate actionable technical insights.
- **Paper Trading Simulator**: Practice trading risk-free with a virtual account balance.
- **Real Portfolio Management**: Track actual holdings with real-time profit/loss calculations and export reports to **CSV** or **PDF**.
- **Automated Price Alerts**: Set target prices (above/below) and receive alerts driven by background cron jobs.
- **Stock Screener**: Discover new investment opportunities based on various technical and fundamental metrics.
- **Authentication**: Secure user login via Firebase Auth.
- **Responsive & Dynamic UI**: Features Dark/Light modes, fluid animations (Framer Motion), and a mobile-friendly layout.

---

## 🛠️ Tech Stack

**Frontend:**
- React 19, React Router v7
- Framer Motion (Animations)
- Lucide React (Icons)
- Lightweight Charts (Financial Charting)
- jsPDF & AutoTable (Export features)
- Firebase Auth

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose (Database & Models)
- Node-Cron (Automated alerts)
- Node-Cache (API Rate-limit protection)
- Sentiment (News sentiment analysis)
- Groq SDK (LLaMA AI integration)

**APIs Used:**
- Yahoo Finance (Fundamentals & Data)
- Twelve Data (Time Series Data)
- Finnhub (Ticker Tape & News)

---

## 📁 Project Structure

```text
stock-insight-dashboard/
├── client/                 # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # App.js, StockChart.js, Screener.js, etc.
│   │   ├── utils/
│   │   └── firebase.js     # Firebase auth config
│   └── package.json
├── server/                 # Node.js Backend
│   ├── models/             # Mongoose schemas (Alert, Portfolio, VirtualAccount, etc.)
│   ├── index.js            # Main Express app, API routes, and Cron jobs
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
