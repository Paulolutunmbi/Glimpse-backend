const express = require('express');
const { listTemplates, getTemplateSampleData } = require('../utils/email/templates/registry');
const renderTemplate = require('../utils/email/render/renderTemplate');

const router = express.Router();

const isPreviewEnabled = () =>
  process.env.NODE_ENV !== 'production' || process.env.EMAIL_PREVIEW_ENABLED === 'true';

router.use((req, res, next) => {
  if (!isPreviewEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  return next();
});

router.get('/', (req, res) => {
  const templates = listTemplates();
  const links = templates
    .map(
      (item) =>
        `<li><a href="/dev/email-preview/${item.name}">${item.name}</a> <span>(${item.versions.join(', ')})</span></li>`
    )
    .join('');

  return res.type('html').send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Glimpse Email Preview</title>
        <style>
          body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #fff8f7; color: #261817; }
          a { color: #b52330; font-weight: 700; }
          li { margin: 10px 0; }
        </style>
      </head>
      <body>
        <main>
          <h1>Glimpse Email Preview</h1>
          <p>Preview rendered transactional templates without sending email.</p>
          <ul>${links}</ul>
        </main>
      </body>
    </html>`);
});

router.get('/:template', (req, res) => {
  const data = {
    ...getTemplateSampleData(req.params.template),
    ...(req.query || {}),
  };

  try {
    const rendered = renderTemplate({
      template: req.params.template,
      version: req.query.version,
      data,
    });

    if (req.query.format === 'json') {
      return res.json(rendered);
    }

    return res.type('html').send(rendered.html);
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
