import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createSelector,
} from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { EntityOverlay } from '../components/PDFViewer';

export type OverlayVisibility = Record<string, boolean>;

interface ViewerState {
  workspacePath: string | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  pdfLoaded: boolean;
  overlayVisibility: OverlayVisibility;
  entitiesByPage: Record<number, EntityOverlay[]>;
  entitiesLoading: boolean;
  entitiesError: string | null;
  selectedEntityId: string | null;
  pageDimensions: Record<
    number,
    { width: number | null; height: number | null }
  >;
}

const initialState: ViewerState = {
  workspacePath: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  pdfLoaded: false,
  overlayVisibility: {},
  entitiesByPage: {},
  entitiesLoading: false,
  entitiesError: null,
  selectedEntityId: null,
  pageDimensions: {},
};

export const fetchPageEntities = createAsyncThunk<
  {
    page: number;
    entities: EntityOverlay[];
    pageDimensions: Record<
      number,
      { width: number | null; height: number | null }
    >;
  },
  { workspacePath: string; page: number },
  { rejectValue: string }
>(
  'viewer/fetchPageEntities',
  async ({ workspacePath, page }, { rejectWithValue }) => {
    const providers = ['openrouter', 'google-docai'];

    for (const providerId of providers) {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'ocr:get-page-bboxes',
          workspacePath,
          providerId,
          page,
        );

        const bboxes = result?.bboxes ?? [];

        if (bboxes && bboxes.length > 0) {
          const entities: EntityOverlay[] = [];

          for (let idx = 0; idx < bboxes.length; idx++) {
            const bbox = bboxes[idx];
            if (!bbox.vertices || bbox.vertices.length < 4) continue;

            const xs = bbox.vertices.map((v: { x: number }) => v.x);
            const ys = bbox.vertices.map((v: { y: number }) => v.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            entities.push({
              id: `ocr-p${page}-${idx}`,
              type: bbox.type,
              title: bbox.text?.slice(0, 50) ?? null,
              bbox: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
              },
              page,
            });
          }

          console.log(
            `[viewerSlice] Loaded ${entities.length} entities for page ${page} from ${providerId}`,
          );

          const pageDimensions = result?.imageSize
            ? {
                [page]: {
                  width: result.imageSize.width,
                  height: result.imageSize.height,
                },
              }
            : {};

          return { page, entities, pageDimensions };
        }
      } catch (err) {
        console.warn(`[viewerSlice] Failed to fetch from ${providerId}:`, err);
      }
    }

    return { page, entities: [], pageDimensions: {} };
  },
);

const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    setWorkspacePath: (state, action: PayloadAction<string | null>) => {
      state.workspacePath = action.payload;
      state.entitiesByPage = {};
      state.pageDimensions = {};
      state.currentPage = 1;
    },
    setCurrentPage: (state, action: PayloadAction<number>) => {
      if (action.payload >= 1) {
        state.currentPage = action.payload;
        if (action.payload > state.totalPages) {
          state.totalPages = action.payload;
        }
      }
    },
    setTotalPages: (state, action: PayloadAction<number>) => {
      state.totalPages = action.payload;
    },
    setScale: (state, action: PayloadAction<number>) => {
      state.scale = Math.min(4, Math.max(0.5, action.payload));
    },
    setPdfLoaded: (state, action: PayloadAction<boolean>) => {
      state.pdfLoaded = action.payload;
    },
    toggleOverlay: (state, action: PayloadAction<string>) => {
      state.overlayVisibility[action.payload] =
        !state.overlayVisibility[action.payload];
    },
    setOverlayVisibility: (
      state,
      action: PayloadAction<Record<string, boolean>>,
    ) => {
      Object.entries(action.payload).forEach(([key, value]) => {
        state.overlayVisibility[key] = value;
      });
    },
    setSelectedEntity: (state, action: PayloadAction<string | null>) => {
      state.selectedEntityId = action.payload;
    },
    clearEntities: (state) => {
      state.entitiesByPage = {};
      state.pageDimensions = {};
      state.entitiesError = null;
    },
    resetViewer: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPageEntities.pending, (state) => {
        state.entitiesLoading = true;
        state.entitiesError = null;
      })
      .addCase(fetchPageEntities.fulfilled, (state, action) => {
        state.entitiesLoading = false;
        const { page, entities, pageDimensions } = action.payload;
        state.entitiesByPage[page] = entities;
        if (Object.keys(pageDimensions).length > 0) {
          state.pageDimensions = {
            ...state.pageDimensions,
            ...pageDimensions,
          };
        }
      })
      .addCase(fetchPageEntities.rejected, (state, action) => {
        state.entitiesLoading = false;
        state.entitiesError = action.payload ?? 'Failed to fetch entities';
      });
  },
});

export const {
  setWorkspacePath,
  setCurrentPage,
  setTotalPages,
  setScale,
  setPdfLoaded,
  toggleOverlay,
  setOverlayVisibility,
  setSelectedEntity,
  clearEntities,
  resetViewer,
} = viewerSlice.actions;

export const selectWorkspacePath = (state: RootState) =>
  state.viewer.workspacePath;
export const selectCurrentPage = (state: RootState) => state.viewer.currentPage;
export const selectTotalPages = (state: RootState) => state.viewer.totalPages;
export const selectScale = (state: RootState) => state.viewer.scale;
export const selectPdfLoaded = (state: RootState) => state.viewer.pdfLoaded;
export const selectOverlayVisibility = (state: RootState) =>
  state.viewer.overlayVisibility;
export const selectEntitiesByPage = (state: RootState) =>
  state.viewer.entitiesByPage;

export const selectEntities = createSelector(
  [selectEntitiesByPage, selectCurrentPage],
  (entitiesByPage, currentPage) => entitiesByPage[currentPage] ?? [],
);

export const selectAllEntities = createSelector(
  [selectEntitiesByPage],
  (entitiesByPage) => Object.values(entitiesByPage).flat(),
);
export const selectEntitiesLoading = (state: RootState) =>
  state.viewer.entitiesLoading;
export const selectEntitiesError = (state: RootState) =>
  state.viewer.entitiesError;
export const selectSelectedEntityId = (state: RootState) =>
  state.viewer.selectedEntityId;
export const selectPageDimensions = (state: RootState) =>
  state.viewer.pageDimensions;

export const selectVisibleEntities = createSelector(
  [selectEntities, selectOverlayVisibility],
  (entities, overlayVisibility) =>
    entities.filter((e) => {
      if (overlayVisibility[e.type]) return true;
      for (const key of Object.keys(overlayVisibility)) {
        if (overlayVisibility[key] && key.endsWith(`:${e.type}`)) return true;
      }
      return false;
    }),
);

export const selectShowAnyOverlay = (state: RootState) => {
  const vis = state.viewer.overlayVisibility;
  return Object.values(vis).some(Boolean);
};

export default viewerSlice.reducer;
