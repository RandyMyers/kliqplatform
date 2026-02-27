/**
 * Exchange rate service using exchangerate-api.com v6.
 * Uses EXCHANGE_RATE_API_URL, EXCHANGE_RATE_API_KEY, EXCHANGE_RATE_CACHE_TTL from .env.
 */
const https = require('https');

const BASE_CURRENCY = 'USD';
const SUPPORTED = ['USD', 'EUR', 'GBP'];

let cache = null;
let cacheExpiry = 0;

function getCacheTTL() {
  const ttl = parseInt(process.env.EXCHANGE_RATE_CACHE_TTL, 10);
  return isNaN(ttl) || ttl < 60 ? 3600 : ttl;
}

function fetchRatesFromAPI() {
  return new Promise((resolve, reject) => {
    const url = process.env.EXCHANGE_RATE_API_URL;
    const key = process.env.EXCHANGE_RATE_API_KEY;
    if (!url || !key) {
      reject(new Error('Exchange rate API not configured'));
      return;
    }
    const fullUrl = `${url}/${key}/latest/${BASE_CURRENCY}`;
    const parsed = new URL(fullUrl);
    const req = https.get(fullUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result !== 'success' || !json.conversion_rates) {
            reject(new Error(json['error-type'] || 'Invalid API response'));
            return;
          }
          resolve({
            base: BASE_CURRENCY,
            rates: json.conversion_rates,
            updatedAt: json.time_last_update_utc || new Date().toISOString(),
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Exchange rate API timeout'));
    });
  });
}

async function getRates() {
  const now = Date.now();
  const ttl = getCacheTTL() * 1000;
  if (cache && cacheExpiry > now) {
    return cache;
  }
  try {
    cache = await fetchRatesFromAPI();
    cacheExpiry = now + ttl;
    return cache;
  } catch (err) {
    if (cache) return cache;
    console.warn('Exchange rate fetch failed, using fallback:', err.message);
    cache = {
      base: BASE_CURRENCY,
      rates: { USD: 1, EUR: 0.92, GBP: 0.79 },
      updatedAt: new Date().toISOString(),
    };
    cacheExpiry = now + 60000;
    return cache;
  }
}

function convert(amountMinor, fromCurrency, toCurrency) {
  if (!cache || !cache.rates) return null;
  const from = (fromCurrency || 'USD').toUpperCase();
  const to = (toCurrency || 'USD').toUpperCase();
  if (from === to) return amountMinor;
  const rateFrom = cache.rates[from];
  const rateTo = cache.rates[to];
  if (rateFrom == null || rateTo == null) return null;
  return Math.round(amountMinor * (rateTo / rateFrom));
}

module.exports = {
  getRates,
  convert,
  SUPPORTED,
  BASE_CURRENCY,
};
