/**
 * Exchange rate sync service - stub implementation.
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
  console.log('📊 Exchange rate sync service ready');
}

module.exports = {
  initialize,
};
