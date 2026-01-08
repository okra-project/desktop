export const SENTRY_DSN =
  process.env.SENTRY_DSN ||
  process.env.OKRAPDF_SENTRY_DSN ||
  'https://522f775f10e9d7ddcacd2cbf14ac05d4@o4509653543354368.ingest.us.sentry.io/4510626285486080';

export const SENTRY_ENVIRONMENT =
  process.env.OKRAPDF_ENV || process.env.NODE_ENV || 'development';

export const SENTRY_ENABLED =
  Boolean(SENTRY_DSN) && process.env.OKRAPDF_SENTRY_DISABLED !== 'true';
