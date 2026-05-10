const { getTemplateRenderer } = require('../templates/registry');

const renderTemplate = ({ template, data = {}, version } = {}) => {
  if (!template) {
    throw new Error('template is required');
  }

  const match = getTemplateRenderer(template, version);
  if (!match) {
    throw new Error(`Unknown email template or version: ${template}${version ? `@${version}` : ''}`);
  }

  const rendered = match.render(data);

  if (!rendered.subject || !rendered.text || !rendered.html) {
    throw new Error(`Template ${template}@${match.version} must render subject, text, and html`);
  }

  return {
    ...rendered,
    template,
    templateVersion: match.version,
  };
};

module.exports = renderTemplate;
