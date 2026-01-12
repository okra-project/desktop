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

### Plugin Architecture Reference (from ComfyUI)

ComfyUI's node system is the gold standard for visual workflow plugins:

```
custom_nodes/
  my-ocr-plugin/
    __init__.py          # exports comfy_entrypoint()
    nodes.py             # node class definitions
    pyproject.toml       # metadata
```

**Node Structure:**
```python
class MyOcrNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="okra.ocr.openrouter",
            display_name="OpenRouter OCR",
            category="okra/ocr",
            inputs=[
                io.Image("image"),
                io.String("model", default="qwen/qwen2-vl"),
                io.String("prompt", multiline=True),
            ],
            outputs=[
                io.String("text"),
                io.JSON("bboxes"),
            ]
        )

    @classmethod
    def execute(cls, image, model, prompt):
        # node logic here
        return {"text": result, "bboxes": boxes}
```

**Registration:**
```python
# V3 style (preferred)
async def comfy_entrypoint() -> ComfyExtension:
    return MyOcrExtension()

# V1 style (legacy, still supported)
NODE_CLASS_MAPPINGS = {"MyOcrNode": MyOcrNode}
```

**Key patterns:**
- Schema-first: inputs/outputs declared upfront for UI generation
- Stateless execute: no instance state, pure function
- Category hierarchy: `category="okra/ocr"` for menu organization
- Discovery: scans `custom_nodes/` on startup

### Desktop App Reference (from Jan)

Jan uses Tauri (Rust) not Electron but patterns apply:
- Frameless window with custom titlebar drag region
- `pointer-events: none` on drag overlay so clicks pass through
- Extensions as separate packages with manifest

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
1. Zotero (The Plugin Powerhouse)
While primarily a reference manager, Zotero 7 contains a built-in PDF reader that is arguably the most extensible in the world. Because Zotero is built on web technologies, its plugin ecosystem is massive.

Why it’s hackable: You can write plugins in JavaScript. There are hundreds of community-made tools that add features like AI summarization, automatic file renaming, and deep integration with note-taking apps.

Best for: Academic research and users who want to treat their PDF library as a database.

Highlight: The Zotero PDF Background or ZotMoov plugins allow for extreme customization of how files and annotations are handled.

2. Skim (The Automation Specialist)
Skim is an open-source PDF reader designed specifically for academics. It is famous for being the most "Mac-native" extensible app because of its deep support for AppleScript.

Why it’s hackable: Almost every action in Skim can be triggered via AppleScript. It also supports "Templates," allowing you to export your notes and highlights into any format (Markdown, LaTeX, HTML) by writing a simple text template.

Best for: Power users who want to build complex macOS Shortcuts or automation workflows.

Highlight: It doesn't modify the original PDF when saving notes (unless you want it to), keeping your files "clean" while storing metadata separately.

3. Ipe (The "ipelet" System)
Ipe is a specialized PDF editor used mostly by scientists and developers. It’s a drawing editor that produces "pure" PDFs.

Why it’s hackable: It features a plugin system called "ipelets" written in Lua. You can write your own ipelets to automate geometric drawings, batch-process text, or integrate with LaTeX.

Best for: Technical users, mathematicians, and developers who need to create or edit figures within PDFs using code.

Highlight: Full LaTeX integration—you can write equations directly in the PDF and they render using your local TeX distribution.

4. Stirling-PDF (The Self-Hosted / API King)
If your definition of "hackable" involves web-based architectures and APIs, Stirling-PDF is the industry leader. It is a locally hosted web app that you can run on your Mac via Docker.

Why it’s hackable: It offers a massive REST API. You can write Python scripts or shell commands to interact with it to merge, split, OCR, or redact PDFs automatically.

Best for: Developers who want to build their own custom PDF processing pipeline.

Highlight: It provides over 50+ tools (OCR, conversion, security) that are entirely open-source and privacy-focused.

CLI libraries

- docling

Always think about how to integrate these cli and libraries into UX stateful experiences via bounding boxes and passing context ref to agents to be ai agent native like ~/dev/okrapdf
