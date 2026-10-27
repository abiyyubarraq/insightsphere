/**
 * The page a citation shows, or null for none. Only PDFs have real pages: the
 * parser stores page 1 for DOCX, TXT and Markdown, and old saved citations
 * have it too, so the rule reads the file name, not the stored number.
 */
export const citationPageLabel = (fileName: string, pageNumber: number | null | undefined): number | null => {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1 || fileName.slice(dot + 1).toLowerCase() !== 'pdf') return null;
  return typeof pageNumber === 'number' && pageNumber > 0 ? pageNumber : null;
};
