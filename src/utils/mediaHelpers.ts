import { CatboxMediaItem, LitterboxExpiry, MediaKind } from '../types/media';

export function detectMediaKind(mimeType: string, filename: string): MediaKind {
  const lower = (filename || '').toLowerCase();
  if (
    mimeType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/i.test(lower)
  ) {
    return 'image';
  }
  if (
    mimeType.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(lower)
  ) {
    return 'video';
  }
  return 'other';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 10 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function calculateExpiryTimestamp(expiry: LitterboxExpiry): number {
  const hoursMap: Record<LitterboxExpiry, number> = {
    '1h': 1,
    '12h': 12,
    '24h': 24,
    '72h': 72,
  };
  return Date.now() + (hoursMap[expiry] || 24) * 3600 * 1000;
}

export function formatRemainingExpiry(expiresAt?: number): string {
  if (!expiresAt) return 'Permanent';
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return 'Expired';
  const totalMinutes = Math.floor(remainingMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m left`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m left`;
}

export function getShareSnippets(item: CatboxMediaItem) {
  const isVideo = item.kind === 'video';
  return [
    {
      id: 'direct',
      label: 'Direct Catbox Link',
      code: item.url,
    },
    {
      id: 'markdown',
      label: 'Markdown',
      code: isVideo
        ? `[${item.originalName}](${item.url})`
        : `![${item.originalName}](${item.url})`,
    },
    {
      id: 'html',
      label: isVideo ? 'HTML5 Video Embed' : 'HTML Image Tag',
      code: isVideo
        ? `<video src="${item.url}" controls preload="metadata" style="max-width:100%;border-radius:12px;"></video>`
        : `<img src="${item.url}" alt="${item.originalName}" loading="lazy" />`,
    },
    {
      id: 'bbcode',
      label: 'Forum BBCode',
      code: isVideo ? `[video]${item.url}[/video]` : `[img]${item.url}[/img]`,
    },
  ];
}

/**
 * Generates a real PNG image File on the fly so users can test a live
 * Catbox.moe upload with a single tap on mobile.
 */
export async function createSampleImageFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;

  // Rich dark editorial gradient background
  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(0.5, '#1E1B4B');
  grad.addColorStop(1, '#881337');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  // Subtle geometric circles
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 3;
  for (let r = 140; r <= 460; r += 80) {
    ctx.beginPath();
    ctx.arc(540, 480, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Glowing crimson orb
  const orbGrad = ctx.createRadialGradient(540, 480, 20, 540, 480, 220);
  orbGrad.addColorStop(0, '#FB7185');
  orbGrad.addColorStop(0.4, '#E11D48');
  orbGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(540, 480, 220, 0, Math.PI * 2);
  ctx.fill();

  // Crisp typography
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CATBOX POCKET STUDIO', 540, 820);

  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font = '32px monospace';
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  ctx.fillText(`LIVE TEST CARD · ${stamp}`, 540, 880);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png', 0.95)
  );
  return new File([blob], `catbox-sample-${Date.now().toString().slice(-5)}.png`, {
    type: 'image/png',
  });
}
