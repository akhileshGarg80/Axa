export type StorageMode = 'catbox' | 'litterbox';
export type LitterboxExpiry = '1h' | '12h' | '24h' | '72h';
export type MediaKind = 'image' | 'video' | 'other';

export interface CatboxMediaItem {
  id: string;
  url: string;
  fileKey: string;
  originalName: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  storageMode: StorageMode;
  expiry: string; // 'Permanent' | '1h' | '12h' | '24h' | '72h'
  uploadedAt: number;
  expiresAt?: number;
  favorite?: boolean;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface UploadQueueItem {
  id: string;
  file?: File;
  remoteUrl?: string;
  name: string;
  size: number;
  kind: MediaKind;
  previewUrl?: string;
  progress: number;
  status: 'queued' | 'uploading' | 'completed' | 'error';
  resultUrl?: string;
  errorMsg?: string;
  storageMode: StorageMode;
  expiry: LitterboxExpiry;
}

export interface CatboxAlbum {
  id: string;
  title: string;
  description: string;
  albumUrl: string;
  itemIds: string[];
  createdAt: number;
}

export interface CatboxSettings {
  userhash: string;
  defaultStorageMode: StorageMode;
  defaultExpiry: LitterboxExpiry;
  autoCopyLink: boolean;
}
