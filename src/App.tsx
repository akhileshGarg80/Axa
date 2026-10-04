import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Film,
  FolderPlus,
  Settings as SettingsIcon,
  Camera,
  Link2,
  Copy,
  Check,
  Share2,
  Trash2,
  Search,
  Sparkles,
  ExternalLink,
  Heart,
  Clock,
  ShieldCheck,
  AlertCircle,
  Play,
  Plus,
  ArrowUpRight,
  X,
} from 'lucide-react';
import {
  CatboxAlbum,
  CatboxMediaItem,
  CatboxSettings,
  LitterboxExpiry,
  StorageMode,
  UploadQueueItem,
} from './types/media';
import {
  calculateExpiryTimestamp,
  createSampleImageFile,
  detectMediaKind,
  formatBytes,
  formatRelativeTime,
  formatRemainingExpiry,
} from './utils/mediaHelpers';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { MediaPreviewModal } from './components/MediaPreviewModal';

const STORAGE_KEYS = {
  VAULT: 'catbox_pocket_vault_v1',
  ALBUMS: 'catbox_pocket_albums_v1',
  SETTINGS: 'catbox_pocket_settings_v1',
};

const DEFAULT_SETTINGS: CatboxSettings = {
  userhash: '',
  defaultStorageMode: 'catbox',
  defaultExpiry: '24h',
  autoCopyLink: true,
};

