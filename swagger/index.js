/**
 * Swagger API documentation - minimal stub.
 * Add swagger-jsdoc and swagger-ui-express for full docs.
 */
const swaggerUi = require('swagger-ui-express');

const specs = {
  openapi: '3.0.0',
  info: {
    title: 'StoreHub CRM API',
    version: '1.0.0',
  },
  paths: {},
};

module.exports = {
  specs,
  swaggerUi,
};
