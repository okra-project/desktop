# OkraPDF Desktop

AI-powered PDF and spreadsheet processing desktop application with built-in Claude AI capabilities.

## What is OkraPDF Desktop?

OkraPDF Desktop is a powerful desktop application that combines AI capabilities with document processing. Built with Electron and powered by Claude AI, it allows you to:

- Create and manipulate Excel spreadsheets with AI assistance
- Process and analyze PDF documents
- Generate complex spreadsheets with formulas, formatting, and multiple sheets
- Analyze and extract insights from existing documents
- Work with Word documents and other office formats

## Features

- **AI-Powered Processing**: Claude AI handles complex document tasks
- **No API Key Required**: Pre-configured API access included
- **Spreadsheet Generation**: Create sophisticated Excel workbooks
- **Formula Management**: Automatic formula calculations and formatting
- **Professional Styling**: Headers, colors, borders, and conditional formatting
- **Multi-Sheet Workbooks**: Create complex workbooks with multiple sheets
- **Document Analysis**: Extract insights from PDFs and spreadsheets
- **Desktop Integration**: Native desktop application for Mac, Windows, and Linux

## Installation

### For End Users

Download the installer for your platform from the releases page:

- **macOS**: Download the `.dmg` file
- **Windows**: Download the `.exe` installer
- **Linux**: Download the `.AppImage` file

No additional setup required - just install and run!

### For Developers

Prerequisites:
- [Node.js 18+](https://nodejs.org)
- npm or bun

Installation steps:

```bash
# Clone the repository
git clone https://github.com/steventsao/okrapdf-desktop.git
cd okrapdf-desktop

# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run package
```

## Usage

1. Launch OkraPDF Desktop
2. Type your request in the message box (e.g., "Create a monthly budget tracker")
3. Optionally attach files (Excel, PDF, Word) for analysis
4. Claude AI will process your request and generate the documents
5. Download the generated files to your preferred location

## Building Installers

To create distribution packages:

```bash
# Build for your current platform
npm run package

# Installers will be created in the release/build directory
```

The build process creates installers with the pre-configured API key bundled in.

## Project Structure

```
okrapdf-desktop/
├── agent/              # Working directory for document generation
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # React UI components
│   └── config/        # API configuration
└── package.json
```

## Support

For support, please contact support@okrapdf.com

## License

Proprietary - OkraPDF Desktop

---

Built with [Claude AI](https://www.anthropic.com/claude) and [Electron](https://www.electronjs.org/)
