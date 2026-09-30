/**
 * Wraps an async route handler so rejected promises reach Express'
 * error middleware instead of hanging the request.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export default asyncHandler
