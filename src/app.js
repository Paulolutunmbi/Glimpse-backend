const express = require('express');
const cors = require('cors');

const apiRoutes = require('./routes');
const emailPreviewRoutes = require('../routes/emailPreviewRoutes');
const { errorHandler, notFound } = require('../middleware/errorHandler');
const { buildCorsOptions, resolveAllowedOrigin } = require('./config/cors');

const createApp = ({ allowedOrigins }) => {
  const app = express();
  const corsOptions = buildCorsOptions(allowedOrigins);

  app.use(cors(corsOptions));

  app.use((req, res, next) => {
    const origin = resolveAllowedOrigin(req.headers.origin, allowedOrigins);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
  });

  app.use(express.json());

  app.use('/api', apiRoutes);
  app.use('/dev/email-preview', emailPreviewRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
