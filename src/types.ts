/** A saved bookmark entry pointing to a folder or file on disk. */
export interface Bookmark {
    /** Sort order used to maintain user-defined ordering. */
    order: number;
    /** Display name shown in the Bookmarks tree view. */
    name: string;
    /** Absolute filesystem path to the bookmarked folder or file. */
    path: string;
    /** Whether this bookmark targets a folder or a file. */
    type: 'folder' | 'file';
}