type ActiveTab = 'upload' | 'vault' | 'albums' | 'settings';
type VaultFilter = 'all' | 'image' | 'video' | 'favorites' | 'litterbox';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [vaultFilter, setVaultFilter] = useState<VaultFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatboxMediaItem | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'success' | 'error' } | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Persistent Settings, Vault & Albums
  const [settings, setSettings] = useState<CatboxSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [vault, setVault] = useState<CatboxMediaItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VAULT);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [albums, setAlbums] = useState<CatboxAlbum[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ALBUMS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Upload Studio state
  const [storageMode, setStorageMode] = useState<StorageMode>(
    settings.defaultStorageMode
  );
  const [expiry, setExpiry] = useState<LitterboxExpiry>(settings.defaultExpiry);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [isRemoteUploading, setIsRemoteUploading] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Album Creator state
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumDesc, setAlbumDesc] = useState('');
  const [selectedForAlbum, setSelectedForAlbum] = useState<string[]>([]);
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);

  // Hidden file inputs for Mobile Gallery & Video Picker
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.VAULT, JSON.stringify(vault));
    } catch {
      // ignore quota error
    }
  }, [vault]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ALBUMS, JSON.stringify(albums));
    } catch {
      // ignore quota error
    }
  }, [albums]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore quota error
    }
  }, [settings]);

  const showToast = (text: string, tone: 'success' | 'error' = 'success') => {
    setToast({ text, tone });
    window.clearTimeout((window as any).__catboxToastTimer);
    (window as any).__catboxToastTimer = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const handleCopyText = async (text: string, label = 'Link') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied to clipboard`);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`${label} copied to clipboard`);
    }
  };

  // Upload a single file via XMLHttpRequest for real-time progress bar
  const uploadFileToCatbox = (
    file: File,
    chosenMode: StorageMode,
    chosenExpiry: LitterboxExpiry
  ) => {
    const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const kind = detectMediaKind(file.type, file.name);
    const localPreviewUrl = URL.createObjectURL(file);

    const newItem: UploadQueueItem = {
      id: queueId,
      file,
      name: file.name,
      size: file.size,
      kind,
      previewUrl: localPreviewUrl,
      progress: 4,
      status: 'uploading',
      storageMode: chosenMode,
      expiry: chosenExpiry,
    };

    setQueue((prev) => [newItem, ...prev]);

    const formData = new FormData();
    formData.append('fileToUpload', file);
    formData.append('storageMode', chosenMode);
    formData.append('expiry', chosenExpiry);
    if (settings.userhash.trim()) {
      formData.append('userhash', settings.userhash.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/catbox/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.min(95, Math.max(8, Math.round((event.loaded / event.total) * 100)));
        setQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, progress: pct } : q))
        );
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === queueId
                ? { ...q, progress: 100, status: 'completed', resultUrl: data.url }
                : q
            )
          );

          const vaultEntry: CatboxMediaItem = {
            id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: data.url,
            fileKey: data.fileKey || data.url.split('/').pop() || file.name,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            kind,
            size: file.size,
            storageMode: chosenMode,
            expiry: chosenMode === 'litterbox' ? chosenExpiry : 'Permanent',
            uploadedAt: Date.now(),
            expiresAt:
              chosenMode === 'litterbox'
                ? calculateExpiryTimestamp(chosenExpiry)
                : undefined,
            favorite: false,
          };

          setVault((prev) => [vaultEntry, ...prev]);

          if (settings.autoCopyLink) {
            handleCopyText(data.url, 'Catbox URL');
          } else {
            showToast(`Uploaded ${file.name} to Catbox.moe`);
          }
        } else {
          const errMessage = data.error || 'Catbox upload failed';
          setQueue((prev) =>
            prev.map((q) =>
              q.id === queueId ? { ...q, status: 'error', errorMsg: errMessage } : q
            )
          );
          showToast(errMessage, 'error');
        }
      } catch {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === queueId
              ? { ...q, status: 'error', errorMsg: 'Invalid response from upload server' }
              : q
          )
        );
        showToast('Upload failed', 'error');
      }
    };

    xhr.onerror = () => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === queueId
            ? { ...q, status: 'error', errorMsg: 'Network error while uploading' }
            : q
        )
      );
      showToast('Network error during upload', 'error');
    };

    xhr.send(formData);
  };

  const handleFilesSelected = (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach((file) => {
      uploadFileToCatbox(file, storageMode, expiry);
    });
  };

  const handleRemoteUrlUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = remoteUrlInput.trim();
    if (!trimmed) return;

    setIsRemoteUploading(true);
    try {
      const response = await fetch('/api/catbox/url-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
          userhash: settings.userhash.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Could not mirror URL to Catbox.moe');
      }

      const guessedName = trimmed.split('/').pop()?.split('?')[0] || 'remote-media';
      const kind = detectMediaKind('', data.url);

      const newEntry: CatboxMediaItem = {
        id: `media-${Date.now()}`,
        url: data.url,
        fileKey: data.fileKey,
        originalName: guessedName,
        mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg',
        kind,
        size: 0,
        storageMode: 'catbox',
        expiry: 'Permanent',
        uploadedAt: Date.now(),
        favorite: false,
      };

      setVault((prev) => [newEntry, ...prev]);
      setRemoteUrlInput('');
      if (settings.autoCopyLink) {
        handleCopyText(data.url, 'Mirrored Catbox link');
      } else {
        showToast('Remote URL mirrored to Catbox.moe');
      }
    } catch (err: any) {
      showToast(err?.message || 'Remote URL upload failed', 'error');
    } finally {
      setIsRemoteUploading(false);
    }
  };

  const handleQuickTestUpload = async () => {
    try {
      const sampleFile = await createSampleImageFile();
      uploadFileToCatbox(sampleFile, storageMode, expiry);
    } catch {
      showToast('Could not generate test card', 'error');
    }
  };

  const handleToggleFavorite = (id: string) => {
    setVault((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, favorite: !item.favorite } : item
      )
    );
    if (selectedItem && selectedItem.id === id) {
      setSelectedItem((prev) => (prev ? { ...prev, favorite: !prev.favorite } : null));
    }
  };

  const handleDeleteMediaItem = async (item: CatboxMediaItem) => {
    setVault((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedForAlbum((prev) => prev.filter((id) => id !== item.id));

    if (settings.userhash.trim() && item.storageMode === 'catbox') {
      try {
        await fetch('/api/catbox/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileKeys: [item.fileKey],
            userhash: settings.userhash.trim(),
          }),
        });
        showToast(`Deleted ${item.fileKey} from Catbox & Vault`);
        return;
      } catch {
        // fallback to local removal message
      }
    }
    showToast(`Removed ${item.originalName} from Vault`);
  };

  const handleCreateCatboxAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenItems = vault.filter(
      (item) => selectedForAlbum.includes(item.id) && item.storageMode === 'catbox'
    );
    if (chosenItems.length === 0) {
      showToast('Select at least one permanent Catbox media item first', 'error');
      return;
    }

    setIsCreatingAlbum(true);
    try {
      const fileKeys = chosenItems.map((i) => i.fileKey);
      const response = await fetch('/api/catbox/create-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: albumTitle.trim() || 'Catbox Pocket Collection',
          description:
            albumDesc.trim() ||
            `${chosenItems.length} media files curated via Catbox Pocket Studio`,
          fileKeys,
          userhash: settings.userhash.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.albumUrl) {
        throw new Error(data.error || 'Failed to create Catbox album');
      }

      const newAlbum: CatboxAlbum = {
        id: `album-${Date.now()}`,
        title: albumTitle.trim() || 'Catbox Pocket Collection',
        description:
          albumDesc.trim() || `${chosenItems.length} files hosted on Catbox.moe`,
        albumUrl: data.albumUrl,
        itemIds: chosenItems.map((i) => i.id),
        createdAt: Date.now(),
      };

      setAlbums((prev) => [newAlbum, ...prev]);
      setAlbumTitle('');
      setAlbumDesc('');
      setSelectedForAlbum([]);
      handleCopyText(data.albumUrl, 'Catbox Album link');
    } catch (err: any) {
      showToast(err?.message || 'Album creation failed', 'error');
    } finally {
      setIsCreatingAlbum(false);
    }
  };

  // Filtered vault items
  const filteredVault = useMemo(() => {
    return vault.filter((item) => {
      if (vaultFilter === 'image' && item.kind !== 'image') return false;
      if (vaultFilter === 'video' && item.kind !== 'video') return false;
      if (vaultFilter === 'favorites' && !item.favorite) return false;
      if (vaultFilter === 'litterbox' && item.storageMode !== 'litterbox') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.originalName.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q) ||
          item.fileKey.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vault, vaultFilter, searchQuery]);

  // Metrics summary
  const vaultStats = useMemo(() => {
    const imagesCount = vault.filter((i) => i.kind === 'image').length;
    const videosCount = vault.filter((i) => i.kind === 'video').length;
    const totalBytes = vault.reduce((acc, item) => acc + (item.size || 0), 0);
    return { imagesCount, videosCount, totalBytes };
  }, [vault]);

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F5F8] flex flex-col pb-24 md:pb-12">
      {/* Hidden File Inputs for Native Mobile Photo & Video Selection */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      {/* Top Bar Contract: Zone 1 (Single wordmark) — Zone 2 (4 clean nav links) — Zone 3 (1 primary action) */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-8 bg-[#0B0D11]/90 backdrop-blur-md border-b border-white/8 flex items-center justify-between">
        <a
          href="#upload"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('upload');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap"
        >
          Catbox Pocket
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`hover:text-white transition-colors whitespace-nowrap ${
              activeTab === 'upload' ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2' : ''
            }`}
          >
            Upload Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`hover:text-white transition-colors whitespace-nowrap ${
              activeTab === 'vault' ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2' : ''
            }`}
          >
            Media Vault
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('albums')}
            className={`hover:text-white transition-colors whitespace-nowrap ${
              activeTab === 'albums' ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2' : ''
            }`}
          >
            Cloud Albums
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`hover:text-white transition-colors whitespace-nowrap ${
              activeTab === 'settings' ? 'text-white underline underline-offset-8 decoration-[#E11D48] decoration-2' : ''
            }`}
          >
            Settings
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera Capture</span>
          </button>
        </div>
      </header>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-[#1A202C] border border-white/15 shadow-2xl flex items-center gap-2 text-xs font-medium text-white max-w-[92vw] whitespace-nowrap">
          {toast.tone === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="truncate">{toast.text}</span>
        </div>
      )}

      {/* Main Content Container (Mobile-First Ergonomics + Full Desktop Grid) */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 pb-8">
        {/* Top Compact Summary Strip */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('vault');
              setVaultFilter('image');
            }}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#131720] border border-white/8 text-left hover:border-white/15 transition-colors"
          >
            <div className="text-xs text-slate-400">Hosted Images</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono-tabular mt-1">
              {vaultStats.imagesCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('vault');
              setVaultFilter('video');
            }}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#131720] border border-white/8 text-left hover:border-white/15 transition-colors"
          >
            <div className="text-xs text-slate-400">Hosted Videos</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono-tabular mt-1">
              {vaultStats.videosCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#131720] border border-white/8 text-left hover:border-white/15 transition-colors"
          >
            <div className="text-xs text-slate-400">Vault Volume</div>
            <div className="text-xl sm:text-2xl font-bold text-white font-mono-tabular mt-1">
              {formatBytes(vaultStats.totalBytes)}
            </div>
          </button>
        </div>

        {/* TAB 1: UPLOAD STUDIO */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Mobile Upload Deck (7 cols on desktop) */}
            <div className="lg:col-span-7 space-y-5">
              <div className="p-5 sm:p-6 rounded-3xl bg-[#131720] border border-white/8 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white font-display">
                      Instant Image & Video Host
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                      Direct cloud uploads to Catbox.moe (200 MB permanent) or Litterbox
                      temporary links.
                    </p>
                  </div>
                </div>

                {/* Segmented Storage Mode Selector */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#0B0D11] rounded-2xl border border-white/6">
                    <button
                      type="button"
                      onClick={() => setStorageMode('catbox')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
                        storageMode === 'catbox'
                          ? 'bg-[#E11D48] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>Catbox Permanent</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageMode('litterbox')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
                        storageMode === 'litterbox'
                          ? 'bg-[#E11D48] text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Litterbox Auto-Expire</span>
                    </button>
                  </div>

                  {/* Litterbox Expiry Selector */}
                  {storageMode === 'litterbox' && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-slate-400">
                        Auto-delete timer:
                      </span>
                      <div className="flex items-center gap-1 p-1 bg-[#0B0D11] rounded-xl border border-white/6">
                        {(['1h', '12h', '24h', '72h'] as LitterboxExpiry[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setExpiry(t)}
                            className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-mono-tabular font-semibold transition-colors whitespace-nowrap ${
                              expiry === t
                                ? 'bg-white text-slate-950'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Touch-First Dropzone & Gallery Trigger */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFilesSelected(e.dataTransfer.files);
                  }}
                  onClick={() => mediaInputRef.current?.click()}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-[#E11D48] bg-[#E11D48]/10'
                      : 'border-white/15 hover:border-white/30 bg-[#0B0D11]/70'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#E11D48]/15 text-[#FB7185] flex items-center justify-center mx-auto mb-3.5">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <p className="text-base font-semibold text-white">
                    Tap to choose photos or videos
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports JPG, PNG, GIF, WEBP, MP4, WEBM, MOV up to 200 MB
                  </p>

                  {/* Thumb-Friendly Quick Pick Buttons */}
                  <div
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => mediaInputRef.current?.click()}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Photo / Video Gallery</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Film className="w-4 h-4" />
                      <span>Pick Video File</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Record Camera</span>
                    </button>
                  </div>
                </div>

                {/* Remote URL Mirror to Catbox */}
                <form onSubmit={handleRemoteUrlUpload} className="space-y-2 pt-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Or mirror a direct image/video URL to Catbox.moe
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={remoteUrlInput}
                        onChange={(e) => setRemoteUrlInput(e.target.value)}
                        placeholder="https://example.com/media/clip.mp4"
                        className="w-full min-h-[46px] pl-10 pr-3 py-2 rounded-xl bg-[#0B0D11] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isRemoteUploading || !remoteUrlInput.trim()}
                      className="min-h-[46px] px-4 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-40 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      {isRemoteUploading ? 'Mirroring...' : 'Upload URL'}
                    </button>
                  </div>
                </form>

                {/* Instant 1-Tap Live Demo Upload */}
                <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    Want to test a live Catbox.moe upload right now?
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickTestUpload}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#FB7185]" />
                    <span>Send Test Image to Catbox</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Upload Queue & Recent Links (5 cols on desktop) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Active Upload Queue */}
              <div className="p-5 rounded-3xl bg-[#131720] border border-white/8 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white font-display">
                    Live Transfer Queue
                  </h2>
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQueue((prev) => prev.filter((q) => q.status === 'uploading'))
                      }
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Clear finished
                    </button>
                  )}
                </div>

                {queue.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-xs text-slate-400">
                      No active transfers. Select any image or video to get an instant
                      <span className="font-mono-tabular text-slate-300">
                        {' '}
                        files.catbox.moe{' '}
                      </span>
                      link.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {queue.map((q) => (
                      <div
                        key={q.id}
                        className="p-3.5 rounded-2xl bg-[#0B0D11] border border-white/8 space-y-2.5"
                      >
                        <div className="flex items-center gap-3">
                          {q.previewUrl && q.kind === 'image' ? (
                            <img
                              src={q.previewUrl}
                              alt={q.name}
                              className="w-11 h-11 rounded-xl object-cover shrink-0 bg-[#131720]"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center shrink-0 text-[#FB7185]">
                              {q.kind === 'video' ? (
                                <Film className="w-5 h-5" />
                              ) : (
                                <ImageIcon className="w-5 h-5" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">
                              {q.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                              <span>{formatBytes(q.size)}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {q.status === 'uploading'
                                  ? `Uploading ${q.progress}%`
                                  : q.status === 'completed'
                                  ? 'Hosted on Catbox'
                                  : 'Upload Error'}
                              </span>
                            </div>
                          </div>

                          {q.status === 'completed' && q.resultUrl && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(q.resultUrl!, 'Catbox URL')}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors whitespace-nowrap"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy Link
                            </button>
                          )}
                        </div>

                        {/* Progress Bar */}
                        {q.status === 'uploading' && (
                          <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#E11D48] transition-transform duration-150 origin-left"
                              style={{
                                transform: `scaleX(${Math.max(0.05, q.progress / 100)})`,
                              }}
                            />
                          </div>
                        )}

                        {q.status === 'completed' && q.resultUrl && (
                          <div className="flex items-center justify-between gap-2 pt-1 text-xs font-mono-tabular text-emerald-400 truncate">
                            <span className="truncate select-all">{q.resultUrl}</span>
                            <a
                              href={q.resultUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-white shrink-0 inline-flex items-center gap-1"
                            >
                              <span>Open</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}

                        {q.status === 'error' && (
                          <div className="text-xs text-rose-400">
                            {q.errorMsg || 'Failed to upload file'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Vault Uploads Quick Strip */}
              {vault.length > 0 && (
                <div className="p-5 rounded-3xl bg-[#131720] border border-white/8 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white font-display">
                      Latest Catbox Links
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('vault')}
                      className="text-xs text-[#FB7185] hover:underline whitespace-nowrap"
                    >
                      View all ({vault.length})
                    </button>
                  </div>

                  <div className="divide-y divide-white/6">
                    {vault.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="min-w-0 flex-1 flex items-center gap-3 text-left group"
                        >
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#0B0D11] border border-white/8 shrink-0 flex items-center justify-center">
                            {item.kind === 'video' ? (
                              <Film className="w-4 h-4 text-[#FB7185]" />
                            ) : (
                              <img
                                src={item.url}
                                alt={item.originalName}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white group-hover:text-[#FB7185] truncate transition-colors">
                              {item.url}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular">
                              <span>{item.kind === 'video' ? 'Video' : 'Image'}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatBytes(item.size)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatRelativeTime(item.uploadedAt)}</span>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleCopyText(item.url, 'Catbox URL');
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-white/6 hover:bg-white/14 flex items-center justify-center text-white shrink-0 transition-colors"
                          aria-label="Copy Catbox URL"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MEDIA VAULT (GALLERY & VIDEO PLAYER) */}
        {activeTab === 'vault' && (
          <div className="space-y-5">
            {/* Search & Interactive Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Interactive Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-[#131720] rounded-2xl border border-white/8 overflow-x-auto">
                {(
                  [
                    { id: 'all', label: 'All Media' },
                    { id: 'image', label: 'Images' },
                    { id: 'video', label: 'Videos' },
                    { id: 'favorites', label: 'Pinned' },
                    { id: 'litterbox', label: 'Temporary' },
                  ] as { id: VaultFilter; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setVaultFilter(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      vaultFilter === tab.id
                        ? 'bg-[#E11D48] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search filename or key..."
                  className="w-full min-h-[44px] pl-10 pr-8 py-2 rounded-2xl bg-[#131720] border border-white/8 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Media Grid */}
            {filteredVault.length === 0 ? (
              <div className="p-10 rounded-3xl bg-[#131720] border border-white/8 text-center max-w-md mx-auto my-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center mx-auto">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white font-display">
                    Your Media Vault is Empty
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Upload photos or videos from your phone to generate permanent
                    Catbox.moe links with instant embed codes.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#E11D48] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Upload Photo / Video
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickTestUpload}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white/8 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Try Sample Upload
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVault.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl bg-[#131720] border border-white/8 overflow-hidden flex flex-col justify-between group hover:border-white/20 transition-colors"
                  >
                    {/* Media Thumbnail / Video Preview */}
                    <div
                      onClick={() => setSelectedItem(item)}
                      className="relative aspect-4/3 w-full bg-[#0B0D11] cursor-pointer overflow-hidden flex items-center justify-center"
                    >
                      {item.kind === 'video' ? (
                        <>
                          <video
                            src={item.url}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.originalName}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      )}

                      {/* Top-right favorite button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(item.id);
                        }}
                        className="absolute top-2.5 right-2.5 min-h-[40px] min-w-[40px] rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                        aria-label="Favorite media"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            item.favorite ? 'text-[#E11D48] fill-current' : 'text-white'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Card Details & 1-Tap Copy Bar */}
                    <div className="p-4 space-y-3">
                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="text-sm font-semibold text-white hover:text-[#FB7185] truncate block w-full text-left"
                        >
                          {item.originalName}
                        </button>
                        {/* Zero-Pill Metadata Discipline: Clean unboxed text with · separators */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono-tabular mt-1 truncate">
                          <span>{item.kind === 'video' ? 'Video' : 'Image'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBytes(item.size)}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.storageMode === 'litterbox'
                              ? formatRemainingExpiry(item.expiresAt)
                              : 'Permanent'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleCopyText(item.url, 'Catbox URL');
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/8 hover:bg-white/14 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Embed</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CLOUD ALBUMS (OFFICIAL CATBOX ALBUM SHORTLINKS) */}
        {activeTab === 'albums' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Album Builder Form */}
            <form
              onSubmit={handleCreateCatboxAlbum}
              className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-[#131720] border border-white/8 space-y-4"
            >
              <div>
                <h2 className="text-lg font-bold text-white font-display">
                  Create Catbox Cloud Album
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bundle multiple uploaded images and videos into a single shareable
                  <span className="font-mono-tabular text-slate-300">
                    {' '}
                    catbox.moe/c/{' '}
                  </span>
                  shortlink.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Album Title
                  </label>
                  <input
                    type="text"
                    required
                    value={albumTitle}
                    onChange={(e) => setAlbumTitle(e.target.value)}
                    placeholder="Weekend Trip Clips & Photos"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0B0D11] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={albumDesc}
                    onChange={(e) => setAlbumDesc(e.target.value)}
                    placeholder="Shared from Catbox Pocket Studio"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0B0D11] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      Select Permanent Vault Files ({selectedForAlbum.length} chosen)
                    </span>
                    {vault.filter((i) => i.storageMode === 'catbox').length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allPermanentIds = vault
                            .filter((i) => i.storageMode === 'catbox')
                            .map((i) => i.id);
                          setSelectedForAlbum(
                            selectedForAlbum.length === allPermanentIds.length
                              ? []
                              : allPermanentIds
                          );
                        }}
                        className="text-[#FB7185] hover:underline"
                      >
                        Toggle All
                      </button>
                    )}
                  </div>

                  {vault.filter((i) => i.storageMode === 'catbox').length === 0 ? (
                    <div className="p-4 rounded-2xl bg-[#0B0D11] border border-white/6 text-xs text-slate-400">
                      Upload at least one permanent image or video first to include it in
                      a Catbox album.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/6 rounded-2xl bg-[#0B0D11] border border-white/8 p-2">
                      {vault
                        .filter((i) => i.storageMode === 'catbox')
                        .map((item) => {
                          const isChecked = selectedForAlbum.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                setSelectedForAlbum((prev) =>
                                  prev.includes(item.id)
                                    ? prev.filter((id) => id !== item.id)
                                    : [...prev, item.id]
                                )
                              }
                              className="w-full min-h-[48px] px-2.5 py-2 flex items-center justify-between gap-3 text-left hover:bg-white/4 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                                    isChecked
                                      ? 'bg-[#E11D48] border-[#E11D48] text-white'
                                      : 'border-white/25'
                                  }`}
                                >
                                  {isChecked && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <span className="text-xs text-white truncate">
                                  {item.originalName}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                                {item.fileKey}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingAlbum || selectedForAlbum.length === 0}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isCreatingAlbum
                    ? 'Publishing Album on Catbox.moe...'
                    : 'Generate Catbox Album Link'}
                </span>
              </button>
            </form>

            {/* Created Albums List */}
            <div className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-[#131720] border border-white/8 space-y-4">
              <h2 className="text-lg font-bold text-white font-display">
                Published Cloud Albums
              </h2>

              {albums.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No albums created yet. Bundle your uploaded photos and videos to share
                  a single link.
                </div>
              ) : (
                <div className="space-y-3">
                  {albums.map((alb) => (
                    <div
                      key={alb.id}
                      className="p-4 rounded-2xl bg-[#0B0D11] border border-white/8 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white">
                            {alb.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {alb.description}
                          </p>
                        </div>
                        <span className="text-xs font-mono-tabular text-slate-400 shrink-0">
                          {alb.itemIds.length} files · {formatRelativeTime(alb.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/6">
                        <span className="text-xs font-mono-tabular text-[#FB7185] truncate select-all">
                          {alb.albumUrl}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyText(alb.albumUrl, 'Album link')}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                          <a
                            href={alb.albumUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS & CATBOX ACCOUNT USERHASH */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto p-5 sm:p-6 rounded-3xl bg-[#131720] border border-white/8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white font-display">
                Catbox Account & Upload Preferences
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Anonymous uploads work out-of-the-box. Add your optional Catbox.moe
                userhash if you want uploads linked to your Catbox account or remote file
                deletion.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Catbox.moe Userhash (Optional)
                </label>
                <input
                  type="password"
                  value={settings.userhash}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, userhash: e.target.value }))
                  }
                  placeholder="Leave blank for anonymous uploads"
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-[#0B0D11] border border-white/10 text-sm font-mono-tabular text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48]"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Found at catbox.moe/user/manage.php. Stored locally on your device.
                </p>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-white/8">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Auto-Copy Link After Upload
                  </div>
                  <div className="text-xs text-slate-400">
                    Automatically copy the direct Catbox URL to your clipboard when an
                    upload finishes.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      autoCopyLink: !prev.autoCopyLink,
                    }))
                  }
                  className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    settings.autoCopyLink
                      ? 'bg-[#E11D48] text-white'
                      : 'bg-white/8 text-slate-400'
                  }`}
                >
                  {settings.autoCopyLink ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-white/8">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Clear Local Media Vault
                  </div>
                  <div className="text-xs text-slate-400">
                    Removes saved history from this browser ({vault.length} items).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVault([]);
                    setAlbums([]);
                    showToast('Cleared local vault history');
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear History
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Ergonomic Natural Thumb Zone, <= 15% viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B0D11]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-4 items-center px-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'upload' ? 'text-[#FB7185]' : 'text-slate-400'
          }`}
        >
          <UploadCloud className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
            Upload
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vault')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'vault' ? 'text-[#FB7185]' : 'text-slate-400'
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
            Vault ({vault.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('albums')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'albums' ? 'text-[#FB7185]' : 'text-slate-400'
          }`}
        >
          <FolderPlus className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
            Albums
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'settings' ? 'text-[#FB7185]' : 'text-slate-400'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
            Settings
          </span>
        </button>
      </nav>

      {/* Camera Photo & Video Recorder Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCaptureFile={(file) => {
          setActiveTab('upload');
          uploadFileToCatbox(file, storageMode, expiry);
        }}
      />

      {/* Media Preview & Share Code Bottom Sheet */}
      <MediaPreviewModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDeleteMediaItem}
        onCopyUrl={handleCopyText}
      />
    </div>
  );
}
