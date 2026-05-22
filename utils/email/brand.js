const path = require('path');
const { getClientAppUrl } = require('../../src/config/clientUrls');

const logoCid = 'glimpse-logo';
const logoFilename = 'glimpse-logo-light-dark.png';
const logoPath = 'Backend/assets/glimpse-logo-light-dark.png';
const logoAbsolutePath = path.resolve(__dirname, '../../assets/glimpse-logo-light-dark.png');

const supportEmailAddress =
  process.env.SUPPORT_EMAIL_ADDRESS || process.env.SUPPORT_EMAIL || 'oluwatunmbipaul@gmail.com';
const supportEmailName = process.env.SUPPORT_EMAIL_NAME || 'Glimpse Support';
const supportEmail = `${supportEmailName} <${supportEmailAddress}>`;

const brand = {
  name: 'Glimpse',
  tagline: 'Share the moments that matter.',
  supportEmail,
  supportEmailAddress,
  supportEmailName,
  appUrl: getClientAppUrl(),
  logoCid,
  logoPath,
  logoFilename,
  logoAbsolutePath,
  logoUrl: `${getClientAppUrl()}/images/glimpse-logo-light-dark.png`,
  logo: {
    cid: logoCid,
    filename: logoFilename,
    path: logoAbsolutePath,
    url: `${getClientAppUrl()}/images/glimpse-logo-light-dark.png`,
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
