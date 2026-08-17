export type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  sourceUrl: string;
  localUri: string;
  downloadedAt: string;
  missingLocalFile: boolean;
};
