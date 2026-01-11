const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

export const SENTRY_DSN = getEnv('SENTRY_DSN') || getEnv('OKRAPDF_SENTRY_DSN') || '';

export const SENTRY_ENVIRONMENT = getEnv('NODE_ENV') || 'development';

export const SENTRY_ENABLED = Boolean(SENTRY_DSN);
