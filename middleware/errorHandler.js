const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong';

  return res.status(statusCode).json({ success: false, message });
};

const notFound = (req, res) => {
  return res.status(404).json({ success: false, message: 'Route not found' });
};

module.exports = {
  errorHandler,
  notFound,
};
