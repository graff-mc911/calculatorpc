/** Універсальний формат документа CPC (.scbdoc.json) */

export type EditorMode = 'document' | 'presentation' | 'book';

export type BlockType = 'text' | 'image' | 'table' | 'attachment' | 'divider';

export interface TextBlock {
  id: string;
  type: 'text';
  html: string;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
}

export interface TableBlock {
  id: string;
  type: 'table';
  rows: string[][];
}

export interface AttachmentBlock {
  id: string;
  type: 'attachment';
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface DividerBlock {
  id: string;
  type: 'divider';
}

export type ContentBlock = TextBlock | ImageBlock | TableBlock | AttachmentBlock | DividerBlock;

export interface DocumentSection {
  id: string;
  title: string;
  blocks: ContentBlock[];
}

export interface Slide {
  id: string;
  title: string;
  backgroundColor?: string;
  blocks: ContentBlock[];
}

export interface BookChapter {
  id: string;
  title: string;
  blocks: ContentBlock[];
  children?: BookChapter[];
}

export interface BookCover {
  title: string;
  author: string;
  image?: string;
}

export interface UniversalDocument {
  version: 1;
  id: string;
  name: string;
  mode: EditorMode;
  createdAt: string;
  updatedAt: string;
  sections?: DocumentSection[];
  slides?: Slide[];
  cover?: BookCover;
  chapters?: BookChapter[];
}

export interface StoredDocumentMeta {
  id: string;
  name: string;
  mode: EditorMode;
  updatedAt: string;
  preview: string;
}