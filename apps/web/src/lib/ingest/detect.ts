/**
 * FreeLM — source type detection.
 *
 * FreeLM accepts any file type. This module works out *how* a file should be
 * extracted: the formats below can be turned into searchable text, and
 * anything else is stored as-is and reported honestly if it turns out to
 * contain no readable text.
 */

import path from 'node:path';

export type DetectedSourceType =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'csv'
  | 'epub'
  | 'image'
  | 'audio'
  | 'text'
  | 'file';

export interface SourceTypeMeta {
  type: DetectedSourceType;
  label: string;
}

export function detectSourceType(
  fileName: string,
  mimeType: string,
): SourceTypeMeta {
  const extension = path.extname(fileName).toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (extension === '.pdf' || mime === 'application/pdf') {
    return { type: 'pdf', label: 'PDF' };
  }
  if (extension === '.docx' || mime.includes('wordprocessingml')) {
    return { type: 'docx', label: 'Word document' };
  }
  if (extension === '.pptx' || mime.includes('presentationml')) {
    return { type: 'pptx', label: 'PowerPoint' };
  }
  if (extension === '.csv' || extension === '.tsv' || mime === 'text/csv') {
    return { type: 'csv', label: 'Spreadsheet' };
  }
  if (extension === '.epub' || mime === 'application/epub+zip') {
    return { type: 'epub', label: 'eBook' };
  }
  if (mime.startsWith('image/')) {
    return { type: 'image', label: 'Image' };
  }
  if (mime.startsWith('audio/')) {
    return { type: 'audio', label: 'Audio' };
  }
  if (mime.startsWith('text/')) {
    return { type: 'text', label: 'Text' };
  }
  if (extension === '.md' || extension === '.markdown') {
    return { type: 'text', label: 'Markdown' };
  }
  if (
    extension === '.txt' ||
    extension === '.log' ||
    extension === '.json' ||
    extension === '.xml' ||
    extension === '.yaml' ||
    extension === '.yml' ||
    extension === '.html' ||
    extension === '.htm'
  ) {
    return { type: 'text', label: 'Text' };
  }
  return { type: 'file', label: 'File' };
}
