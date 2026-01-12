# okrapdf-desktop

## Goals

- ComfyUI & n8n for PDF data workflow
- Complete isolation from cloud instance. no shared files or user
- BYOK, no login or pdf upload to okrapdf.com
- make sure wahtever auth and API keys I need to add they're all encaspulated in the plugins/workflow nodes like our ref libraries never our own. Even OpenRouter and Anthropic API Key should be encapsulated as plugins later on
- When asked for a feature or change code, refer to ~/dev/okrapdf for more context as we are only trying to reach parity
- Take advantage of local file system to surface new files and let user know this

## Architecture

- Refer to plugins and workflow nodes in ~/dev/okrapdf so we build these VLM/OCR behaviors with good modularity
- Modularity of workflow allows people to share them like n8n workflows
- Modularity of plugins allow users to share them in cloud and local

## Plugins

- Very important all OCR capabilities are plugins or worfklow nodes
- vscode, n8n, comfyui, even opencode desktop and cli. very pluggable for agentic behavior

## UI/Design Rules

- Never use purple for icons or primary UI elements
- Stick to the okra color palette: okra-yellow, cream, ink, slate

## Developing

- Use references skills for the quailty open source project

## References

Can deepwiki, or grep source code if helpful

- https://github.com/Stirling-Tools/Stirling-PDF
- https://github.com/JackieXie168/skim
- https://github.com/ahrm/sioyek

CLI libraries

- docling

Always think about how to integrate these cli and libraries into UX stateful experiences via bounding boxes and passing context ref to agents to be ai agent native like ~/dev/okrapdf
