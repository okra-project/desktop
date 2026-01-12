import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type {
  QueryAST,
  QueryResultSet,
  QueryResultItem,
  DisplayMode,
} from '../../shared/types/query';

interface QueryState {
  activeQuery: QueryAST | null;
  results: QueryResultSet | null;
  displayMode: DisplayMode;
  focusedIndex: number | null;
  selectedIds: string[];
  pinnedResults: QueryResultItem[];
  history: Array<{ query: QueryAST; timestamp: string }>;
  isExecuting: boolean;
  error: string | null;
}

const initialState: QueryState = {
  activeQuery: null,
  results: null,
  displayMode: 'overlay',
  focusedIndex: null,
  selectedIds: [],
  pinnedResults: [],
  history: [],
  isExecuting: false,
  error: null,
};

export const executeQuery = createAsyncThunk<
  QueryResultSet,
  string | QueryAST,
  { rejectValue: string }
>('query/execute', async (input, { rejectWithValue }) => {
  try {
    return await window.electron.ipcRenderer.invoke('query:execute', input);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Query failed');
  }
});

const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    setDisplayMode: (state, action: PayloadAction<DisplayMode>) => {
      state.displayMode = action.payload;
    },

    focusResult: (state, action: PayloadAction<number | null>) => {
      state.focusedIndex = action.payload;
    },

    focusNext: (state) => {
      if (!state.results?.results.length) return;
      const max = state.results.results.length - 1;
      state.focusedIndex =
        state.focusedIndex === null ? 0 : Math.min(state.focusedIndex + 1, max);
    },

    focusPrev: (state) => {
      if (!state.results?.results.length) return;
      state.focusedIndex =
        state.focusedIndex === null ? 0 : Math.max(state.focusedIndex - 1, 0);
    },

    toggleSelect: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const idx = state.selectedIds.indexOf(id);
      if (idx >= 0) {
        state.selectedIds.splice(idx, 1);
      } else {
        state.selectedIds.push(id);
      }
    },

    selectAll: (state) => {
      if (state.results) {
        state.selectedIds = state.results.results.map((r) => r.id);
      }
    },

    clearSelection: (state) => {
      state.selectedIds = [];
    },

    pinResult: (state, action: PayloadAction<QueryResultItem>) => {
      if (!state.pinnedResults.find((r) => r.id === action.payload.id)) {
        state.pinnedResults.push(action.payload);
      }
    },

    unpinResult: (state, action: PayloadAction<string>) => {
      state.pinnedResults = state.pinnedResults.filter(
        (r) => r.id !== action.payload,
      );
    },

    clearPinned: (state) => {
      state.pinnedResults = [];
    },

    clearQuery: (state) => {
      state.activeQuery = null;
      state.results = null;
      state.focusedIndex = null;
      state.selectedIds = [];
      state.error = null;
    },

    setResultsFromMcp: (state, action: PayloadAction<QueryResultSet>) => {
      state.activeQuery = action.payload.query;
      state.results = action.payload;
      state.focusedIndex = action.payload.results.length > 0 ? 0 : null;
      state.isExecuting = false;
      state.error = null;

      state.history.unshift({
        query: action.payload.query,
        timestamp: action.payload.executedAt,
      });
      state.history = state.history.slice(0, 50);
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(executeQuery.pending, (state) => {
        state.isExecuting = true;
        state.error = null;
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.isExecuting = false;
        state.activeQuery = action.payload.query;
        state.results = action.payload;
        state.focusedIndex = action.payload.results.length > 0 ? 0 : null;

        state.history.unshift({
          query: action.payload.query,
          timestamp: action.payload.executedAt,
        });
        state.history = state.history.slice(0, 50);
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.isExecuting = false;
        state.error = action.payload ?? 'Query failed';
      });
  },
});

export const {
  setDisplayMode,
  focusResult,
  focusNext,
  focusPrev,
  toggleSelect,
  selectAll,
  clearSelection,
  pinResult,
  unpinResult,
  clearPinned,
  clearQuery,
  setResultsFromMcp,
} = querySlice.actions;

export const selectActiveQuery = (state: RootState) => state.query.activeQuery;
export const selectQueryResults = (state: RootState) => state.query.results;
export const selectDisplayMode = (state: RootState) => state.query.displayMode;
export const selectFocusedIndex = (state: RootState) =>
  state.query.focusedIndex;
export const selectSelectedIds = (state: RootState) => state.query.selectedIds;
export const selectPinnedResults = (state: RootState) =>
  state.query.pinnedResults;
export const selectQueryHistory = (state: RootState) => state.query.history;
export const selectIsExecuting = (state: RootState) => state.query.isExecuting;
export const selectQueryError = (state: RootState) => state.query.error;

export const selectFocusedResult = (
  state: RootState,
): QueryResultItem | null => {
  const { results, focusedIndex } = state.query;
  if (!results || focusedIndex === null) return null;
  return results.results[focusedIndex] ?? null;
};

export const selectHasActiveQuery = (state: RootState): boolean => {
  return state.query.results !== null && state.query.results.results.length > 0;
};

export default querySlice.reducer;
