import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const WORKVIEW_MIME = 'application/vnd.code.tree.folderDockWorkview';

/** Tree item representing a file or directory entry in the Workview panel. */
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
            this.command = {
                command: 'folder-dock.openWorkviewFile',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)],
            };
        }
    }
}

/**
 * Provides a file explorer tree for a single folder with full file operations.
 * Used to preview and manage a bookmarked folder's contents without opening it as a workspace.
 */
export class WorkviewProvider implements vscode.TreeDataProvider<WorkviewItem>, vscode.TreeDragAndDropController<WorkviewItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkviewItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    readonly dropMimeTypes = [WORKVIEW_MIME];
    readonly dragMimeTypes = [WORKVIEW_MIME, 'text/uri-list'];

    private rootPath: string | undefined;
    isFileOpening = false;

    /** Refreshes the tree to clear selection while preserving expansion state. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /** Sets the root folder to display and activates the Workview panel. */
    setRoot(folderPath: string): void {
        this.rootPath = folderPath;
        vscode.commands.executeCommand('setContext', 'folderDockWorkviewActive', true);
        this._onDidChangeTreeData.fire();
    }

    /** Clears the displayed folder and hides the Workview panel. */
    clear(): void {
        this.rootPath = undefined;
        vscode.commands.executeCommand('setContext', 'folderDockWorkviewActive', false);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WorkviewItem): vscode.TreeItem {
        return element;
    }

    /** Lists directory contents, sorted with folders first then alphabetically. */
    getChildren(element?: WorkviewItem): WorkviewItem[] {
        const dir = element ? element.filePath : this.rootPath;
        if (!dir || !fs.existsSync(dir)) { return []; }

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        return entries
            .sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) { return -1; }
                if (!a.isDirectory() && b.isDirectory()) { return 1; }
                return a.name.localeCompare(b.name);
            })
            .map(entry => new WorkviewItem(path.join(dir, entry.name), entry.isDirectory()));
    }

    handleDrag(source: readonly WorkviewItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set(WORKVIEW_MIME, new vscode.DataTransferItem(source.map(s => s.filePath)));
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(
            source.map(s => vscode.Uri.file(s.filePath).toString()).join('\r\n')
        ));
    }

    async handleDrop(target: WorkviewItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const raw = dataTransfer.get(WORKVIEW_MIME);
        if (!raw) { return; }
        const sourcePaths: string[] = raw.value;
        const destDir = target
            ? (target.isDirectory ? target.filePath : path.dirname(target.filePath))
            : this.rootPath;
        if (!destDir) { return; }

        for (const src of sourcePaths) {
            const destPath = path.join(destDir, path.basename(src));
            if (src === destPath || destPath.startsWith(src + path.sep)) { continue; }
            if (fs.existsSync(destPath)) {
                vscode.window.showWarningMessage(`"${path.basename(src)}" already exists in the destination.`);
                continue;
            }
            fs.renameSync(src, destPath);
        }
        this.refresh();
    }
}
