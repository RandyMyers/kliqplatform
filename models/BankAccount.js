const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema(
  {
    currency: { type: String, required: true, unique: true, enum: ['USD', 'EUR', 'GBP'] },
    accountName: { type: String, required: true },
    accountNumber: { type: String },
    bankName: { type: String, required: true },
    iban: { type: String },
    swiftBic: { type: String },
    reference: { type: String },
    instructions: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BankAccount', bankAccountSchema);
