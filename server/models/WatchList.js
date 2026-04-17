const mongoose = require('mongoose');
const WatchlistSchema = new mongoose.Schema({
    symbol: { type: String, required: true },
    userId: { type: String, required: true } // Link stock to a specific user
});
module.exports = mongoose.model('Watchlist', WatchlistSchema);