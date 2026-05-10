/**
 * src/types/index.ts
 *
 * All shared types in one place.
 * Keeping types separate from logic means any file can import them
 * without creating circular dependencies.
 */

export interface User {
  socketId: string;
  // In a real app you'd add: userId, displayName, color, cursor position
}

export interface DocumentUpdatePayload {
  documentId: string;
  content: string;
}

export interface CreateDocumentBody {
  title: string;
}
