import multer from 'multer'
import config from '../config/env.js'
import ApiError from '../utils/ApiError.js'

/** Unknown route -> forward a 404 into the error pipeline. */
export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

/**
 * Single place where every error becomes a JSON response.
 * Never leak stack traces or internal messages in production.
 */
export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Something went wrong'
  let details = err.details

  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400
    message = 'Invalid identifier'
  }

  // Mongoose: schema validation
  if (err.name === 'ValidationError') {
    statusCode = 400
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
    message = details[0]?.message || 'Validation failed'
  }

  // Mongo: unique index violation
  if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyValue || {})[0] || 'value'
    message =
      field === 'email'
        ? 'An account with that email already exists'
        : field === 'username'
          ? 'That username is already taken'
          : `That ${field} is already in use`
  }

  // Multer
  if (err instanceof multer.MulterError) {
    statusCode = 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : `Upload failed: ${err.message}`
  }

  if (statusCode >= 500) {
    console.error('[error]', err)
  }

  const body = {
    success: false,
    message:
      statusCode >= 500 && config.isProduction
        ? 'Something went wrong on our end'
        : message,
  }
  if (details) body.details = details
  if (!config.isProduction && statusCode >= 500) body.stack = err.stack

  res.status(statusCode).json(body)
}
