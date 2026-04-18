import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Bookmark } from './types';

/** Tree item representing a single bookmark in the Bookmarks panel. */
export class BookmarkItem extends vscode.TreeItem {
    constructor(public readonly bookmark: Bookmark, isActive: boolean) {
        super(bookmark.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = bookmark.path;
        this.description = isActive ? `● ${bookmark.path}` : bookmark.path;
        if (bookmark.type === 'file') {
            this.contextValue = 'bookmarkFile';
            this.iconPath = new vscode.ThemeIcon('symbol-file');
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(bookmark.path)]
            };
        } else if (isActive) {
            this.contextValue = 'bookmarkFolderInWorkview';
            this.iconPath = new vscode.ThemeIcon('eye');
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal in Explorer',
                arguments: [vscode.Uri.file(bookmark.path)]
            };
        } else {
            this.contextValue = 'bookmarkFolder';
            this.iconPath = new vscode.ThemeIcon('symbol-folder');
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal in Explorer',
                arguments: [vscode.Uri.file(bookmark.path)]
            };
        }
    }
}

/**
 * Manages bookmark persistence and provides data for the Bookmarks tree view.
 * Bookmarks are stored as a JSON file on disk, either in the VS Code global
 * storage directory or a user-configured custom path.
 */
export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private bookmarks: Bookmark[] = [];
    private storageFilePath: string | undefined;
    private activeWorkviewPath: string | undefined;

    constructor(private globalStorageUri: vscode.Uri) {
        this.initStorage();
    }

    /** Checks if the extension is running in a remote environment (SSH, WSL, etc.). */
    private isRemote(): boolean {
        return vscode.env.remoteName !== undefined;
    }

    /** Resolves the storage directory and loads existing bookmarks from disk. */
    private initStorage(): void {
        const config = vscode.workspace.getConfiguration('folder-dock');
        const customPath = config.get<string>('bookmarksStoragePath', '');

        if (!customPath && this.isRemote()) {
            this.storageFilePath = undefined;
            return;
        }

        const dir = customPath ? customPath : this.globalStorageUri.fsPath;
        if (!fs.existsSync(dir)) {
            this.storageFilePath = undefined;
            return;
        }
        const filePath = path.join(dir, 'bookmarks.json');
        this.storageFilePath = filePath;
        this.load();
    }

    /** Returns a sensible default storage path for remote environments (~/.vscode). */
    private getDefaultRemotePath(): string {
        const home = os.homedir();
        return path.join(home, '.vscode');
    }

    /** Prompts the user to set a storage directory. Returns true if configured successfully. */
    async promptForStoragePath(): Promise<boolean> {
        const suggested = this.getDefaultRemotePath();
        const action = await vscode.window.showWarningMessage(
            'Folder Bookmarks: Storage path not found. Set a path to store bookmarks.',
            'Set Path'
        );
        if (action !== 'Set Path') { return false; }

        const input = await vscode.window.showInputBox({
            prompt: 'Absolute path to store bookmarks.json',
            value: suggested
        });
        if (!input) { return false; }

        if (!fs.existsSync(input)) {
            fs.mkdirSync(input, { recursive: true });
        }

        const config = vscode.workspace.getConfiguration('folder-dock');
        await config.update('bookmarksStoragePath', input, vscode.ConfigurationTarget.Global);
        this.initStorage();
        this.refresh();
        return true;
    }

    /** Whether the storage path is resolved and bookmarks can be read/written. */
    isReady(): boolean {
        return this.storageFilePath !== undefined;
    }

    /** Reads bookmarks from the JSON file on disk. Order is determined by array position. */
    private load(): void {
        if (this.storageFilePath && fs.existsSync(this.storageFilePath)) {
            const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
            this.bookmarks = JSON.parse(raw);
        } else {
            this.bookmarks = [];
        }
    }

    /** Writes the current bookmarks array to the JSON file on disk. */
    private save(): void {
        if (this.storageFilePath) {
            fs.writeFileSync(this.storageFilePath, JSON.stringify(this.bookmarks, null, 2), 'utf-8');
        }
    }

    /** Fires a tree-data-changed event to refresh the Bookmarks panel. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookmarkItem): vscode.TreeItem {
        return element;
    }

    /** Tracks which folder is currently open in Workview so the eye icon can be shown. */
    setActiveWorkviewPath(folderPath: string | undefined): void {
        this.activeWorkviewPath = folderPath;
        this.refresh();
    }

    getChildren(): BookmarkItem[] {
        return this.bookmarks.map(b => new BookmarkItem(b, b.type === 'folder' && b.path === this.activeWorkviewPath));
    }

    /** Returns the raw bookmarks array. */
    getBookmarks(): Bookmark[] {
        return this.bookmarks;
    }

    /** Appends a new bookmark to the end of the list and persists to disk. */
    addBookmark(name: string, bookmarkPath: string, type: 'folder' | 'file'): void {
        this.bookmarks.push({ name, path: bookmarkPath, type });
        this.save();
        this.refresh();
    }

    /** Removes a bookmark by matching name and path, then persists the change. */
    removeBookmark(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index !== -1) {
            this.bookmarks.splice(index, 1);
            this.save();
            this.refresh();
        }
    }

    /** Prompts the user to edit a bookmark's name and path via input boxes. */
    async editBookmark(bookmark: Bookmark): Promise<void> {
        const newName = await vscode.window.showInputBox({ prompt: 'Bookmark name', value: bookmark.name });
        if (newName === undefined) { return; }

        const newPath = await vscode.window.showInputBox({ prompt: 'Folder path', value: bookmark.path });
        if (newPath === undefined) { return; }

        const index = this.findIndex(bookmark);
        if (index !== -1) {
            this.bookmarks[index].name = newName;
            this.bookmarks[index].path = newPath;
            this.save();
            this.refresh();
        }
    }

    /** Moves a bookmark one position up in the list. */
    moveUp(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index > 0) {
            [this.bookmarks[index - 1], this.bookmarks[index]] = [this.bookmarks[index], this.bookmarks[index - 1]];
            this.save();
            this.refresh();
        }
    }

    /** Moves a bookmark one position down in the list. */
    moveDown(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index !== -1 && index < this.bookmarks.length - 1) {
            [this.bookmarks[index], this.bookmarks[index + 1]] = [this.bookmarks[index + 1], this.bookmarks[index]];
            this.save();
            this.refresh();
        }
    }

    /** Reloads bookmarks from disk. */
    reload(): void {
        this.load();
        this.refresh();
    }

    private findIndex(bookmark: Bookmark): number {
        return this.bookmarks.findIndex(b => b.name === bookmark.name && b.path === bookmark.path);
    }
}
