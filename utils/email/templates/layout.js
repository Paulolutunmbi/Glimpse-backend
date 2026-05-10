const brand = require('../brand');
const styles = require('../styles');
const header = require('../components/header');
const footer = require('../components/footer');
const escapeHtml = require('../components/escape');

const layout = ({ title, preheader, children, footerReason }) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(title || brand.name)}</title>
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      @media only screen and (max-width: 600px) {
        .glimpse-page { padding: 18px 8px !important; }
        .glimpse-content { padding: 28px 22px 24px !important; }
        .glimpse-footer { padding-left: 22px !important; padding-right: 22px !important; }
        .glimpse-title { font-size: 25px !important; }
      }

      @media (prefers-color-scheme: dark) {
        .glimpse-page { background: #261817 !important; }
        .glimpse-card { background: #3d2c2c !important; border-color: #5a403f !important; }
        .glimpse-content, .glimpse-footer { background: #3d2c2c !important; }
        .glimpse-title, .glimpse-text-strong { color: #fff8f7 !important; }
        .glimpse-copy, .glimpse-footer-text { color: #ffedeb !important; }
        .glimpse-note { background: #261817 !important; border-color: #8e706f !important; color: #ffedeb !important; }
        .glimpse-link { color: #ffb3b0 !important; }
      }
    </style>
  </head>
  <body style="${styles.body}">
    <div style="${styles.preheader}">${escapeHtml(preheader || '')}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="glimpse-page" style="${styles.page}">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${styles.container}">
            <tr>
              <td class="glimpse-card" style="${styles.card}">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" aria-label="${escapeHtml(title || `${brand.name} email`)}">
                  ${header()}
                  <tr>
                    <td class="glimpse-content" style="${styles.content}">
                      <main role="article" aria-roledescription="email">
                        ${children}
                      </main>
                    </td>
                  </tr>
                  ${footer({ reason: footerReason })}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

module.exports = layout;
