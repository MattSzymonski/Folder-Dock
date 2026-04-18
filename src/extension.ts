import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';
import { WorkviewProvider } from './workviewProvider';
import { registerWorkviewCommands, registerWorkviewFileCommands, registerFolderCommands, registerBookmarkCommands, registerTerminalCommands } from './commands';

/** Activates the Folder Dock extension — sets up tree views and registers all commands. */
export function activate(context: vscode.ExtensionContext) {
	const workviewProvider = new WorkviewProvider();
	const workviewTreeView = vscode.window.createTreeView('folderDockWorkview', {
		treeDataProvider: workviewProvider,
		dragAndDropController: workviewProvider
	});

	const bookmarkProvider = new BookmarkProvider(context.globalStorageUri);
	vscode.window.createTreeView('folderDockBookmarks', { treeDataProvider: bookmarkProvider });

	if (!bookmarkProvider.isReady()) {
		bookmarkProvider.promptForStoragePath();
	}

	// Clear workview selection when user opens a file from the Explorer or switches tabs
	const editorListener = vscode.window.onDidChangeActiveTextEditor(() => {
		if (!workviewProvider.isFileOpening && workviewTreeView.selection.length > 0) {
			workviewProvider.refresh();
		}
	});

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

export function deactivate() { }
