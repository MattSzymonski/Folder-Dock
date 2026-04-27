// This file implements the Bookmarks panel for the Folder Dock extension.
// Responsibilities:
// - Defines `BookmarkItem`, the tree item rendered for each bookmark (file or folder)
// - Implements `BookmarkProvider`, a `TreeDataProvider` backing the bookmarks view
// - Persists bookmarks to a JSON file in global storage or a user-configured path
// - Tracks which bookmarked folder is currently active in the Workview panel
// - Prompts the user to choose a storage location on first use or in remote sessions
// Depends on: VS Code API, Node `fs`/`path`/`os`, and the `Bookmark` type from `types.ts`.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Bookmark } from './types';

// Tree item rendering for one bookmark row in the Bookmarks view.
// Picks an icon, tooltip, default click command, and `contextValue` (used by package.json
// `when`-clauses to decide which context-menu entries to show) based on bookmark type
// and whether this folder is currently mounted in the Workview panel.
export class BookmarkItem extends vscode.TreeItem {
    constructor(public readonly bookmark: Bookmark, isActive: boolean) {
        super(bookmark.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = bookmark.path;
        // Prepend a bullet glyph when the folder is the active Workview root so users can spot it.
        this.description = isActive ? `● ${bookmark.path}` : bookmark.path;
        if (bookmark.type === 'file') {
            // File bookmarks: clicking opens the file directly in an editor.
            this.contextValue = 'bookmarkFile';
            this.iconPath = new vscode.ThemeIcon('symbol-file');
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(bookmark.path)]
            };
        } else if (isActive) {
            // Folder bookmark currently mirrored in Workview: show eye icon and reveal in Explorer on click.
            this.contextValue = 'bookmarkFolderInWorkview';
            this.iconPath = new vscode.ThemeIcon('eye');
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal in Explorer',
                arguments: [vscode.Uri.file(bookmark.path)]
            };
        } else {
            // Inactive folder bookmark: standard folder icon, click reveals in the workspace Explorer.
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

// Backing model for the Bookmarks tree view.
// Owns the in-memory bookmark list, persists it to a JSON file, and notifies VS Code
// whenever the list (or the active Workview folder) changes so the UI refreshes.
export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private bookmarks: Bookmark[] = [];
    private storageFilePath: string | undefined;
    private activeWorkviewPath: string | undefined;

    constructor(private globalStorageUri: vscode.Uri) {
        this.initStorage();
    }

    // True when VS Code is connected to a remote (SSH/WSL/Container/Codespace).
    // Used to avoid silently writing bookmarks into a remote machine's global storage.
    private isRemote(): boolean {
        return vscode.env.remoteName !== undefined;
    }

    // Resolves the on-disk JSON path from settings or global storage and loads existing bookmarks.
    // Side effects: sets `storageFilePath` (or leaves it undefined) and populates `bookmarks`.
    private initStorage(): void {
        const config = vscode.workspace.getConfiguration('folder-dock');
        const customPath = config.get<string>('bookmarksStoragePath', '');

        // In remote environments, refuse to default to global storage and force the user to pick a path.
        if (!customPath && this.isRemote()) {
            this.storageFilePath = undefined;
            return;
        }

        const dir = customPath ? customPath : this.globalStorageUri.fsPath;
        // Bail if the chosen directory does not exist; `promptForStoragePath` will recover.
        if (!fs.existsSync(dir)) {
            this.storageFilePath = undefined;
            return;
        }
        const filePath = path.join(dir, 'bookmarks.json');
        this.storageFilePath = filePath;
        this.load();
    }

    // Suggests a remote-friendly default location (~/.vscode) for the storage prompt.
    private getDefaultRemotePath(): string {
        const home = os.homedir();
        return path.join(home, '.vscode');
    }

    // Walks the user through configuring a bookmarks storage directory.
    // Creates the directory if missing, persists the choice in settings, and reloads.
    // Returns true on success, false if the user cancelled or declined.
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

        // Ensure the chosen directory exists before persisting it as the storage location.
        if (!fs.existsSync(input)) {
            fs.mkdirSync(input, { recursive: true });
        }

        const config = vscode.workspace.getConfiguration('folder-dock');
        await config.update('bookmarksStoragePath', input, vscode.ConfigurationTarget.Global);
        this.initStorage();
        this.refresh();
        return true;
    }

    // Indicates whether bookmark read/write operations are usable (storage path resolved).
    isReady(): boolean {
        return this.storageFilePath !== undefined;
    }

    // Reads bookmarks from disk into memory. List order is preserved as written.
    // Falls back to an empty list when the file does not yet exist.
    private load(): void {
        if (this.storageFilePath && fs.existsSync(this.storageFilePath)) {
            const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
            this.bookmarks = JSON.parse(raw);
        } else {
            this.bookmarks = [];
        }
    }

    // Serializes the in-memory bookmark list to JSON on disk. No-op without a storage path.
    private save(): void {
        if (this.storageFilePath) {
            fs.writeFileSync(this.storageFilePath, JSON.stringify(this.bookmarks, null, 2), 'utf-8');
        }
    }

    // Notifies VS Code that the tree data changed so the Bookmarks view re-renders.
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // `TreeDataProvider` hook: items are already fully built, so return as-is.
    getTreeItem(element: BookmarkItem): vscode.TreeItem {
        return element;
    }

    // Records which folder is currently shown in the Workview panel and refreshes
    // so the matching bookmark row can render the active (eye) icon.
    setActiveWorkviewPath(folderPath: string | undefined): void {
        this.activeWorkviewPath = folderPath;
        this.refresh();
    }

    // `TreeDataProvider` hook: maps each stored bookmark to a `BookmarkItem`,
    // marking the folder bookmark whose path matches the active Workview root.
    getChildren(): BookmarkItem[] {
        return this.bookmarks.map(b => new BookmarkItem(b, b.type === 'folder' && b.path === this.activeWorkviewPath));
    }

    // Returns the raw bookmark list. Used by commands that need direct access (e.g. quick pick).
    getBookmarks(): Bookmark[] {
        return this.bookmarks;
    }

    // Appends a bookmark to the end of the list, persists, and refreshes the view.
    addBookmark(name: string, bookmarkPath: string, type: 'folder' | 'file'): void {
        this.bookmarks.push({ name, path: bookmarkPath, type });
        this.save();
        this.refresh();
    }

    // Removes the bookmark matching the given (name, path) pair. No-op if not found.
    removeBookmark(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index !== -1) {
            this.bookmarks.splice(index, 1);
            this.save();
            this.refresh();
        }
    }

    // Interactive edit flow: prompts for a new name then a new path.
    // Cancelling either prompt aborts the edit without modifying state.
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

    // Swaps a bookmark with its predecessor to reorder the list. No-op at index 0 or if missing.
    moveUp(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index > 0) {
            [this.bookmarks[index - 1], this.bookmarks[index]] = [this.bookmarks[index], this.bookmarks[index - 1]];
            this.save();
            this.refresh();
        }
    }

    // Swaps a bookmark with its successor. No-op at the last index or if missing.
    moveDown(bookmark: Bookmark): void {
        const index = this.findIndex(bookmark);
        if (index !== -1 && index < this.bookmarks.length - 1) {
            [this.bookmarks[index], this.bookmarks[index + 1]] = [this.bookmarks[index + 1], this.bookmarks[index]];
            this.save();
            this.refresh();
        }
    }

    // Re-reads the JSON file from disk; useful when it was edited externally.
    reload(): void {
        this.load();
        this.refresh();
    }

    // Locates a bookmark in the in-memory list by composite identity (name + path).
    // Returns -1 when no match exists.
    private findIndex(bookmark: Bookmark): number {
        return this.bookmarks.findIndex(b => b.name === bookmark.name && b.path === bookmark.path);
    }
}
