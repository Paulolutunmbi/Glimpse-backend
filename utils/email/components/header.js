const brand = require('../brand');
const escapeHtml = require('./escape');

const header = () => `
  <tr>
    <td align="center" style="padding:30px 24px 22px;background:${brand.colors.inverseSurface}">
      <img src="cid:${brand.logoCid}" width="${brand.logo.width}" alt="${escapeHtml(brand.logo.alt)}" style="display:block;width:${brand.logo.width}px;max-width:68%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none">
    </td>
  </tr>
`;

module.exports = header;
