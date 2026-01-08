// Safe access to process.env (not available in renderer by default)
const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

export const SENTRY_DSN =
  getEnv('SENTRY_DSN') ||
  getEnv('OKRAPDF_SENTRY_DSN') ||
  'https://522f775f10e9d7ddcacd2cbf14ac05d4@o4509653543354368.ingest.us.sentry.io/4510626285486080';

export const SENTRY_ENVIRONMENT =
  getEnv('OKRAPDF_ENV') || getEnv('NODE_ENV') || 'development';

export const SENTRY_ENABLED =
  Boolean(SENTRY_DSN) && getEnv('OKRAPDF_SENTRY_DISABLED') !== 'true';
