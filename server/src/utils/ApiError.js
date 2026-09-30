/**
 * An error that carries an HTTP status code, so controllers can throw
 * `throw new ApiError(404, 'Song not found')` and the error middleware
 * turns it into a clean JSON response.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.details = details
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details)
  }

  static unauthorized(message = 'You need to log in to do that') {
    return new ApiError(401, message)
  }

  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message)
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message)
  }

  static conflict(message = 'That resource already exists') {
    return new ApiError(409, message)
  }

  static tooMany(message = 'Too many requests, please slow down') {
    return new ApiError(429, message)
  }

  static internal(message = 'Something went wrong on our end') {
    return new ApiError(500, message)
  }
}

export default ApiError
