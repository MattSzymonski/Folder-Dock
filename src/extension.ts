// This file is the entry point of the Folder Dock VS Code extension.
// Responsibilities:
// - Activates and deactivates the extension lifecycle hooks
// - Instantiates and registers the Workview and Bookmarks tree views
// - Wires up all commands defined in `commands.ts`
// - Listens for active editor changes to keep Workview selection in sync
// Depends on: `BookmarkProvider`, `WorkviewProvider`, and command registrars from `commands.ts`.

import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';
import { WorkviewProvider } from './workviewProvider';
import { registerWorkviewCommands, registerWorkviewFileCommands, registerFolderCommands, registerBookmarkCommands, registerTerminalCommands } from './commands';

// Activation entry point invoked by VS Code when the extension is first needed.
// - Constructs both tree-view providers and registers their views with the workbench.
// - Triggers the storage-path prompt when bookmarks have no usable on-disk location yet.
// - Subscribes to active-editor changes to clear stale Workview selection highlights.
// - Registers every contributed command and pushes all disposables onto the extension context.
export function activate(context: vscode.ExtensionContext) {
	// Build the Workview tree along with its drag-and-drop controller (the provider implements both interfaces).
	const workviewProvider = new WorkviewProvider();
	const workviewTreeView = vscode.window.createTreeView('folderDockWorkview', {
		treeDataProvider: workviewProvider,
		dragAndDropController: workviewProvider
	});

	// Build the Bookmarks tree, seeded with the global storage URI used as the default JSON location.
	const bookmarkProvider = new BookmarkProvider(context.globalStorageUri);
	vscode.window.createTreeView('folderDockBookmarks', { treeDataProvider: bookmarkProvider });

	// On first launch (or in remote environments without a configured path) ask the user where to store bookmarks.
	if (!bookmarkProvider.isReady()) {
		bookmarkProvider.promptForStoragePath();
	}

	// When the user opens a file from somewhere other than Workview (Explorer, tabs, Quick Open),
	// refresh to drop the selection so the highlighted item matches reality.
	const editorListener = vscode.window.onDidChangeActiveTextEditor(() => {
		if (!workviewProvider.isFileOpening && workviewTreeView.selection.length > 0) {
			workviewProvider.refresh();
		}
	});

	// Aggregate all disposables so VS Code tears them down on deactivation.
	context.subscriptions.push(
		workviewTreeView,
		editorListener,
		...registerWorkviewCommands(workviewProvider, bookmarkProvider),
		...registerWorkviewFileCommands(workviewProvider),
		...registerFolderCommands(),
		...registerBookmarkCommands(bookmarkProvider),
		...registerTerminalCommands()
	);
}

// Deactivation hook. No manual cleanup is required because every disposable is
// already tracked through `context.subscriptions` in `activate`.
export function deactivate() { }
