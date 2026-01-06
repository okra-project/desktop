import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ContentBlock } from './types';
import ToolUseDisplay from './ToolUseDisplay';
import ThinkingDisplay from './ThinkingDisplay';

interface MessageProps {
  message: ChatMessage;
}

// Custom component for code blocks
function CodeComponent({ inline, className, children }: any) {
  if (inline) {
    return (
      <code className="bg-lavender/50 rounded px-1 py-0.5 text-sm font-mono text-ink">
        {children}
      </code>
    );
  }
  return (
    <pre className="bg-ink text-cream rounded-md p-3 overflow-x-auto font-mono">
      <code className={className}>{children}</code>
    </pre>
  );
}

// Custom component for links
function LinkComponent({ children, href }: any) {
  return (
    <a
      className="text-okra-orange hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      href={href}
    >
      {children}
    </a>
  );
}

// Custom component for paragraphs
function ParagraphComponent({ children }: any) {
  return <p className="mb-2 last:mb-0">{children}</p>;
}

// Custom component for unordered lists
function UnorderedListComponent({ children }: any) {
  return <ul className="list-disc pl-4 mb-2">{children}</ul>;
}

// Custom component for ordered lists
function OrderedListComponent({ children }: any) {
  return <ol className="list-decimal pl-4 mb-2">{children}</ol>;
}

function Message({ message }: MessageProps) {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';

  const getMessageStyle = () => {
    if (isUser) {
      return 'text-ink'; 
    }
    if (isError) {
      return 'bg-red-50 text-red-700 border border-red-200';
    }
    return 'bg-white text-ink border border-sidebar-border';
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'download-file',
        filePath,
      );
      if (result.success) {
        console.log(`File downloaded successfully: ${result.savedPath}`);
      } else {
        console.error('Download failed:', result.error);
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleOpenOutputDirectory = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'open-output-directory',
      );
      if (!result.success) {
        console.error('Failed to open directory:', result.error);
      }
    } catch (error) {
      console.error('Error opening directory:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`max-w-[80%] rounded-lg px-4 py-3 ${getMessageStyle()}`}
        style={isUser ? {backgroundColor: 'var(--color-okra-yellow)'} : undefined}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div>
            {/* Render structured content blocks if available */}
            {message.contentBlocks && message.contentBlocks.length > 0 ? (
              message.contentBlocks.map((block: ContentBlock, index: number) => {
                if (block.type === 'text') {
                  return (
                    <div key={index} className="prose prose-sm max-w-none prose-p:text-ink prose-headings:text-ink prose-strong:text-ink prose-code:text-ink">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: CodeComponent,
                          a: LinkComponent,
                          p: ParagraphComponent,
                          ul: UnorderedListComponent,
                          ol: OrderedListComponent,
                        }}
                      >
                        {block.text || '...'}
                      </ReactMarkdown>
                    </div>
                  );
                } else if (block.type === 'tool_use') {
                  return <ToolUseDisplay key={index} toolUse={block} />;
                } else if (block.type === 'thinking') {
                  return <ThinkingDisplay key={index} thinking={block} />;
                }
                return null;
              })
            ) : (
              /* Fallback to simple content rendering for backward compatibility */
              <div className="prose prose-sm max-w-none prose-p:text-ink prose-headings:text-ink prose-strong:text-ink prose-code:text-ink">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: CodeComponent,
                    a: LinkComponent,
                    p: ParagraphComponent,
                    ul: UnorderedListComponent,
                    ol: OrderedListComponent,
                  }}
                >
                  {message.content || '...'}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Output Files Section */}
        {message.outputFiles && message.outputFiles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-sidebar-border">
            <h4 className="text-sm font-medium text-ink mb-2">
              📁 Output Files ({message.outputFiles.length})
            </h4>
            <div className="space-y-2">
              {message.outputFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-white rounded-md p-2 border border-sidebar-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {file.name}
                    </div>
                    <div className="text-xs text-sidebar-text">
                      {formatFileSize(file.size)} •{' '}
                      {new Date(file.created).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadFile(file.path, file.name)}
                    className="ml-2 px-3 py-1 text-xs text-white rounded hover:opacity-90 transition-colors bg-okra-orange"
                    title={`Download ${file.name}`}
                  >
                    Download
                  </button>
                </div>
              ))}
              <button
                onClick={handleOpenOutputDirectory}
                className="w-full text-xs text-sidebar-text hover:text-ink underline mt-1"
              >
                📂 Open output folder
              </button>
            </div>
          </div>
        )}


        <div
          className={`text-xs mt-2 ${isUser ? 'text-ink/70' : 'text-sidebar-text'}`}
        >
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default Message;
