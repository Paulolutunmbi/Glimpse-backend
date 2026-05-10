require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getTemplateSampleData } = require('../utils/email/templates/registry');
const renderTemplate = require('../utils/email/render/renderTemplate');

const template = process.argv[2] || 'verificationEmail';
const version = process.argv[3];
const outputDir = path.resolve(__dirname, '../tmp/email-preview');

const rendered = renderTemplate({
  template,
  version,
  data: getTemplateSampleData(template),
});

fs.mkdirSync(outputDir, { recursive: true });

const htmlPath = path.join(outputDir, `${template}-${rendered.templateVersion}.html`);
const textPath = path.join(outputDir, `${template}-${rendered.templateVersion}.txt`);

fs.writeFileSync(htmlPath, rendered.html);
fs.writeFileSync(textPath, rendered.text);

console.log(`Rendered ${template}@${rendered.templateVersion}`);
console.log(`HTML: ${htmlPath}`);
console.log(`Text: ${textPath}`);
