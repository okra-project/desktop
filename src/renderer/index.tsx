import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import * as Sentry from '@sentry/electron/renderer';
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_ENVIRONMENT } from '../config/sentry';

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  Sentry.setTag('process', 'renderer');
}

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
  <Provider store={store}>
    <App />
  </Provider>
);

// calling IPC exposed from preload script
window.electron?.ipcRenderer.once('ipc-example', (arg) => {
  // eslint-disable-next-line no-console
  console.log(arg);
});
window.electron?.ipcRenderer.sendMessage('ipc-example', ['ping']);
