/**
 * DockedChat
 *
 * Chat interface for the review agent. Displays at the bottom of the review tab
 * and allows users to interact with the AI assistant for document analysis.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  sendReviewMessage,
  clearMessages,
  resetEditedContent,
  selectReviewMessages,
  selectReviewStatus,
  selectReviewError,
  selectHasEdits,
  type AgentContext,
} from '../../store/reviewAgentSlice';

// ============================================================================
// Types
// ============================================================================

export interface DockedChatProps {
  /** Context for the review agent */
  context: AgentContext;
  /** Prefilled message (e.g., from entity action) */
  prefill?: string;
  /** Auto-send the prefilled message */
  autoSend?: boolean;
  /** Callback when edits are saved */
  onSave?: (content: string) => void;
  /** Whether save is in progress */
  isSaving?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function DockedChat({
  context,
  prefill,
  autoSend,
  onSave,
  isSaving,
}: DockedChatProps) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector(selectReviewMessages);
  const status = useAppSelector(selectReviewStatus);
  const error = useAppSelector(selectReviewError);
  const hasEdits = useAppSelector(selectHasEdits);

  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = status === 'streaming';

  // Handle prefill
  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      setIsOpen(true);
      if (autoSend) {
        // Auto-send after a short delay
        setTimeout(() => {
          dispatch(sendReviewMessage({ content: prefill, context }));
          setInput('');
        }, 100);
      }
    }
  }, [prefill, autoSend, context, dispatch]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    dispatch(sendReviewMessage({ content: input.trim(), context }));
    setInput('');
  }, [input, isStreaming, context, dispatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleClear = useCallback(() => {
    dispatch(clearMessages());
  }, [dispatch]);

  const handleSaveEdits = useCallback(() => {
    // Get the edited content from redux and call onSave
    // For now, just reset the edits
    if (onSave) {
      // TODO: Get actual edited content from slice
      onSave('');
    }
    dispatch(resetEditedContent());
  }, [onSave, dispatch]);

  const handleDiscardEdits = useCallback(() => {
    dispatch(resetEditedContent());
  }, [dispatch]);

  return (
    <div style={styles.container}>
      {/* Messages panel (when open and has messages) */}
      {isOpen && messages.length > 0 && (
        <div style={styles.messagesPanel}>
          <div style={styles.messagesHeader}>
            <span style={styles.headerTitle}>Review Assistant</span>
            <div style={styles.headerActions}>
              <button
                onClick={() => setIsOpen(false)}
                style={styles.headerButton}
                title="Minimize"
              >
                _
              </button>
              <button
                onClick={handleClear}
                style={styles.headerButton}
                disabled={isStreaming}
                title="Clear conversation"
              >
                x
              </button>
            </div>
          </div>

          <div style={styles.messagesContainer}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  ...styles.message,
                  ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
                }}
              >
                <div style={styles.messageRole}>
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div style={styles.messageContent}>{msg.content}</div>
              </div>
            ))}
            {isStreaming && (
              <div style={styles.streamingIndicator}>
                <span style={styles.streamingDot}>.</span>
                <span style={styles.streamingDot}>.</span>
                <span style={styles.streamingDot}>.</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Edit notification bar */}
      {hasEdits && (
        <div style={styles.editBar}>
          <span style={styles.editText}>Model made changes to the document</span>
          <div style={styles.editActions}>
            <button
              onClick={handleDiscardEdits}
              style={styles.discardButton}
              disabled={isSaving}
            >
              Discard
            </button>
            <button
              onClick={handleSaveEdits}
              style={styles.saveButton}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div style={styles.inputContainer}>
        {!isOpen && messages.length > 0 && (
          <button
            onClick={() => setIsOpen(true)}
            style={styles.minimizedIndicator}
          >
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </button>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Ask the review assistant..."
          style={styles.input}
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          style={{
            ...styles.sendButton,
            opacity: !input.trim() || isStreaming ? 0.5 : 1,
          }}
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: '600px',
    zIndex: 100,
  },
  messagesPanel: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    border: '1px solid #e2e8f0',
    marginBottom: '8px',
    overflow: 'hidden',
  },
  messagesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#334155',
  },
  headerActions: {
    display: 'flex',
    gap: '4px',
  },
  headerButton: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContainer: {
    maxHeight: '300px',
    overflowY: 'auto',
    padding: '12px',
  },
  message: {
    marginBottom: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
  },
  userMessage: {
    backgroundColor: '#f1f5f9',
    marginLeft: '24px',
  },
  assistantMessage: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    marginRight: '24px',
  },
  messageRole: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  messageContent: {
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#1e293b',
    whiteSpace: 'pre-wrap',
  },
  streamingIndicator: {
    padding: '8px 12px',
    color: '#64748b',
    fontSize: '18px',
  },
  streamingDot: {
    animation: 'blink 1.4s infinite both',
    animationDelay: 'calc(var(--i, 0) * 0.2s)',
  },
  errorBanner: {
    padding: '10px 14px',
    backgroundColor: '#fef2f2',
    borderTop: '1px solid #fecaca',
    color: '#dc2626',
    fontSize: '12px',
  },
  editBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  editText: {
    fontSize: '12px',
    color: '#b45309',
    fontWeight: 500,
  },
  editActions: {
    display: 'flex',
    gap: '8px',
  },
  discardButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #dc2626',
    backgroundColor: 'transparent',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e2e8f0',
  },
  minimizedIndicator: {
    fontSize: '11px',
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '8px',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    resize: 'none',
    maxHeight: '120px',
    lineHeight: 1.5,
    padding: '4px 0',
  },
  sendButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#f59e0b',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
};

export default DockedChat;
