// API clients read JSON, so unknown routes and unhandled failures answer in JSON too.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

function errorHandler(log = console.error) {
  // Express identifies error middleware by its four parameters.
  return function handleError(error, req, res, next) { // eslint-disable-line no-unused-vars
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error?.name === 'CastError' || error?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Request contains an invalid value.' });
    }
    log(`Unhandled error on ${req.method} ${req.path}: ${error?.message}`);
    return res.status(500).json({ error: 'The server could not complete this request.' });
  };
}

module.exports = { notFound, errorHandler };
