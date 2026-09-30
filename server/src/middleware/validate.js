import { validationResult } from 'express-validator'
import ApiError from '../utils/ApiError.js'

/**
 * Runs after express-validator chains and converts any failures into a
 * single 400 response with a readable list of messages.
 */
export const validate = (req, _res, next) => {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  const details = result.array().map((error) => ({
    field: error.path,
    message: error.msg,
  }))

  return next(ApiError.badRequest(details[0].message, details))
}

export default validate
