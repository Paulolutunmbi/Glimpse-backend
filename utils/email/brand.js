const path = require('path');

const brand = {
  name: 'Glimpse',
  tagline: 'Share the moments that matter.',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@glimpse.app',
  appUrl: process.env.CLIENT_APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  logo: {
    cid: 'glimpse-logo',
    filename: 'glimpse-logo-light-dark.png',
    path: path.resolve(__dirname, '../../../Frontend/public/images/glimpse-logo-light-dark.png'),
    width: 156,
    alt: 'Glimpse',
  },
  colors: {
    primary: '#b52330',
    primaryContainer: '#ff5a5f',
    primaryFixed: '#ffdad8',
    secondary: '#555f6d',
    secondaryContainer: '#d6e0f1',
    tertiary: '#006c4c',
    tertiaryContainer: '#00a879',
    background: '#fff8f7',
    surface: '#ffffff',
    surfaceContainer: '#ffe9e7',
    surfaceContainerHigh: '#fde2e0',
    text: '#261817',
    muted: '#5a403f',
    inverseSurface: '#3d2c2c',
    inverseText: '#ffedeb',
    outline: '#e2bebc',
  },
  fonts: {
    heading: "'Plus Jakarta Sans', Arial, sans-serif",
    body: "'Be Vietnam Pro', Arial, sans-serif",
  },
};

module.exports = brand;
