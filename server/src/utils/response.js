/** Consistent JSON envelopes so the frontend can always read `res.data.data`. */

export const sendSuccess = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data })

export const sendCreated = (res, data) => sendSuccess(res, data, 201)

export const sendMessage = (res, message, statusCode = 200) =>
  res.status(statusCode).json({ success: true, message })

export const sendPaginated = (res, { items, total, page, limit, totalPages }) =>
  res.status(200).json({
    success: true,
    data: { items, total, page, limit, totalPages },
  })

export default sendSuccess
