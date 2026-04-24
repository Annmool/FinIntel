const mongoose = require('mongoose');

const virtualAccountSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 100000 }
});

module.exports = mongoose.model('VirtualAccount', virtualAccountSchema);
