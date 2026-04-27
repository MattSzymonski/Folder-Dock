// This file implements the Workview panel for the Folder Dock extension.
// Responsibilities:
// - Defines `WorkviewItem`, the tree item rendered for each file/folder entry
// - Implements `WorkviewProvider`, a `TreeDataProvider` plus `TreeDragAndDropController`
// - Roots the tree at a single bookmarked folder for focused browsing without changing workspace
// - Supplies file/folder enumeration, drag-and-drop handling, and refresh notifications
// - Tracks an `isFileOpening` flag used by `extension.ts` to avoid spurious refreshes
// Depends on: VS Code API and Node `fs`/`path`. Consumed by `extension.ts` and `commands.ts`.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Custom MIME type used to identify Workview drags so we can distinguish
// internal moves from generic file drops coming from other sources.
const WORKVIEW_MIME = 'application/vnd.code.tree.folderDockWorkview';

// Tree item rendering for one filesystem entry inside the Workview panel.
// Carries its absolute path and a directory flag, exposes them via `resourceUri`
// (so VS Code applies file decorations and theme icons) and binds the default
// click action for files to the Workview-specific open command.
export class WorkviewItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly isDirectory: boolean
    ) {
        super(
            path.basename(filePath),
            isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        this.id = filePath;
        this.tooltip = filePath;
        this.resourceUri = vscode.Uri.file(filePath);
        this.contextValue = isDirectory ? 'workviewFolder' : 'workviewFile';
        if (!isDirectory) {
            // Files use the extension's wrapper command which suppresses Explorer auto-reveal.
            this.command = {
                command: 'folder-dock.openWorkviewFile',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)],
            };
        }
    }
}

// Backing model and drag-and-drop controller for the Workview tree.
// Exposes a single bookmarked folder as a focused mini-explorer without changing
// the active workspace, and supports drag-and-drop file moves within that subtree.
export class WorkviewProvider implements vscode.TreeDataProvider<WorkviewItem>, vscode.TreeDragAndDropController<WorkviewItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkviewItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Only accept drops carrying our internal MIME type; emit both internal and URI list on drag
    // so external drop targets (e.g. editor tabs) can also receive the dragged files.
    readonly dropMimeTypes = [WORKVIEW_MIME];
    readonly dragMimeTypes = [WORKVIEW_MIME, 'text/uri-list'];

    private rootPath: string | undefined;
    // Set during programmatic file opens from this provider so `extension.ts` can ignore
    // the resulting `onDidChangeActiveTextEditor` event and not clear our selection.
    isFileOpening = false;

    // Forces a re-render of the tree, e.g. after filesystem mutations or selection changes.
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // Mounts a folder as the new root and signals the workbench to reveal the panel
    // (the `folderDockWorkviewActive` context flips welcome views off and panel chrome on).
    setRoot(folderPath: string): void {
        this.rootPath = folderPath;
        vscode.commands.executeCommand('setContext', 'folderDockWorkviewActive', true);
        this._onDidChangeTreeData.fire();
    }

    // Unmounts the current folder and flips the context flag back so the welcome view returns.
    clear(): void {
        this.rootPath = undefined;
        vscode.commands.executeCommand('setContext', 'folderDockWorkviewActive', false);
        this._onDidChangeTreeData.fire();
    }

    // `TreeDataProvider` hook: items already carry all their UI state.
    getTreeItem(element: WorkviewItem): vscode.TreeItem {
        return element;
    }

    // `TreeDataProvider` hook: lists the immediate contents of `element` (or the root
    // when `element` is undefined). Returns an empty array if the directory is missing.
    // Sort order: directories first, then case-insensitive locale-aware name comparison.
    getChildren(element?: WorkviewItem): WorkviewItem[] {
        const dir = element ? element.filePath : this.rootPath;
        if (!dir || !fs.existsSync(dir)) { return []; }

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries
            .sort((a, b) => {
                // Folders before files; otherwise compare names alphabetically.
                if (a.isDirectory() && !b.isDirectory()) { return -1; }
                if (!a.isDirectory() && b.isDirectory()) { return 1; }
                return a.name.localeCompare(b.name);
            })
            .map(entry => new WorkviewItem(path.join(dir, entry.name), entry.isDirectory()));
    }

    // Drag handler: serializes the dragged paths under our internal MIME type and also
    // publishes a `text/uri-list` payload so external consumers can accept the drop.
    handleDrag(source: readonly WorkviewItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set(WORKVIEW_MIME, new vscode.DataTransferItem(source.map(s => s.filePath)));
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(
            source.map(s => vscode.Uri.file(s.filePath).toString()).join('\r\n')
        ));
    }

    // Drop handler for moves within the Workview tree.
    // - Resolves the destination directory: a target folder, the parent of a target file, or the root.
    // - Skips no-op moves (same path) and moves into a node's own subtree.
    // - Warns and skips when a name collision would occur instead of overwriting.
    async handleDrop(target: WorkviewItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const raw = dataTransfer.get(WORKVIEW_MIME);
        if (!raw) { return; }
        const sourcePaths: string[] = raw.value;
        const destDir = target
            ? (target.isDirectory ? target.filePath : path.dirname(target.filePath))
            : this.rootPath;
        if (!destDir) { return; }

        // Process each dragged path independently so one failure does not abort the rest.
        for (const src of sourcePaths) {
            const destPath = path.join(destDir, path.basename(src));
            // Guard: same location, or attempting to move a folder into itself.
            if (src === destPath || destPath.startsWith(src + path.sep)) { continue; }
            // Guard: refuse to silently overwrite an existing entry with the same name.
            if (fs.existsSync(destPath)) {
                vscode.window.showWarningMessage(`"${path.basename(src)}" already exists in the destination.`);
                continue;
            }
            fs.renameSync(src, destPath);
        }
        this.refresh();
    }
}
