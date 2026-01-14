import { configureStore, combineReducers } from '@reduxjs/toolkit';

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: unknown;
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: unknown;
  }
}
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import {
  settingsReducer,
  chatReducer,
  extractionReducer,
} from '@okrapdf/redux';
import {
  workflowReducer,
  WorkflowRunner,
  initializeWorkflowRunner,
} from '@okrapdf/workflow-runtime';
import verificationReducer from './verification/slice';
import reviewAgentReducer from './reviewAgentSlice';
import viewerReducer from './viewerSlice';
import processingEventsReducer from './processingEventsSlice';
import queryReducer from './querySlice';
import verifyModeReducer from './verifyModeSlice';
import { desktopApi } from './desktopApi';
import { electronWorkflowAdapter } from './workflowAdapter';

const rootReducer = combineReducers({
  settings: settingsReducer,
  chat: chatReducer,
  extraction: extractionReducer,
  workflow: workflowReducer,
  verification: verificationReducer,
  reviewAgent: reviewAgentReducer,
  viewer: viewerReducer,
  processingEvents: processingEventsReducer,
  query: queryReducer,
  verifyMode: verifyModeReducer,
  [desktopApi.reducerPath]: desktopApi.reducer,
});

const persistConfig = {
  key: 'okrapdf-desktop',
  version: 3,
  storage,
  whitelist: ['verification'],
  transforms: [],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const verificationLoggerMiddleware = () => (next: any) => (action: any) => {
  if (action.type?.startsWith('verification/')) {
    console.log('[Verification]', action.type, action.payload);
  }
  return next(action);
};

const ipcBridgeMiddleware = () => (next: any) => (action: any) => {
  const result = next(action);

  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    const significantActions = [
      'verification/startSession',
      'verification/endSession',
      'verification/appendAction',
      'verification/appendObservation',
      'verification/commitDraft',
    ];

    if (significantActions.includes(action.type)) {
      window.electron.ipcRenderer.sendMessage('verification:state-changed', {
        type: action.type,
        payload: action.payload,
      });
    }
  }

  return result;
};

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        ignoredPaths: [
          'verification.session.startedAt',
          'verification.session.completedAt',
          'verification.events',
          'verification.ghostOverlay.timestamp',
          'verification.pendingPermission.timestamp',
        ],
      },
    })
      .concat(desktopApi.middleware)
      .concat(verificationLoggerMiddleware, ipcBridgeMiddleware),
  devTools: {
    name: 'OkraPDF Desktop',
    trace: true,
    traceLimit: 25,
  },
});

console.log('[Redux] Store created, devTools:', {
  extensionDetected: !!window.__REDUX_DEVTOOLS_EXTENSION__,
  composeDetected: !!window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__,
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export { electronSettingsAdapter } from './settingsAdapter';
export { electronExtractionAdapter } from './extractionAdapter';
export { electronWorkflowAdapter } from './workflowAdapter';

const workflowRunner = new WorkflowRunner(
  electronWorkflowAdapter,
  store.dispatch,
  store.getState as () => { workflow: ReturnType<typeof workflowReducer> },
);
initializeWorkflowRunner(workflowRunner);
export { workflowRunner };
