import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
        this.tooltip = filePath;
        this.resourceUri = vscode.Uri.file(filePath);
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
 * Provides a read-only file explorer tree for a single folder.
 * Used to preview a bookmarked folder's contents without opening it as a workspace.
 */
export class WorkviewProvider implements vscode.TreeDataProvider<WorkviewItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkviewItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private rootPath: string | undefined;

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
}
