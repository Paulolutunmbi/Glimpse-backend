const crypto = require('crypto');

const createTrackingContext = ({ to, template, templateVersion, metadata = {} }) => {
  const trackingId =
    metadata.trackingId ||
    crypto
      .createHash('sha256')
      .update(`${to || 'unknown'}:${template || 'raw'}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 24);

  return {
    trackingId,
    template,
    templateVersion,
    campaign: metadata.campaign || null,
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
  };
};

const appendTrackingQuery = (url, trackingContext) => {
  if (!url || !trackingContext?.trackingId) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', 'glimpse_email');
    parsed.searchParams.set('utm_medium', 'transactional');
    parsed.searchParams.set('email_template', trackingContext.template || 'raw');
    parsed.searchParams.set('email_version', trackingContext.templateVersion || 'v1');
    parsed.searchParams.set('email_tracking_id', trackingContext.trackingId);
    return parsed.toString();
  } catch (err) {
    return url;
  }
};

const buildTrackingHeaders = (trackingContext) => {
  if (!trackingContext?.trackingId) return {};

  return {
    'X-Glimpse-Email-Tracking-Id': trackingContext.trackingId,
    'X-Glimpse-Email-Template': trackingContext.template || 'raw',
    'X-Glimpse-Email-Version': trackingContext.templateVersion || 'v1',
  };
};

const createOpenPixelHtml = (trackingContext) => {
  const baseUrl = process.env.EMAIL_TRACKING_BASE_URL;
  if (!baseUrl || !trackingContext?.trackingId) return '';

  const pixelUrl = appendTrackingQuery(`${baseUrl.replace(/\/$/, '')}/open.gif`, trackingContext);
  return `<img src="${pixelUrl}" width="1" height="1" alt="" role="presentation" aria-hidden="true" style="display:block;width:1px;height:1px;border:0;outline:none;opacity:0">`;
};

const withTracking = ({ html, trackingContext }) => {
  if (!html) return html;
  let trackedHtml = html;

  if (process.env.EMAIL_CLICK_TRACKING_ENABLED === 'true') {
    trackedHtml = trackedHtml.replace(/href="([^"]+)"/g, (match, href) => {
      if (/^(mailto:|tel:|#)/i.test(href)) return match;
      return `href="${appendTrackingQuery(href, trackingContext)}"`;
    });
  }

  const pixel = createOpenPixelHtml(trackingContext);
  if (!pixel) return trackedHtml;
  return trackedHtml.replace('</body>', `${pixel}</body>`);
};

module.exports = {
  appendTrackingQuery,
  buildTrackingHeaders,
  createTrackingContext,
  withTracking,
};
