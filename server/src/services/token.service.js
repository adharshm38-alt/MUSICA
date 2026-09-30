/**
 * Utilities for signing and verifying the JWT auth token.
 */
import jwt from 'jsonwebtoken'
import config from '../config/env.js'

export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret)

export default signToken
