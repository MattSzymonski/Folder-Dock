import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BookmarkItem, BookmarkProvider } from './bookmarkProvider';
import { WorkviewProvider } from './workviewProvider';

/** Extracts the filesystem path from either a URI (explorer context menu) or a BookmarkItem. */
function resolveTargetPath(arg: vscode.Uri | BookmarkItem): string | undefined {
    return arg instanceof BookmarkItem ? arg.bookmark.path : arg?.fsPath;
}

/** Registers commands for opening/closing the Workview panel. */
export function registerWorkviewCommands(
    workviewProvider: WorkviewProvider,
    bookmarkProvider: BookmarkProvider
): vscode.Disposable[] {
    const openInWorkview = vscode.commands.registerCommand('folder-dock.openInWorkview', (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { return; }
        workviewProvider.setRoot(targetPath);
        bookmarkProvider.setActiveWorkviewPath(targetPath);
        vscode.commands.executeCommand('folderDockWorkview.focus');
    });

    const closeWorkview = vscode.commands.registerCommand('folder-dock.closeWorkview', () => {
        workviewProvider.clear();
        bookmarkProvider.setActiveWorkviewPath(undefined);
    });

    const openWorkviewFile = vscode.commands.registerCommand('folder-dock.openWorkviewFile', async (uri: vscode.Uri) => {
        const config = vscode.workspace.getConfiguration('explorer');
        const prev = config.get('autoReveal');
        await config.update('autoReveal', false, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('vscode.open', uri);
        await config.update('autoReveal', prev, vscode.ConfigurationTarget.Global);
    });

    return [openInWorkview, closeWorkview, openWorkviewFile];
}

/** Registers commands for opening folders in the current or a new VS Code window. */
export function registerFolderCommands(): vscode.Disposable[] {
    const openInCurrentWindow = vscode.commands.registerCommand('folder-dock.openFolderInCurrentWindow', async (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { vscode.window.showErrorMessage('No folder selected.'); return; }
        const folderUri = vscode.Uri.file(targetPath);
        const success = await vscode.commands.executeCommand('vscode.openFolder', folderUri, false);
        if (!success) { vscode.window.showErrorMessage(`Could not open folder: ${targetPath}`); }
    });

    const openInNewWindow = vscode.commands.registerCommand('folder-dock.openFolderInNewWindow', async (arg: vscode.Uri | BookmarkItem) => {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { vscode.window.showErrorMessage('No folder selected.'); return; }
        const folderUri = vscode.Uri.file(targetPath);
        const success = await vscode.commands.executeCommand('vscode.openFolder', folderUri, true);
        if (!success) { vscode.window.showErrorMessage(`Could not open folder: ${targetPath}`); }
    });

    const openFile = vscode.commands.registerCommand('folder-dock.openFile', async (arg: BookmarkItem) => {
        if (!(arg instanceof BookmarkItem)) { return; }
        const fileUri = vscode.Uri.file(arg.bookmark.path);
        await vscode.commands.executeCommand('vscode.open', fileUri);
    });

    return [openInCurrentWindow, openInNewWindow, openFile];
}

/** Registers commands for opening folders in terminal. */
export function registerTerminalCommands(): vscode.Disposable[] {
    /** Resolves the folder path for terminal commands (uses parent dir for files). */
    function resolveTerminalDir(arg: vscode.Uri | BookmarkItem): string | undefined {
        const targetPath = resolveTargetPath(arg);
        if (!targetPath) { return undefined; }
        return fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
    }

    const openInNewTerminal = vscode.commands.registerCommand('folder-dock.openInNewTerminal', (arg: vscode.Uri | BookmarkItem) => {
        const dir = resolveTerminalDir(arg);
        if (!dir) { return; }
        const terminal = vscode.window.createTerminal({ cwd: dir });
        terminal.show();
    });

    const openInTerminal = vscode.commands.registerCommand('folder-dock.openInTerminal', (arg: vscode.Uri | BookmarkItem) => {
        const dir = resolveTerminalDir(arg);
        if (!dir) { return; }
        const terminal = vscode.window.activeTerminal;
        if (!terminal) { return; }
        terminal.sendText(`cd "${dir}"`);
        terminal.show();
    });

    // Track whether any terminal is open
    const updateTerminalContext = () => {
        vscode.commands.executeCommand('setContext', 'folderDockTerminalActive', vscode.window.terminals.length > 0);
    };
    updateTerminalContext();
    const onOpen = vscode.window.onDidOpenTerminal(updateTerminalContext);
    const onClose = vscode.window.onDidCloseTerminal(updateTerminalContext);

    return [openInNewTerminal, openInTerminal, onOpen, onClose];
}

/** Registers commands for adding, removing, and editing bookmarks. */
export function registerBookmarkCommands(bookmarkProvider: BookmarkProvider): vscode.Disposable[] {
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

    /** Adds a bookmark directly from the Explorer context menu. */
    const addFromContext = vscode.commands.registerCommand('folder-dock.addToBookmarks', async (uri: vscode.Uri) => {
        if (!uri) { return; }

        if (!bookmarkProvider.isReady()) {
            const configured = await bookmarkProvider.promptForStoragePath();
            if (!configured) { return; }
        }

        const selectedPath = uri.fsPath;
        const type = fs.statSync(selectedPath).isDirectory() ? 'folder' : 'file';
        const defaultName = path.basename(selectedPath);

        const name = await vscode.window.showInputBox({ prompt: 'Set bookmark name', value: defaultName });
        if (!name) { return; }

        bookmarkProvider.addBookmark(name, selectedPath, type);
    });

    const remove = vscode.commands.registerCommand('folder-dock.removeBookmark', (item: BookmarkItem) => {
        bookmarkProvider.removeBookmark(item.bookmark);
    });

    const edit = vscode.commands.registerCommand('folder-dock.editBookmark', (item: BookmarkItem) => {
        bookmarkProvider.editBookmark(item.bookmark);
    });

    const moveUp = vscode.commands.registerCommand('folder-dock.moveBookmarkUp', (item: BookmarkItem) => {
        bookmarkProvider.moveUp(item.bookmark);
    });

    const moveDown = vscode.commands.registerCommand('folder-dock.moveBookmarkDown', (item: BookmarkItem) => {
        bookmarkProvider.moveDown(item.bookmark);
    });

    const reload = vscode.commands.registerCommand('folder-dock.reloadBookmarks', () => {
        bookmarkProvider.reload();
    });

    const pick = vscode.commands.registerCommand('folder-dock.pickBookmark', async () => {
        const bookmarks = bookmarkProvider.getBookmarks();
        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks saved.');
            return;
        }
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
