const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'storehub-payment-gateway-credentials';

function getKey() {
  const secret =
    process.env.PAYMENT_CREDENTIALS_SECRET ||
    process.env.STORE_CREDENTIALS_SECRET ||
    process.env.JWT_SECRET ||
    'default-dev-secret-change-in-production';
  return crypto.scryptSync(secret, SALT, KEY_LENGTH);
}

function encryptPaymentCreds(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptPaymentCreds(cipherText) {
  if (!cipherText) return null;
  const key = getKey();
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

module.exports = { encryptPaymentCreds, decryptPaymentCreds };
