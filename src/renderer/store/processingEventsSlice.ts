import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';

export type ProcessingEventType =
  | 'ocr_started'
  | 'ocr_page_complete'
  | 'ocr_complete'
  | 'entity_found'
  | 'extraction_complete'
  | 'extraction_error';

export interface ProcessingEvent {
  id: string;
  type: ProcessingEventType;
  message: string;
  page?: number;
  timestamp: number;
  provider?: string;
}

export type ExtractionStatus = 'idle' | 'processing' | 'completed' | 'error';

interface ProcessingEventsState {
  events: ProcessingEvent[];
  extractionStatus: ExtractionStatus;
  currentProvider: string | null;
  pagesCompleted: number;
  totalPages: number;
  entitiesFound: number;
  lastError: string | null;
  maxEvents: number;
}

const initialState: ProcessingEventsState = {
  events: [],
  extractionStatus: 'idle',
  currentProvider: null,
  pagesCompleted: 0,
  totalPages: 0,
  entitiesFound: 0,
  lastError: null,
  maxEvents: 20,
};

const processingEventsSlice = createSlice({
  name: 'processingEvents',
  initialState,
  reducers: {
    addEvent: (
      state,
      action: PayloadAction<Omit<ProcessingEvent, 'id' | 'timestamp'>>,
    ) => {
      const event: ProcessingEvent = {
        ...action.payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
      };
      state.events.unshift(event);
      if (state.events.length > state.maxEvents) {
        state.events = state.events.slice(0, state.maxEvents);
      }
    },

    startExtraction: (
      state,
      action: PayloadAction<{ provider: string; totalPages: number }>,
    ) => {
      state.extractionStatus = 'processing';
      state.currentProvider = action.payload.provider;
      state.totalPages = action.payload.totalPages;
      state.pagesCompleted = 0;
      state.entitiesFound = 0;
      state.lastError = null;

      const event: ProcessingEvent = {
        id: `${Date.now()}-start`,
        type: 'ocr_started',
        message: `Starting extraction with ${action.payload.provider}...`,
        timestamp: Date.now(),
        provider: action.payload.provider,
      };
      state.events.unshift(event);
    },

    pageCompleted: (
      state,
      action: PayloadAction<{ page: number; entitiesOnPage?: number }>,
    ) => {
      state.pagesCompleted = Math.max(
        state.pagesCompleted,
        action.payload.page,
      );

      if (action.payload.entitiesOnPage) {
        state.entitiesFound += action.payload.entitiesOnPage;
      }

      const event: ProcessingEvent = {
        id: `${Date.now()}-page${action.payload.page}`,
        type: 'ocr_page_complete',
        message: `Page ${action.payload.page} processed`,
        page: action.payload.page,
        timestamp: Date.now(),
      };
      state.events.unshift(event);

      if (state.events.length > state.maxEvents) {
        state.events = state.events.slice(0, state.maxEvents);
      }
    },

    entityFound: (
      state,
      action: PayloadAction<{ type: string; page: number; count: number }>,
    ) => {
      state.entitiesFound += action.payload.count;

      const event: ProcessingEvent = {
        id: `${Date.now()}-entity`,
        type: 'entity_found',
        message: `+${action.payload.count} ${action.payload.type}(s) on page ${action.payload.page}`,
        page: action.payload.page,
        timestamp: Date.now(),
      };
      state.events.unshift(event);

      if (state.events.length > state.maxEvents) {
        state.events = state.events.slice(0, state.maxEvents);
      }
    },

    extractionCompleted: (state) => {
      state.extractionStatus = 'completed';

      const event: ProcessingEvent = {
        id: `${Date.now()}-complete`,
        type: 'extraction_complete',
        message: `Extraction complete: ${state.entitiesFound} entities found`,
        timestamp: Date.now(),
      };
      state.events.unshift(event);
    },

    extractionError: (state, action: PayloadAction<string>) => {
      state.extractionStatus = 'error';
      state.lastError = action.payload;

      const event: ProcessingEvent = {
        id: `${Date.now()}-error`,
        type: 'extraction_error',
        message: action.payload,
        timestamp: Date.now(),
      };
      state.events.unshift(event);
    },

    clearEvents: (state) => {
      state.events = [];
      state.extractionStatus = 'idle';
      state.currentProvider = null;
      state.pagesCompleted = 0;
      state.totalPages = 0;
      state.entitiesFound = 0;
      state.lastError = null;
    },

    resetForNewDocument: (state) => {
      return { ...initialState };
    },
  },
});

export const {
  addEvent,
  startExtraction,
  pageCompleted,
  entityFound,
  extractionCompleted,
  extractionError,
  clearEvents,
  resetForNewDocument,
} = processingEventsSlice.actions;

export const selectProcessingEvents = (state: RootState) =>
  state.processingEvents.events;
export const selectLatestEvent = (state: RootState) =>
  state.processingEvents.events[0] ?? null;

const selectProcessingEventsState = (state: RootState) =>
  state.processingEvents;

export const selectRecentEvents = (limit: number) =>
  createSelector([selectProcessingEvents], (events) => events.slice(0, limit));

export const selectExtractionStatus = (state: RootState) =>
  state.processingEvents.extractionStatus;

export const selectExtractionProgress = createSelector(
  [selectProcessingEventsState],
  (pe) => ({
    status: pe.extractionStatus,
    provider: pe.currentProvider,
    pagesCompleted: pe.pagesCompleted,
    totalPages: pe.totalPages,
    entitiesFound: pe.entitiesFound,
    progressPercent:
      pe.totalPages > 0
        ? Math.round((pe.pagesCompleted / pe.totalPages) * 100)
        : 0,
  }),
);

export const selectLastError = (state: RootState) =>
  state.processingEvents.lastError;

export default processingEventsSlice.reducer;
