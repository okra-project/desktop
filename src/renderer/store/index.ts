/**
 * Redux Store Configuration
 *
 * Combines all slices and sets up middleware for
 * persistence and debugging.
 */

import { configureStore, combineReducers } from '@reduxjs/toolkit';
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
import verificationReducer from './verification/slice';

// ============================================
// Root Reducer
// ============================================

const rootReducer = combineReducers({
  verification: verificationReducer,
});

// ============================================
// Persistence Configuration
// ============================================

const persistConfig = {
  key: 'okrapdf-verification',
  version: 1,
  storage,
  // Only persist verification session data
  whitelist: ['verification'],
  // Transform dates on rehydration
  transforms: [],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// ============================================
// Custom Middleware
// ============================================

/**
 * Middleware to log verification events for debugging
 */
const verificationLoggerMiddleware = () => (next: any) => (action: any) => {
  if (action.type?.startsWith('verification/')) {
    console.log('[Verification]', action.type, action.payload);
  }
  return next(action);
};

/**
 * Middleware to notify main process of significant events
 */
const ipcBridgeMiddleware = () => (next: any) => (action: any) => {
  const result = next(action);

  // Notify main process of session events
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

// ============================================
// Store Configuration
// ============================================

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore redux-persist actions
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        // Ignore Date objects in verification state
        ignoredPaths: [
          'verification.session.startedAt',
          'verification.session.completedAt',
          'verification.events',
          'verification.ghostOverlay.timestamp',
          'verification.pendingPermission.timestamp',
        ],
      },
    }).concat(verificationLoggerMiddleware, ipcBridgeMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

export const persistor = persistStore(store);

// ============================================
// Type Exports
// ============================================

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

// ============================================
// Typed Hooks
// ============================================

import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
