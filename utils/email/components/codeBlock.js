const brand = require('../brand');
const escapeHtml = require('./escape');

const codeBlock = (code) => `
  <div class="glimpse-note" role="group" aria-label="Verification code" style="margin:28px 0;padding:22px 18px;border-radius:18px;background:${brand.colors.surfaceContainer};border:1px solid ${brand.colors.outline};text-align:center">
    <div aria-label="${escapeHtml(String(code).split('').join(' '))}" style="font-family:'Courier New', Courier, monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:8px;color:${brand.colors.primary}">
      ${escapeHtml(code)}
    </div>
  </div>
`;

module.exports = codeBlock;
