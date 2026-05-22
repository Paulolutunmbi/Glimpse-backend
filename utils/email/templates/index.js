const brand = require('../brand');
const styles = require('../styles');
const button = require('../components/button');
const codeBlock = require('../components/codeBlock');
const escapeHtml = require('../components/escape');
const layout = require('./layout');

const greeting = (name) => (name ? `Hi ${name},` : 'Hi there,');

const paragraph = (content) => `<p class="glimpse-copy" style="${styles.paragraph}">${content}</p>`;

const titleBlock = ({ eyebrow, title }) => `
  <p style="${styles.eyebrow}">${escapeHtml(eyebrow)}</p>
  <h1 class="glimpse-title" style="${styles.h1}">${escapeHtml(title)}</h1>
`;

const fallbackLink = (url) => `
  <div class="glimpse-note" style="${styles.note};margin-top:22px">
    Button not working? Copy and paste this link into your browser:<br>
    <a class="glimpse-link" href="${escapeHtml(url)}" style="color:${brand.colors.primary};word-break:break-all">${escapeHtml(url)}</a>
  </div>
`;

const verificationEmail = ({ code, name }) => ({
  subject: 'Verify your Glimpse email',
  text: `${greeting(name)} Your Glimpse verification code is ${code}. It expires in 10 minutes.`,
  html: layout({
    title: 'Verify your Glimpse email',
    preheader: `Your verification code is ${code}. It expires in 10 minutes.`,
    footerReason: 'You received this email because a Glimpse account was created with this address.',
    children: `
      ${titleBlock({ eyebrow: 'Email verification', title: 'Confirm your email address' })}
      ${paragraph(`${escapeHtml(greeting(name))} enter this code in Glimpse to finish setting up your account.`)}
      ${codeBlock(code)}
      <div class="glimpse-note" style="${styles.note}">
        This code expires in <strong class="glimpse-text-strong" style="${styles.strongText}">10 minutes</strong>. If you did not create a Glimpse account, you can ignore this email.
      </div>
    `,
  }),
});

const otpVerificationEmail = ({ code, name, purpose = 'complete this security check' }) => ({
  subject: 'Your Glimpse verification code',
  text: `${greeting(name)} Your Glimpse code is ${code}. Use it to ${purpose}. It expires soon.`,
  html: layout({
    title: 'Your Glimpse verification code',
    preheader: `Your Glimpse code is ${code}.`,
    footerReason: 'You received this email because a security code was requested for your Glimpse account.',
    children: `
      ${titleBlock({ eyebrow: 'Security code', title: 'Use this one-time code' })}
      ${paragraph(`${escapeHtml(greeting(name))} use this code to ${escapeHtml(purpose)}.`)}
      ${codeBlock(code)}
      <div class="glimpse-note" style="${styles.note}">For your security, never share this code with anyone.</div>
    `,
  }),
});

const passwordResetEmail = ({ resetUrl, name }) => ({
  subject: 'Reset your Glimpse password',
  text: `${greeting(name)} use this link to reset your password. It expires in 15 minutes: ${resetUrl}`,
  html: layout({
    title: 'Reset your Glimpse password',
    preheader: 'Use your secure Glimpse password reset link within 15 minutes.',
    footerReason: 'You received this email because a password reset was requested for your Glimpse account.',
    children: `
      ${titleBlock({ eyebrow: 'Password reset', title: 'Create a new password' })}
      ${paragraph(`${escapeHtml(greeting(name))} we received a request to reset your Glimpse password. This secure link expires in <strong class="glimpse-text-strong" style="${styles.strongText}">15 minutes</strong>.`)}
      ${button({ href: resetUrl, label: 'Reset password' })}
      ${fallbackLink(resetUrl)}
      ${paragraph('If you did not request this, your password has not been changed and you can safely ignore this email.')}
    `,
  }),
});

const passwordChangedEmail = ({ name, loginUrl = brand.appUrl }) => ({
  subject: 'Your Glimpse password was changed',
  text: `${greeting(name)} your Glimpse password was changed successfully. If this was not you, contact ${brand.supportEmail}.`,
  html: layout({
    title: 'Your Glimpse password was changed',
    preheader: 'Your Glimpse password was changed successfully.',
    footerReason: 'You received this email because your Glimpse password was changed.',
    children: `
      ${titleBlock({ eyebrow: 'Security update', title: 'Password changed successfully' })}
      ${paragraph(`${escapeHtml(greeting(name))} your Glimpse password has been updated. You can now sign in with your new password.`)}
      ${button({ href: loginUrl, label: 'Open Glimpse', variant: 'secondary' })}
      <div class="glimpse-note" style="${styles.note}">
        If this was not you, contact us immediately at <a class="glimpse-link" href="mailto:${escapeHtml(brand.supportEmailAddress)}" style="color:${brand.colors.primary}">${escapeHtml(brand.supportEmail)}</a>.
      </div>
    `,
  }),
});

const welcomeEmail = ({ name, appUrl = brand.appUrl }) => ({
  subject: 'Welcome to Glimpse',
  text: `${greeting(name)} welcome to Glimpse. Start exploring here: ${appUrl}`,
  html: layout({
    title: 'Welcome to Glimpse',
    preheader: 'Your Glimpse account is ready.',
    footerReason: 'You received this email because you verified your Glimpse account.',
    children: `
      ${titleBlock({ eyebrow: 'Welcome', title: 'Your Glimpse account is ready' })}
      ${paragraph(`${escapeHtml(greeting(name))} you are all set. Start sharing moments, discovering creators, and shaping a profile that feels like you.`)}
      ${button({ href: appUrl, label: 'Start exploring' })}
      <div class="glimpse-note" style="${styles.note}">Tip: finish your profile setup so people can recognize your style at a glance.</div>
    `,
  }),
});

const accountNotificationEmail = ({
  name,
  title = 'Account notification',
  message,
  ctaUrl = brand.appUrl,
  ctaLabel = 'Open Glimpse',
}) => ({
  subject: title,
  text: `${greeting(name)} ${message || 'There is a new update for your Glimpse account.'} ${ctaUrl}`,
  html: layout({
    title,
    preheader: message || 'There is a new update for your Glimpse account.',
    footerReason: 'You received this email because account notifications are enabled for Glimpse.',
    children: `
      ${titleBlock({ eyebrow: 'Account update', title })}
      ${paragraph(`${escapeHtml(greeting(name))} ${escapeHtml(message || 'There is a new update for your Glimpse account.')}`)}
      ${button({ href: ctaUrl, label: ctaLabel })}
    `,
  }),
});

const supportResponseEmail = ({
  name,
  message,
  ctaUrl = brand.appUrl,
  ctaLabel = 'Open Glimpse',
}) => ({
  subject: 'Glimpse support',
  text: `${greeting(name)} ${message || 'Thanks for contacting Glimpse support.'}`,
  html: layout({
    title: 'Glimpse support',
    preheader: 'A response from Glimpse support.',
    footerReason: 'You received this email because you contacted Glimpse support.',
    children: `
      ${titleBlock({ eyebrow: 'Support', title: 'We are here to help' })}
      ${paragraph(`${escapeHtml(greeting(name))} ${escapeHtml(message || 'Thanks for contacting us. Our team will help you get back to creating and sharing as quickly as possible.')}`)}
      ${button({ href: ctaUrl, label: ctaLabel, variant: 'secondary' })}
    `,
  }),
});

module.exports = {
  verificationEmail,
  otpVerificationEmail,
  passwordResetEmail,
  passwordChangedEmail,
  welcomeEmail,
  accountNotificationEmail,
  supportResponseEmail,
};
