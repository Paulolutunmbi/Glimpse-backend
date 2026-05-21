const http = require('http');
const dotenv = require('dotenv');

const createApp = require('./app');
const { connectToDatabase } = require('./config/db');
const { buildAllowedOrigins, buildSocketCorsOptions } = require('./config/cors');
const { initSocket } = require('./sockets');
const { validateEmailTransportEnv } = require('../utils/sendEmail');

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('ERROR: MONGO_URI must be configured');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET must be configured');
  process.exit(1);
}

const allowedOrigins = buildAllowedOrigins();
const app = createApp({ allowedOrigins });
const server = http.createServer(app);

initSocket(server, {
  cors: buildSocketCorsOptions(allowedOrigins),
});

const port = process.env.PORT || 5000;

connectToDatabase()
  .then(() => {
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message || err);
    process.exit(1);
  });

const emailConfig = validateEmailTransportEnv();

if (!emailConfig.ok) {
  const message = `EMAIL CONFIG WARNING: ${emailConfig.message}. Password reset and verification emails will fail until this is fixed.`;
  if (process.env.NODE_ENV === 'production') {
    console.error(message);
  } else {
    console.warn(message);
  }
} else {
  console.log('Resend email configuration loaded');
}
