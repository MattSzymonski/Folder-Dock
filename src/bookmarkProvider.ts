import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Bookmark } from './types';

/** Tree item representing a single bookmark in the Bookmarks panel. */
export class BookmarkItem extends vscode.TreeItem {
    constructor(public readonly bookmark: Bookmark, isActive: boolean) {
        super(isActive ? `$(eye) ${bookmark.name}` : bookmark.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = bookmark.path;
        this.description = bookmark.path;
        this.contextValue = bookmark.type === 'file' ? 'bookmarkFile' : 'bookmarkFolder';
        this.iconPath = new vscode.ThemeIcon(bookmark.type === 'file' ? 'file' : 'folder');
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

    /** Reads bookmarks from the JSON file on disk and sorts them by order. */
    private load(): void {
        if (this.storageFilePath && fs.existsSync(this.storageFilePath)) {
            const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
            this.bookmarks = JSON.parse(raw);
            this.bookmarks.sort((a, b) => a.order - b.order);
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

    /** Appends a new bookmark, assigns the next order value, and persists to disk. */
    addBookmark(name: string, bookmarkPath: string, type: 'folder' | 'file'): void {
        const maxOrder = this.bookmarks.reduce((max, b) => Math.max(max, b.order), 0);
        this.bookmarks.push({ order: maxOrder + 1, name, path: bookmarkPath, type });
        this.save();
        this.refresh();
    }

    /** Removes a bookmark by matching order and path, then persists the change. */
    removeBookmark(bookmark: Bookmark): void {
        this.bookmarks = this.bookmarks.filter(b => b.order !== bookmark.order || b.path !== bookmark.path);
        this.save();
        this.refresh();
    }

    /** Prompts the user to edit a bookmark's name and path via input boxes. */
    async editBookmark(bookmark: Bookmark): Promise<void> {
        const newName = await vscode.window.showInputBox({ prompt: 'Bookmark name', value: bookmark.name });
        if (newName === undefined) { return; }

        const newPath = await vscode.window.showInputBox({ prompt: 'Folder path', value: bookmark.path });
        if (newPath === undefined) { return; }

        const entry = this.bookmarks.find(b => b.order === bookmark.order && b.path === bookmark.path);
        if (entry) {
            entry.name = newName;
            entry.path = newPath;
            this.save();
            this.refresh();
        }
    }
}
