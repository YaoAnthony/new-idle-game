import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Image } from 'antd';
import type { RootState } from '../../../../../Redux/store';
import { getEnv } from '../../../../../config/env';
import './MemoryAlbumImage.css';

interface MemoryAlbumImageProps {
  imageUrl?: string | null;
  alt: string;
  className?: string;
  preview?: boolean;
}

const { backendUrl } = getEnv();
export const MEMORY_ALBUM_IMAGE_PREVIEW_ROOT_CLASS = 'system-idle-game-image-preview';
export const MEMORY_ALBUM_IMAGE_PREVIEW_Z_INDEX = 120000;

function absoluteImageUrl(imageUrl: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${backendUrl}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`;
}

export function MemoryAlbumImage({
  imageUrl,
  alt,
  className,
  preview = true,
}: MemoryAlbumImageProps) {
  const token = useSelector((state: RootState) => state.user.accessToken);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    if (!imageUrl || !token) {
      setFailed(Boolean(imageUrl));
      return () => {};
    }
    fetch(absoluteImageUrl(imageUrl), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [imageUrl, token]);

  if (objectUrl) {
    return (
      <Image
        wrapperClassName={['memory-album-image', className].filter(Boolean).join(' ')}
        className="memory-album-image__img"
        src={objectUrl}
        alt={alt}
        preview={preview ? {
          mask: '放大查看',
          rootClassName: MEMORY_ALBUM_IMAGE_PREVIEW_ROOT_CLASS,
          zIndex: MEMORY_ALBUM_IMAGE_PREVIEW_Z_INDEX,
        } : false}
      />
    );
  }
  return (
    <div className={['memory-album-image', className, 'memory-album-image-fallback'].filter(Boolean).join(' ')}>
      {failed ? '照片读取失败' : '照片显影中'}
    </div>
  );
}
