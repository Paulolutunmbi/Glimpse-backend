const brand = require('../brand');
const escapeHtml = require('./escape');

const button = ({ href, label, variant = 'primary' }) => {
  const background = variant === 'secondary' ? brand.colors.inverseSurface : brand.colors.primary;
  const color = '#ffffff';

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px">
      <tr>
        <td bgcolor="${background}" style="border-radius:999px">
          <a href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${background};color:${color};font-family:${brand.fonts.body};font-size:15px;line-height:1.2;font-weight:700;text-decoration:none">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
};

module.exports = button;
