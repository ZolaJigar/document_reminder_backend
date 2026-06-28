/**
 * Send a success JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {*} [data]
 */
const successResponse = (res, statusCode, message, data = null) => {
  const body = { status: 'success', message };
  if (data !== null && data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
};

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {*} [error]
 */
const errorResponse = (res, statusCode, message, error = null) => {
  const body = { status: 'error', message };
  if (error !== null && error !== undefined) {
    body.errors = Array.isArray(error) ? error : [error];
  }
  return res.status(statusCode).json(body);
};

module.exports = { successResponse, errorResponse };
