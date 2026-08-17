export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type PlaylistTrack = {
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: number;
};

export type PlaylistSummary = Playlist & {
  trackCount: number;
};
