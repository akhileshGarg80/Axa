import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  Trash2,
  ExternalLink,
  Heart,
  Film,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import { CatboxMediaItem } from '../types/media';
import {
  formatBytes,
  formatRelativeTime,
  formatRemainingExpiry,
  getShareSnippets,
} from '../utils/mediaHelpers';

interface MediaPreviewModalProps {
  item: CatboxMediaItem | null;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (item: CatboxMediaItem) => void;
  onCopyUrl: (text: string, label?: string) => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  item,
  onClose,
  onToggleFavorite,
  onDelete,
  onCopyUrl,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const snippets = getShareSnippets(item);

  const handleCopySnippet = (id: string, code: string, label: string) => {
    onCopyUrl(code, label);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.originalName,
          text: `Hosted on Catbox.moe: ${item.originalName}`,
          url: item.url,
        });
        return;
      } catch {
        // user cancelled
      }
    }
    handleCopySnippet('direct', item.url, 'Direct link');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#131720] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle for Mobile Sheet */}
        <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <div className="min-w-0 pr-3">
            <h3 className="text-base font-semibold text-white truncate">
              {item.originalName}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono-tabular mt-0.5">
              <span>{item.kind === 'video' ? 'Video' : 'Image'}</span>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(item.size)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {item.storageMode === 'litterbox'
                  ? `Litterbox (${formatRemainingExpiry(item.expiresAt)})`
                  : 'Catbox Permanent'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatRelativeTime(item.uploadedAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(item.id)}
              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors ${
                item.favorite
                  ? 'text-[#E11D48] bg-[#E11D48]/15'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              aria-label="Pin to favorites"
            >
              <Heart className={`w-5 h-5 ${item.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Media Stage */}
          <div className="relative rounded-2xl overflow-hidden bg-[#0B0D11] border border-white/8 flex items-center justify-center min-h-[220px] max-h-[380px]">
            {item.kind === 'video' ? (
              <video
                src={item.url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[360px] object-contain"
              />
            ) : !imgError ? (
              <img
                src={item.url}
                alt={item.originalName}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full max-h-[360px] object-contain"
              />
            ) : (
              <div className="p-8 text-center">
                <ImageIcon className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400">{item.url}</p>
              </div>
            )}
          </div>

          {/* Primary Instant Actions */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleCopySnippet('direct', item.url, 'Direct link')}
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {copiedKey === 'direct' ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied URL
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy URL
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              Share Link
            </button>

            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              Open Raw
            </a>
          </div>

          {/* Embed & Link Formats */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-400">
              Embed & Direct Formats
            </h4>
            <div className="space-y-2">
              {snippets.map((snip) => {
                const isCopied = copiedKey === snip.id;
                return (
                  <div
                    key={snip.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#0B0D11] border border-white/6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-400 mb-0.5">
                        {snip.label}
                      </div>
                      <div className="text-xs font-mono-tabular text-slate-200 truncate select-all">
                        {snip.code}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySnippet(snip.id, snip.code, snip.label)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-white flex items-center gap-1.5 shrink-0 transition-colors whitespace-nowrap"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Delete Row */}
          <div className="pt-2 border-t border-white/8 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono-tabular">
              Key: {item.fileKey}
            </span>
            <button
              type="button"
              onClick={() => {
                onDelete(item);
                onClose();
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              Remove from Vault
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
