import * as vscode from 'vscode';
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

    return [openInWorkview, closeWorkview];
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

/** Registers commands for adding, removing, and editing bookmarks. */
export function registerBookmarkCommands(bookmarkProvider: BookmarkProvider): vscode.Disposable[] {
    const add = vscode.commands.registerCommand('folder-dock.addBookmark', async () => {
        if (!bookmarkProvider.isReady()) {
            const configured = await bookmarkProvider.promptForStoragePath();
            if (!configured) { return; }
        }

        const type = await vscode.window.showQuickPick(
            [{ label: 'Folder', value: 'folder' as const }, { label: 'File', value: 'file' as const }],
            { placeHolder: 'Bookmark a folder or file?' }
        );
        if (!type) { return; }

        const name = await vscode.window.showInputBox({ prompt: 'Bookmark name' });
        if (!name) { return; }

        const uris = await vscode.window.showOpenDialog({
            canSelectFolders: type.value === 'folder',
            canSelectFiles: type.value === 'file',
            canSelectMany: false,
            openLabel: `Select ${type.label}`
        });
        if (!uris || uris.length === 0) { return; }

        bookmarkProvider.addBookmark(name, uris[0].fsPath, type.value);
    });

    const remove = vscode.commands.registerCommand('folder-dock.removeBookmark', (item: BookmarkItem) => {
        bookmarkProvider.removeBookmark(item.bookmark);
    });

    const edit = vscode.commands.registerCommand('folder-dock.editBookmark', (item: BookmarkItem) => {
        bookmarkProvider.editBookmark(item.bookmark);
    });

    return [add, remove, edit];
}
