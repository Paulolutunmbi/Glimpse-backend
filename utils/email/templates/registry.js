const templates = require('./index');

const templateRegistry = {
  verificationEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.verificationEmail },
    sampleData: { code: '123456', name: 'Ada' },
  },
  otpVerificationEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.otpVerificationEmail },
    sampleData: {
      code: '123456',
      name: 'Ada',
      purpose: 'confirm this sign-in attempt',
    },
  },
  passwordResetEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.passwordResetEmail },
    sampleData: {
      resetUrl: 'https://glimpse.app/reset-password?token=preview-token',
      name: 'Ada',
    },
  },
  passwordChangedEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.passwordChangedEmail },
    sampleData: { name: 'Ada', loginUrl: 'https://glimpse.app/login' },
  },
  welcomeEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.welcomeEmail },
    sampleData: { name: 'Ada', appUrl: 'https://glimpse.app' },
  },
  accountNotificationEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.accountNotificationEmail },
    sampleData: {
      name: 'Ada',
      title: 'Your profile was updated',
      message: 'Your Glimpse profile changes are now live.',
      ctaUrl: 'https://glimpse.app/profile',
      ctaLabel: 'View profile',
    },
  },
  accountDeletedEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.accountDeletedEmail },
    sampleData: { name: 'Ada', feedbackUrl: 'https://glimpse.app/goodbye' },
  },
  feedbackReceivedEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.feedbackReceivedEmail },
    sampleData: { email: 'ada@example.com', message: 'I left because...', timestamp: new Date().toISOString() },
  },
  supportResponseEmail: {
    defaultVersion: 'v1',
    versions: { v1: templates.supportResponseEmail },
    sampleData: {
      name: 'Ada',
      message: 'Thanks for reaching out. We received your request and will follow up shortly.',
      ctaUrl: 'https://glimpse.app',
      ctaLabel: 'Open Glimpse',
    },
  },
};

const listTemplates = () =>
  Object.entries(templateRegistry).map(([name, config]) => ({
    name,
    defaultVersion: config.defaultVersion,
    versions: Object.keys(config.versions),
  }));

const getTemplateRenderer = (name, version) => {
  const config = templateRegistry[name];
  if (!config) return null;
  const selectedVersion = version || config.defaultVersion;
  const render = config.versions[selectedVersion];
  if (!render) return null;
  return { render, version: selectedVersion };
};

const getTemplateSampleData = (name) => templateRegistry[name]?.sampleData || {};

module.exports = {
  templateRegistry,
  listTemplates,
  getTemplateRenderer,
  getTemplateSampleData,
};
