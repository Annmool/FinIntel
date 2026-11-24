const mongoose = require('mongoose');
const receiptSchema = new mongoose.Schema({
    price: Number,
    currency: String,
    source: String,
    quoteTime: Date,
    triggeredAt: Date
}, { _id: false });
const AlertSchema = new mongoose.Schema({
    userId: String,
    symbol: String,
    targetPrice: Number,
    condition: { type: String, enum: ['ABOVE', 'BELOW'] },
    currency: String,
    triggered: { type: Boolean, default: false },
    receipt: receiptSchema
}, { timestamps: true });
module.exports = mongoose.model('Alert', AlertSchema);
