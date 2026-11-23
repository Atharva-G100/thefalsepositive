/** A half-open range of UTF-16 offsets in plain text. */
export interface PostHighlight {
  start: number;
  end: number;
}

/** Browser-ready summary. Prepare local image URLs and reading time at build time. */
export interface PostSummaryData {
  href: string;
  title: string;
  publishDate: string;
  readingTimeMinutes: number;
  description?: string;
  highlights?: {
    title?: readonly PostHighlight[];
    description?: readonly PostHighlight[];
  };
  draft?: boolean;
  cover?: {
    src: string;
    width?: number;
    height?: number;
    srcset?: string;
    sizes?: string;
  };
}
