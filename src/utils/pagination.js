/**
 * Parse and normalise pagination params.
 * @param {{ page?: any, limit?: any }} params
 * @returns {{ page: number, limit: number, offset: number }}
 */
const parsePagination = ({ page, limit } = {}) => {
  const parsedPage  = Math.max(1, parseInt(page)  || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset      = (parsedPage - 1) * parsedLimit;
  return { page: parsedPage, limit: parsedLimit, offset };
};

module.exports = { parsePagination };
