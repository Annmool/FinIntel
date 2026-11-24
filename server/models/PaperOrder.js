const mongoose = require('mongoose');

const paperOrderSchema = new mongoose.Schema({
  _id: String,
  userId: String,
  side: { type: String, required: true },
  symbol: { type: String, required: true },
  quantity: { type: Number, required: true },
  response: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

paperOrderSchema.index({ userId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('PaperOrder', paperOrderSchema);
