// This file registers all VS Code commands contributed by the Folder Dock extension.
// Responsibilities:
// - Provides command registrars grouped by domain: Workview, Workview files, folders, bookmarks, terminals
// - Bridges UI actions (context menus, buttons) to `BookmarkProvider` and `WorkviewProvider`
// - Implements file/folder operations: open, reveal, create, rename, delete, copy path
// - Handles opening external terminals and integrated terminals at a target path
// - Normalizes command arguments coming from URIs, `BookmarkItem`s, and `WorkviewItem`s
// Depends on: VS Code API, Node `fs`/`path`, and the providers/items from sibling modules.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BookmarkItem, BookmarkProvider } from './bookmarkProvider';
import { WorkviewItem, WorkviewProvider } from './workviewProvider';

// Normalizes the heterogeneous arguments command callbacks may receive.
// VS Code menus pass `Uri`s for Explorer entries, while our tree views pass their
// own item classes. Returns the absolute path or undefined when the input is unusable.
function resolveTargetPath(arg: vscode.Uri | BookmarkItem | WorkviewItem): string | undefined {
    if (arg instanceof BookmarkItem) { return arg.bookmark.path; }
    if (arg instanceof WorkviewItem) { return arg.filePath; }
    return arg?.fsPath;
}

// Registers commands that mount/unmount folders in the Workview panel and
// open files from it without triggering the workspace Explorer's auto-reveal.
export function registerWorkviewCommands(
    workviewProvider: WorkviewProvider,
    bookmarkProvider: BookmarkProvider
): vscode.Disposable[] {
    // Set the Workview root to the selected folder and reveal the panel.
    // Also informs the BookmarkProvider so the matching bookmark gains the active marker.
    const openInWorkview = vscode.commands.registerCommand('folder-dock.openInWorkview', (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { return; }
        workviewProvider.setRoot(targetPath);
        bookmarkProvider.setActiveWorkviewPath(targetPath);
        vscode.commands.executeCommand('folderDockWorkview.focus');
    });

    // Unmount the current Workview folder and clear the active-bookmark indicator.
    const closeWorkview = vscode.commands.registerCommand('folder-dock.closeWorkview', () => {
        workviewProvider.clear();
        bookmarkProvider.setActiveWorkviewPath(undefined);
    });

    // Opens a file in an editor while temporarily disabling Explorer auto-reveal,
    // preventing the workspace Explorer from jumping to and selecting the file.
    // The flag also tells `extension.ts` to not refresh the Workview selection.
    const openWorkviewFile = vscode.commands.registerCommand('folder-dock.openWorkviewFile', async (uri: vscode.Uri) => {
        const config = vscode.workspace.getConfiguration('explorer');
        const prev = config.get('autoReveal');
        await config.update('autoReveal', false, vscode.ConfigurationTarget.Global);
        workviewProvider.isFileOpening = true;
        await vscode.commands.executeCommand('vscode.open', uri);
        workviewProvider.isFileOpening = false;
        // Restore the user's original auto-reveal setting regardless of whether the open succeeded.
        await config.update('autoReveal', prev, vscode.ConfigurationTarget.Global);
    });

    return [openInWorkview, closeWorkview, openWorkviewFile];
}

