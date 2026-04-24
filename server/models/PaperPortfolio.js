const mongoose = require('mongoose');

const paperPortfolioSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    symbol: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    dateAdded: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaperPortfolio', paperPortfolioSchema);
