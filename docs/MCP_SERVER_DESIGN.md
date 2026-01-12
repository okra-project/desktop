# MCP Server for OkraPDF Desktop

## Summary

Expose document context to external LLMs (Claude Desktop, Continue.dev, Ollama) via local MCP server.

**Pattern**: Jan/VSCode style - Settings toggle, default OFF, HTTP server on localhost.

---

## Phase 1: Minimal E2E

### What we're building

- **One tool**: `get_current_document` → `{ name, path, pageCount }`
- **Toggle in Settings**: Default OFF
- **HTTP server**: `http://127.0.0.1:4242/mcp`

---

### File: `src/main/mcp-server.ts`

```typescript
import express from 'express';
import type { Server as HttpServer } from 'http';

let httpServer: HttpServer | null = null;

interface DocumentInfo {
  name: string;
  path: string;
  pageCount: number;
}

export async function startMcpServer(
  getDocument: () => DocumentInfo | null,
  port = 4242,
): Promise<number> {
  if (httpServer) return port;

  const app = express();
  app.use(express.json());

  app.post('/mcp', (req, res) => {
    try {
      const { method, id, params } = req.body;

      if (method === 'initialize') {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'okrapdf-desktop', version: '1.0.0' },
          },
        });
      }

      if (method === 'tools/list') {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'get_current_document',
                description: 'Get the currently open document',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        });
      }

      if (method === 'tools/call' && params?.name === 'get_current_document') {
        const doc = getDocument();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: doc ? JSON.stringify(doc) : 'No document open',
              },
            ],
          },
        });
      }

      res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' },
      });
    } catch (err) {
      console.error('[MCP] Error:', err);
      res
        .status(500)
        .json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal error' },
        });
    }
  });

  app.get('/health', (_, res) => res.json({ ok: true, port }));

  return new Promise((resolve) => {
    httpServer = app.listen(port, '127.0.0.1', () => {
      console.log(`[MCP] http://127.0.0.1:${port}/mcp`);
      resolve(port);
    });
  });
}

export function stopMcpServer() {
  httpServer?.close();
  httpServer = null;
}

export function isMcpRunning() {
  return httpServer !== null;
}
```

---

### Main process: `src/main/main.ts`

```typescript
import { startMcpServer, stopMcpServer, isMcpRunning } from './mcp-server';

// On app ready
app.whenReady().then(() => {
  if (store.get('mcpServerEnabled', false)) {
    startMcpServer(getCurrentDocument);
  }
});

function getCurrentDocument() {
  if (!currentWorkspacePath) return null;
  try {
    const meta = JSON.parse(
      fs.readFileSync(
        path.join(currentWorkspacePath, 'metadata.json'),
        'utf-8',
      ),
    );
    return {
      name: meta.fileName,
      path: currentWorkspacePath,
      pageCount: meta.pageCount || 0,
    };
  } catch {
    return null;
  }
}

// IPC handlers
ipcMain.handle('mcp:get-status', () => ({
  enabled: store.get('mcpServerEnabled', false),
  running: isMcpRunning(),
  port: 4242,
  endpoint: 'http://127.0.0.1:4242/mcp',
}));

ipcMain.handle('mcp:set-enabled', async (_, enabled: boolean) => {
  store.set('mcpServerEnabled', enabled);
  if (enabled) await startMcpServer(getCurrentDocument);
  else stopMcpServer();
  return { ok: true, running: isMcpRunning() };
});
```

---

### Settings UI

```tsx
const [status, setStatus] = useState({
  enabled: false,
  running: false,
  endpoint: '',
});

useEffect(() => {
  window.electron.ipcRenderer.invoke('mcp:get-status').then(setStatus);
}, []);

const toggle = async () => {
  const result = await window.electron.ipcRenderer.invoke(
    'mcp:set-enabled',
    !status.enabled,
  );
  setStatus((prev) => ({
    ...prev,
    enabled: !prev.enabled,
    running: result.running,
  }));
};

// Render
<Toggle checked={status.enabled} onChange={toggle} label="MCP Server" />;
{
  status.enabled && <code>{status.endpoint}</code>;
}
```

---

## Test

```bash
curl http://127.0.0.1:4242/health

curl -X POST http://127.0.0.1:4242/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -X POST http://127.0.0.1:4242/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_current_document"}}'
```

---

## Claude Desktop Config

```json
{
  "mcpServers": {
    "okrapdf": {
      "url": "http://127.0.0.1:4242/mcp"
    }
  }
}
```

---

## Phase 2: Add tools

- `search` - grep through `ocr/*.md`
- `find` - query tables from `tables/manifest.json`

## Phase 3: UI feedback

- Status indicator in toolbar
- Activity log panel
