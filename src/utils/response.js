export function successResponse(res, data = null, message = 'Success', statusCode = 200, meta = null) {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

export function paginatedResponse(res, items, page, limit, total, message = 'Success') {
  const totalPages = Math.ceil(total / limit) || 1;
  return res.status(200).json({
    success: true,
    message,
    data: items,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: parseInt(total, 10),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
}

export function errorResponse(res, message, statusCode = 500, errorCode = 'ERROR', details = null) {
  const payload = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  if (details) {
    payload.error.details = details;
  }

  return res.status(statusCode).json(payload);
}

export default { successResponse, paginatedResponse, errorResponse };

