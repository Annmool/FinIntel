const mongoose = require('mongoose');

const correctionSchema = new mongoose.Schema({
    previousPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    correctedAt: { type: Date, required: true }
}, { _id: false });

const PortfolioSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    currency: { type: String },
    costRevision: { type: Number, default: 0 },
    costCorrections: [correctionSchema],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Portfolio', PortfolioSchema);
