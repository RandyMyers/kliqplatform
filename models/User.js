const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user', enum: ['admin', 'manager', 'user'] },
    avatar: { type: String },
    phone: { type: String },
    jobTitle: { type: String },
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'en' },
    // Business / company
    businessName: { type: String },
    companyWebsite: { type: String },
    industry: { type: String },
    companySize: { type: String },
    currency: { type: String, default: 'USD' },
    addressStreet: { type: String },
    addressCity: { type: String },
    addressState: { type: String },
    addressCountry: { type: String },
    addressPostalCode: { type: String },
    // Billing & subscription
    plan: { type: String, default: 'free_trial' },
    trialEndsAt: { type: Date },
    subscriptionStatus: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled', null], default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    accountStatus: { type: String, enum: ['active', 'under_review', 'suspended'], default: 'active' },
    accountStatusReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
