import { useState, useCallback, ReactNode } from 'react';
import {
  useGetVerificationTreeQuery,
  useGetEntitiesQuery,
  useGetTablesByJobIdQuery,
  useGetPageContentQuery,
  useGetVerificationHistoryQuery,
  useSavePageVersionMutation,
  useUpdateTableStatusMutation,
  useFixAndAcceptTableMutation,
} from '../store/desktopApi';
import { ReviewDataContext, ReviewDataContextValue } from './ReviewDataContext';

interface RemoteReviewDataProviderProps {
  jobId: string;
  children: ReactNode;
}

export function RemoteReviewDataProvider({ jobId, children }: RemoteReviewDataProviderProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: treeData, isLoading: treeLoading, refetch: refetchTree } = useGetVerificationTreeQuery(jobId, {
    skip: !jobId,
    pollingInterval: 30000,
  });

  const { data: entitiesData, isLoading: entitiesLoading } = useGetEntitiesQuery(
    { jobId },
    { skip: !jobId }
  );

  const { data: tablesData, refetch: refetchTables } = useGetTablesByJobIdQuery(
    { jobId },
    { skip: !jobId }
  );

  const { data: pageContent, isLoading: contentLoading } = useGetPageContentQuery(
    { jobId, pageNum: currentPage },
    { skip: !jobId || !currentPage }
  );

  const { data: historyData, isLoading: historyLoading } = useGetVerificationHistoryQuery(
    { jobId, limit: 100 },
    { skip: !jobId || !historyOpen }
  );

  const [savePageVersionMutation, { isLoading: isSaving }] = useSavePageVersionMutation();
  const [updateTableStatusMutation, { isLoading: isUpdatingTable }] = useUpdateTableStatusMutation();
  const [fixAndAcceptTableMutation] = useFixAndAcceptTableMutation();

  const savePageVersion = useCallback(async (content: string) => {
    await savePageVersionMutation({ jobId, pageNum: currentPage, content }).unwrap();
    refetchTree();
  }, [jobId, currentPage, savePageVersionMutation, refetchTree]);

  const updateTableStatus = useCallback(async (tableId: string, status: 'pending' | 'verified' | 'flagged' | 'rejected') => {
    await updateTableStatusMutation({ tableId, jobId, status }).unwrap();
    refetchTree();
    refetchTables();
  }, [jobId, updateTableStatusMutation, refetchTree, refetchTables]);

  const fixAndAcceptTable = useCallback(async (tableId: string, correctedMarkdown: string) => {
    await fixAndAcceptTableMutation({ tableId, jobId, correctedMarkdown }).unwrap();
    refetchTree();
    refetchTables();
  }, [jobId, fixAndAcceptTableMutation, refetchTree, refetchTables]);

  const value: ReviewDataContextValue = {
    mode: 'remote',
    treeData: treeData ?? null,
    treeLoading,
    refetchTree,
    entitiesData: entitiesData ?? null,
    entitiesLoading,
    tablesData: tablesData ?? null,
    refetchTables,
    pageContent: pageContent ?? null,
    contentLoading,
    currentPage,
    setCurrentPage,
    savePageVersion,
    isSaving,
    updateTableStatus,
    isUpdatingTable,
    fixAndAcceptTable,
    historyData: historyData ?? null,
    historyLoading,
    historyOpen,
    setHistoryOpen,
  };

  return <ReviewDataContext.Provider value={value}>{children}</ReviewDataContext.Provider>;
}
