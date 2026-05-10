const brand = require('../brand');

const shadow = '0 18px 48px rgba(38, 24, 23, 0.12)';

const styles = {
  body: [
    'margin:0',
    `background:${brand.colors.background}`,
    `color:${brand.colors.text}`,
    `font-family:${brand.fonts.body}`,
    '-webkit-font-smoothing:antialiased',
    'width:100%',
  ].join(';'),
  preheader: [
    'display:none',
    'font-size:1px',
    'line-height:1px',
    'max-height:0',
    'max-width:0',
    'opacity:0',
    'overflow:hidden',
    'mso-hide:all',
  ].join(';'),
  page: 'width:100%;background:#fff8f7;padding:32px 12px',
  container: 'width:100%;max-width:640px;margin:0 auto',
  card: [
    'background:#ffffff',
    'border:1px solid #f1d1cf',
    'border-radius:24px',
    `box-shadow:${shadow}`,
    'overflow:hidden',
  ].join(';'),
  content: 'padding:36px 40px 32px',
  eyebrow: [
    'margin:0 0 12px',
    'font-size:12px',
    'line-height:1.2',
    'font-weight:700',
    'letter-spacing:0.08em',
    'text-transform:uppercase',
    `color:${brand.colors.primary}`,
  ].join(';'),
  h1: [
    'margin:0 0 16px',
    `font-family:${brand.fonts.heading}`,
    'font-size:30px',
    'line-height:1.2',
    'font-weight:800',
    'letter-spacing:0',
    `color:${brand.colors.text}`,
  ].join(';'),
  paragraph: [
    'margin:0 0 18px',
    'font-size:16px',
    'line-height:1.65',
    `color:${brand.colors.muted}`,
  ].join(';'),
  strongText: `color:${brand.colors.text};font-weight:700`,
  divider: 'height:1px;line-height:1px;background:#f1d1cf;margin:26px 0',
  note: [
    `background:${brand.colors.surfaceContainer}`,
    'border:1px solid #f1d1cf',
    'border-radius:16px',
    'padding:16px 18px',
    'font-size:14px',
    'line-height:1.6',
    `color:${brand.colors.muted}`,
  ].join(';'),
  footerText: [
    'margin:0',
    'font-size:12px',
    'line-height:1.6',
    `color:${brand.colors.muted}`,
  ].join(';'),
};

module.exports = styles;
