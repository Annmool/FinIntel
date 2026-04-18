import React from 'react';
import { BookOpen, TrendingUp, ShieldAlert, LineChart, Brain, Rocket, X } from 'lucide-react';
import { motion } from 'framer-motion';

const Academy = ({ onClose }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{ paddingBottom: '40px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BookOpen size={36} color="var(--accent)" /> FinIntel Academy
          </h1>
          <p className="text-muted" style={{ fontSize: '1.1rem' }}>Your crash course to mastering the market and using this dashboard.</p>
        </div>
        <button onClick={onClose} className="btn-outline" style={{ borderRadius: '50%', padding: '12px' }}>
          <X size={24} />
        </button>
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--accent-bg)', borderRadius: '12px', color: 'var(--accent)' }}>
              <TrendingUp size={24} />
            </div>
            <h3 style={{ fontSize: '1.3rem' }}>Market Basics</h3>
          </div>
          <p className="text-muted">
            <strong>Stock:</strong> A tiny piece of ownership in a company. When they grow, your piece becomes more valuable.
            <br/><br/>
            <strong>Bull vs Bear:</strong> A "Bull" market is charging upward (prices rising). A "Bear" market is hibernating (prices falling).
            <br/><br/>
            <strong>Market Cap:</strong> The total dollar value of all a company's shares. It tells you how massive the company is.
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--purple-bg)', borderRadius: '12px', color: 'var(--purple)' }}>
              <LineChart size={24} />
            </div>
            <h3 style={{ fontSize: '1.3rem' }}>Understanding Indicators</h3>
          </div>
          <p className="text-muted">
            <strong>RSI (Relative Strength Index):</strong> A momentum score from 0 to 100. 
            <br/><br/>
            - <strong>Under 35:</strong> "Oversold" (Could be a good time to buy).<br/>
            - <strong>Over 65:</strong> "Overbought" (Might be too expensive right now).<br/>
            - <strong>Middle:</strong> Normal trading activity.
            <br/><br/>
            <strong>P/E Ratio:</strong> How much you pay for $1 of the company's profit. Lower usually means better value!
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--success-bg)', borderRadius: '12px', color: 'var(--success)' }}>
              <Brain size={24} />
            </div>
            <h3 style={{ fontSize: '1.3rem' }}>How to use FinIntel</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '10px' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>1. Search Globally</strong>
              <p className="text-muted text-small">Type any US ticker (e.g. AAPL) or Indian stock (e.g. TCS.NS) in the top bar to get instant charts and data.</p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>2. AI Deep Dive</strong>
              <p className="text-muted text-small">Click "Generate Deep Dive" on any stock to get an expert, human-readable analysis powered by Groq AI.</p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>3. Track Portfolio</strong>
              <p className="text-muted text-small">Add stocks to your Watchlist or Portfolio. You can even export your holdings to PDF or CSV!</p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>4. Set Alerts</strong>
              <p className="text-muted text-small">Set target prices. We will tell you if the price goes above or below your target.</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-primary" style={{ marginTop: '20px', alignSelf: 'flex-start' }}>
            <Rocket size={18} /> I'm ready to trade!
          </button>
        </div>

      </div>
    </motion.div>
  );
};

export default Academy;
