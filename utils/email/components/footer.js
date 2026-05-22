const brand = require('../brand');
const styles = require('../styles');
const escapeHtml = require('./escape');

const footer = ({ reason } = {}) => `
  <tr>
    <td class="glimpse-footer" style="padding:0 40px 34px;background:#ffffff">
      <div style="${styles.divider}">&nbsp;</div>
      <p class="glimpse-footer-text" style="${styles.footerText}">
        ${escapeHtml(reason || 'You received this email because you use Glimpse.')}
      </p>
      <p class="glimpse-footer-text" style="${styles.footerText};margin-top:10px">
        ${escapeHtml(brand.name)} &bull; ${escapeHtml(brand.tagline)}<br>
        Need help? <a class="glimpse-link" href="mailto:${escapeHtml(brand.supportEmailAddress)}" style="color:${brand.colors.primary};text-decoration:none">${escapeHtml(brand.supportEmail)}</a>
      </p>
    </td>
  </tr>
`;

module.exports = footer;
