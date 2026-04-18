import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';
import { WorkviewProvider } from './workviewProvider';
import { registerWorkviewCommands, registerFolderCommands, registerBookmarkCommands, registerTerminalCommands } from './commands';

/** Activates the Folder Dock extension — sets up tree views and registers all commands. */
export function activate(context: vscode.ExtensionContext) {
	const workviewProvider = new WorkviewProvider();
	vscode.window.createTreeView('folderDockWorkview', { treeDataProvider: workviewProvider });

	const bookmarkProvider = new BookmarkProvider(context.globalStorageUri);
	vscode.window.createTreeView('folderDockBookmarks', { treeDataProvider: bookmarkProvider });

	if (!bookmarkProvider.isReady()) {
		bookmarkProvider.promptForStoragePath();
	}

	context.subscriptions.push(
		...registerWorkviewCommands(workviewProvider, bookmarkProvider),
		...registerFolderCommands(),
		...registerBookmarkCommands(bookmarkProvider),
		...registerTerminalCommands()
	);
}

export function deactivate() { }
