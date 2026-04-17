const mongoose = require('mongoose');
const AlertSchema = new mongoose.Schema({
    userId: String,
    symbol: String,
    targetPrice: Number,
    condition: { type: String, enum: ['ABOVE', 'BELOW'] },
    triggered: { type: Boolean, default: false }
});
module.exports = mongoose.model('Alert', AlertSchema);