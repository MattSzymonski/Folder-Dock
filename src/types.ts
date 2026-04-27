// This file defines shared TypeScript types used across the Folder Dock extension.
// Responsibilities:
// - Declares the `Bookmark` interface describing a single saved bookmark entry
// - Provides a single source of truth for the bookmark data shape persisted to disk
// - Consumed by `bookmarkProvider.ts` for storage and rendering, and by `commands.ts` for operations
// Keep this file dependency-free so it can be imported by any module without cycles.

// Serializable record describing a single user-saved bookmark.
// Persisted to disk as JSON by `BookmarkProvider` and rendered as a `BookmarkItem`.
export interface Bookmark {
    // User-visible label shown in the Bookmarks tree view.
    name: string;
    // Absolute filesystem path to the target file or directory.
    path: string;
    // Discriminator used to choose icons, context values, and default click actions.
    type: 'folder' | 'file';
}
