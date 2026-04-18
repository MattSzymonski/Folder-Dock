# Folder Dock - VS Code Extension

VS Code extension for bookmarking folders and files, opening them in any VS Code window, and previewing folder contents with Workview.

<!-- <p align="left">
  <img src="media/usage.gif" img width=100%>
</p> -->

## Features

### Bookmarks

Save frequently used folders and files as bookmarks for quick access. Bookmarks appear in a dedicated **Bookmarks** panel in the Explorer sidebar.

- **Add Bookmark** — Click the `+` button in the Bookmarks panel header to bookmark a folder or file. You'll be prompted to choose a type (folder/file), enter a name, and select the path.
- **Edit Bookmark** — Click the pencil icon on any bookmark to change its name or path.
- **Remove Bookmark** — Click the trash icon on any bookmark to delete it.

### Open Folder

Quickly open any folder from the Explorer context menu or from bookmarks:

- **Open in Current Window** — Right-click a folder in the Explorer or a bookmarked folder and select "Open This Folder in This VS Code Window" to replace the current workspace.
- **Open in New Window** — Select "Open This Folder in New VS Code Window" to open the folder in a separate VS Code instance.

### Workview

Preview the contents of a folder without switching your workspace. Workview opens a read-only file tree in the Explorer sidebar.

- **Open in Workview** — Right-click a folder in the Explorer or a bookmarked folder and select "Open in Workview". The folder's contents appear in a collapsible tree.
- **Browse files** — Expand directories and click files to open them in the editor.
- **Close Workview** — Click the close button in the Workview panel header to dismiss it.
- The currently active Workview folder is highlighted with an eye icon in the Bookmarks panel.

### Open File

Bookmarked files can be opened directly by right-clicking and selecting "Open File" from the context menu.

## Installation

1. [Download the latest `.vsix` file](https://github.com/MattSzymonski/Folder-Dock/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`)
3. Choose **"Extensions: Install from VSIX..."**
4. Select the downloaded `.vsix` file

## Configuration

Bookmarks are stored in a `bookmarks.json` file. The storage location depends on the environment:

1. **Locally** — Automatically stored in VS Code's global storage. No configuration needed.
2. **SSH / Remote** — On first activation, the extension prompts you to set a storage path on the server (e.g. `/home/user/.vscode`).

In both cases, the storage path can be set manually in settings:

```json
"folder-dock.bookmarksStoragePath": "/absolute/path/to/storage/directory"
```

## Commands

| Command                                   | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| `Open This Folder in This VS Code Window` | Open a folder in the current window        |
| `Open This Folder in New VS Code Window`  | Open a folder in a new window              |
| `Add Bookmark`                            | Bookmark a folder or file                  |
| `Edit`                                    | Edit a bookmark's name or path             |
| `Remove`                                  | Delete a bookmark                          |
| `Open File`                               | Open a bookmarked file                     |
| `Open in Workview`                        | Preview a folder's contents in the sidebar |
| `Close Workview`                          | Dismiss the Workview panel                 |

## Development

### Coding and Building

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the project
4. Press `F5` to launch the Extension Development Host for testing
5. Run `npx @vscode/vsce package` to build a `.vsix` file

### Publishing a Release

Use `release_version.sh` script or manually:

1. Update the `version` field in `package.json`
2. Build the `.vsix` file: `npx @vscode/vsce package`
3. Go to [Folder-Dock Releases](https://github.com/MattSzymonski/Folder-Dock/releases)
4. Click **"Draft a new release"**
5. Click **"Choose a tag"** and create a new tag matching the version (e.g. `v1.1.0`)
6. Set the release title (e.g. `v1.1.0`)
7. Describe the changes in the release notes
8. Attach the built `.vsix` file by dragging it into the assets area
9. Click **"Publish release"**