// Registers file-system mutation commands targeting items inside the Workview panel:
// create file, create folder, rename, delete, copy path, reveal in OS, and reveal in Explorer.
// Each command operates synchronously on disk and refreshes the tree on success.
export function registerWorkviewFileCommands(workviewProvider: WorkviewProvider): vscode.Disposable[] {
    // Creates an empty file next to (or inside) the targeted item, then opens it.
    // Refuses to overwrite if a file with that name already exists.
    const newFile = vscode.commands.registerCommand('folder-dock.workviewNewFile', async (item?: WorkviewItem) => {
        if (!item) { return; }
        const dir = item.isDirectory ? item.filePath : path.dirname(item.filePath);
        const name = await vscode.window.showInputBox({ prompt: 'New file name' });
        if (!name) { return; }
        const filePath = path.join(dir, name);
        if (fs.existsSync(filePath)) { vscode.window.showWarningMessage('File already exists.'); return; }
        // Ensure the parent path exists in case the user typed nested segments.
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '', 'utf-8');
        workviewProvider.refresh();
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    });

    // Creates an empty directory next to (or inside) the targeted item.
    // Refuses to overwrite if a folder with that name already exists.
    const newFolder = vscode.commands.registerCommand('folder-dock.workviewNewFolder', async (item?: WorkviewItem) => {
        if (!item) { return; }
        const dir = item.isDirectory ? item.filePath : path.dirname(item.filePath);
        const name = await vscode.window.showInputBox({ prompt: 'New folder name' });
        if (!name) { return; }
        const folderPath = path.join(dir, name);
        if (fs.existsSync(folderPath)) { vscode.window.showWarningMessage('Folder already exists.'); return; }
        fs.mkdirSync(folderPath, { recursive: true });
        workviewProvider.refresh();
    });

    // Renames the selected file or folder in place. Aborts on cancel, no change, or name collision.
    const rename = vscode.commands.registerCommand('folder-dock.workviewRename', async (item: WorkviewItem) => {
        if (!item) { return; }
        const oldName = path.basename(item.filePath);
        const newName = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
        if (!newName || newName === oldName) { return; }
        const newPath = path.join(path.dirname(item.filePath), newName);
        if (fs.existsSync(newPath)) { vscode.window.showWarningMessage('An item with that name already exists.'); return; }
        fs.renameSync(item.filePath, newPath);
        workviewProvider.refresh();
    });

    // Deletes the selected entry after a modal confirmation.
    // Folders are removed recursively; files use a single unlink call.
    const deleteItem = vscode.commands.registerCommand('folder-dock.workviewDelete', async (item: WorkviewItem) => {
        if (!item) { return; }
        const name = path.basename(item.filePath);
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${name}"?`,
            { modal: true },
            'Delete'
        );
        if (confirm !== 'Delete') { return; }
        if (item.isDirectory) {
            fs.rmSync(item.filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(item.filePath);
        }
        workviewProvider.refresh();
    });

    // Copies the absolute path of the targeted item to the system clipboard.
    const copyPath = vscode.commands.registerCommand('folder-dock.workviewCopyPath', (item: WorkviewItem) => {
        if (!item) { return; }
        vscode.env.clipboard.writeText(item.filePath);
    });

    // Reveals the targeted item in the operating system's file manager.
    const revealInOS = vscode.commands.registerCommand('folder-dock.workviewRevealInOS', (item: WorkviewItem) => {
        if (!item) { return; }
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.filePath));
    });

    // Reveals and selects the targeted item in the workspace Explorer view.
    const selectInExplorer = vscode.commands.registerCommand('folder-dock.workviewSelectInExplorer', (item: WorkviewItem) => {
        if (!item) { return; }
        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(item.filePath));
    });

    return [newFile, newFolder, rename, deleteItem, copyPath, revealInOS, selectInExplorer];
}

// Registers commands for opening folders and files from bookmarks/Explorer
// either in the current VS Code window or a fresh one.
export function registerFolderCommands(): vscode.Disposable[] {
    // Replaces the current workspace with the selected folder.
    const openInCurrentWindow = vscode.commands.registerCommand('folder-dock.openFolderInCurrentWindow', async (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { vscode.window.showErrorMessage('No folder selected.'); return; }
        const folderUri = vscode.Uri.file(targetPath);
        const success = await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
        if (!success) { vscode.window.showErrorMessage(`Could not open folder: ${targetPath}`); }
    });

    // Opens the selected folder in a new VS Code window, leaving the current one untouched.
    const openInNewWindow = vscode.commands.registerCommand('folder-dock.openFolderInNewWindow', async (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { vscode.window.showErrorMessage('No folder selected.'); return; }
        const folderUri = vscode.Uri.file(targetPath);
        const success = await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
        if (!success) { vscode.window.showErrorMessage(`Could not open folder: ${targetPath}`); }
    });

    // Opens a file bookmark in an editor. Restricted to BookmarkItem inputs (Bookmarks panel only).
    const openFile = vscode.commands.registerCommand('folder-dock.openFile', async (arg: BookmarkItem) => {
        if (!(arg instanceof BookmarkItem)) { return; }
        const fileUri = vscode.Uri.file(arg.bookmark.path);
        await vscode.commands.executeCommand('vscode.open', fileUri);
    });

    return [openInCurrentWindow, openInNewWindow, openFile];
}

// Registers terminal-related commands and keeps the `folderDockTerminalActive`
// context flag in sync so menu items can show only when a terminal is open.
export function registerTerminalCommands(): vscode.Disposable[] {
    // Picks the directory to use as terminal CWD.
    // For files, falls back to their containing folder; otherwise uses the path itself.
    function resolveTerminalDir(arg: vscode.Uri | BookmarkItem): string | undefined {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { return undefined; }
        return fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
    }

    // Spawns a brand-new integrated terminal rooted at the selected directory.
    const openInNewTerminal = vscode.commands.registerCommand('folder-dock.openInNewTerminal', (arg: vscode.Uri | BookmarkItem) => {
        const dir = resolveTerminalDir(arg);
        if (!dir) { return; }
        const terminal = vscode.window.createTerminal({ cwd: dir });
        terminal.show();
    });

    // Reuses the active terminal by sending a `cd` command into it.
    // No-op when no terminal is currently active.
    const openInTerminal = vscode.commands.registerCommand('folder-dock.openInTerminal', (arg: vscode.Uri | BookmarkItem) => {
        const dir = resolveTerminalDir(arg);
        if (!dir) { return; }
        const terminal = vscode.window.activeTerminal;
        if (!terminal) { return; }
        terminal.sendText(`cd "${dir}"`);
        terminal.show();
    });

    // Recomputes the boolean context flag indicating whether at least one terminal exists.
    // Drives `when`-clauses in package.json that gate the "open in active terminal" command.
    const updateTerminalContext = () => {
        vscode.commands.executeCommand('setContext', 'folderDockTerminalActive', vscode.window.terminals.length > 0);
    };
    updateTerminalContext();
    const onOpen = vscode.window.onDidOpenTerminal(updateTerminalContext);
    const onClose = vscode.window.onDidCloseTerminal(updateTerminalContext);

    return [openInNewTerminal, openInTerminal, onOpen, onClose];
}

