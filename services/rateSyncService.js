/**
 * Exchange rate sync service - pre-warms exchange rate cache on startup.
 * Uses EXCHANGE_RATE_API_URL and EXCHANGE_RATE_API_KEY from .env.
 */
let initialized = false;

async function initialize() {
  if (initialized) return;
  initialized = true;
  const url = process.env.EXCHANGE_RATE_API_URL;
  const key = process.env.EXCHANGE_RATE_API_KEY;
  if (!url || !key) {
    console.log('⚠️ Exchange rate API not configured, skipping sync');
    return;
  }
  try {
    const exchangeRateService = require('./exchangeRateService');
    await exchangeRateService.getRates();
    console.log('📊 Exchange rate cache warmed');
  } catch (err) {
    console.warn('Exchange rate pre-warm failed:', err.message);
  }
}

module.exports = {
  initialize,
};