// Registers commands that manipulate the bookmark list (CRUD + reorder + quick pick).
// All commands defer to `BookmarkProvider`, which handles persistence and refresh.
export function registerBookmarkCommands(bookmarkProvider: BookmarkProvider): vscode.Disposable[] {
    // Top-level "Add Bookmark" entry: opens the OS file picker to choose a target,
    // prompts for a display name, and stores the bookmark.
    // Triggers the storage-path setup flow first if no storage is configured.
    const add = vscode.commands.registerCommand('folder-dock.addBookmark', async () => {
        if (!bookmarkProvider.isReady()) {
            const configured = await bookmarkProvider.promptForStoragePath();
            if (!configured) { return; }
        }

        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        const uris = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Select',
            defaultUri
        });
        if (!uris || uris.length === 0) { return; }

        const selectedPath = uris[0].fsPath;
        const type = fs.statSync(selectedPath).isDirectory() ? 'folder' : 'file';
        const defaultName = path.basename(selectedPath);

        const name = await vscode.window.showInputBox({ prompt: 'Set bookmark name', value: defaultName });
        if (!name) { return; }

        bookmarkProvider.addBookmark(name, selectedPath, type);
    });

    // Context-menu variant: derives the target from the right-clicked item (Explorer URI or Workview item)
    // instead of asking the user to pick a path manually.
    const addFromContext = vscode.commands.registerCommand('folder-dock.addToBookmarks', async (arg: vscode.Uri | WorkviewItem) => {
        if (!arg) { return; }

        if (!bookmarkProvider.isReady()) {
            const configured = await bookmarkProvider.promptForStoragePath();
            if (!configured) { return; }
        }

        const selectedPath = arg instanceof WorkviewItem ? arg.filePath : arg.fsPath;
        const type = fs.statSync(selectedPath).isDirectory() ? 'folder' : 'file';
        const defaultName = path.basename(selectedPath);

        const name = await vscode.window.showInputBox({ prompt: 'Set bookmark name', value: defaultName });
        if (!name) { return; }

        bookmarkProvider.addBookmark(name, selectedPath, type);
    });

    // Removes the bookmark behind the selected tree item.
    const remove = vscode.commands.registerCommand('folder-dock.removeBookmark', (item: BookmarkItem) => {
        bookmarkProvider.removeBookmark(item.bookmark);
    });

    // Launches the interactive edit flow (rename + change path) on the selected bookmark.
    const edit = vscode.commands.registerCommand('folder-dock.editBookmark', (item: BookmarkItem) => {
        bookmarkProvider.editBookmark(item.bookmark);
    });

    // Reorders the selected bookmark one slot earlier in the list.
    const moveUp = vscode.commands.registerCommand('folder-dock.moveBookmarkUp', (item: BookmarkItem) => {
        bookmarkProvider.moveUp(item.bookmark);
    });

    // Reorders the selected bookmark one slot later in the list.
    const moveDown = vscode.commands.registerCommand('folder-dock.moveBookmarkDown', (item: BookmarkItem) => {
        bookmarkProvider.moveDown(item.bookmark);
    });

    // Re-reads bookmarks from disk; useful when the JSON file was edited externally.
    const reload = vscode.commands.registerCommand('folder-dock.reloadBookmarks', () => {
        bookmarkProvider.reload();
    });

    // Quick Pick palette over all bookmarks.
    // - Files are opened in the editor.
    // - Folders are revealed in the workspace Explorer.
    // - Shows an info message instead when the list is empty.
    const pick = vscode.commands.registerCommand('folder-dock.pickBookmark', async () => {
        const bookmarks = bookmarkProvider.getBookmarks();
        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks saved.');
            return;
        }
        // Map each bookmark to a Quick Pick row, embedding the model object on each item.
        const items = bookmarks.map(b => ({
            label: `$(${b.type === 'file' ? 'file' : 'folder'}) ${b.name}`,
            description: b.path,
            bookmark: b
        }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a bookmark' });
        if (!selected) { return; }
        const b = selected.bookmark;
        if (b.type === 'file') {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(b.path));
        } else {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(b.path));
        }
    });

    return [add, addFromContext, remove, edit, moveUp, moveDown, reload, pick];
}
