import { forwardRef, useMemo, useRef, useState } from 'react';
import { Image } from 'antd';
import HTMLFlipBook from 'react-pageflip';
import { FaChevronLeft, FaChevronRight, FaImages } from 'react-icons/fa';
import { useGetMemoryAlbumQuery } from '../api';
import { MINS_PER_DAY } from '../time/GameTime';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import type { MemoryAlbumEntry } from '../features/pets/travel/PetTravelTypes';
import {
  MEMORY_ALBUM_IMAGE_PREVIEW_ROOT_CLASS,
  MEMORY_ALBUM_IMAGE_PREVIEW_Z_INDEX,
  MemoryAlbumImage,
} from './MemoryAlbumImage';
import './MemoryAlbumModal.css';

interface MemoryAlbumModalProps {
  roomId?: string | null;
  worldId?: string;
}

interface FlipBookRef {
  pageFlip: () => {
    flipNext: () => void;
    flipPrev: () => void;
  } | undefined;
}

const PHOTOS_PER_PAGE = 4;

function chunkEntries(entries: MemoryAlbumEntry[]): MemoryAlbumEntry[][] {
  const pages: MemoryAlbumEntry[][] = [];
  for (let index = 0; index < entries.length; index += PHOTOS_PER_PAGE) {
    pages.push(entries.slice(index, index + PHOTOS_PER_PAGE));
  }
  return pages;
}

function formatAlbumMinute(value?: number): string {
  const minute = Number(value || 0);
  if (!Number.isFinite(minute) || minute <= 0) return '未知时间';
  const day = Math.floor(minute / MINS_PER_DAY);
  const minuteOfDay = Math.floor(minute % MINS_PER_DAY);
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mins = String(minuteOfDay % 60).padStart(2, '0');
  return `Day ${day} · ${hours}:${mins}`;
}

interface AlbumPageProps {
  entries: MemoryAlbumEntry[];
  pageNumber: number;
  totalPages: number;
}

const AlbumPage = forwardRef<HTMLDivElement, AlbumPageProps>(function AlbumPage(
  { entries, pageNumber, totalPages },
  ref,
) {
  return (
    <div ref={ref} className="memory-album__page">
      <div className="memory-album__page-head">
        <span>旅行相册</span>
        <span>{pageNumber} / {totalPages}</span>
      </div>
      <div className="memory-album__photo-grid">
        {entries.map((entry, index) => (
          <figure
            key={entry.id}
            className={`memory-album__photo-card memory-album__photo-card--${index % 4}`}
          >
            <MemoryAlbumImage className="memory-album__photo" imageUrl={entry.imageUrl} alt={entry.title} />
            <figcaption>
              <strong>{entry.displayName || '小动物'}</strong>
              <span>{formatAlbumMinute(entry.createdAtGameMinute)}</span>
              <em>{entry.scene || entry.caption}</em>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
});

export function MemoryAlbumModal({ roomId, worldId = DEFAULT_WORLD_ID }: MemoryAlbumModalProps) {
  const { data, isFetching, refetch } = useGetMemoryAlbumQuery({ roomId, worldId });
  const entries = useMemo(
    () => [...(data?.entries ?? [])].sort((a, b) => Number(a.createdAtGameMinute || 0) - Number(b.createdAtGameMinute || 0)),
    [data?.entries],
  );
  const pages = useMemo(() => chunkEntries(entries), [entries]);
  const [pageIndex, setPageIndex] = useState(0);
  const bookRef = useRef<FlipBookRef | null>(null);
  const safePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));

  if (entries.length === 0) {
    return (
      <div className="memory-album memory-album--empty">
        <FaImages className="memory-album__empty-icon" />
        <h3>还没有照片</h3>
        <p>{isFetching ? '正在翻找相册...' : '等小动物出门回来后，照片会贴到这里。'}</p>
        <button type="button" onClick={() => refetch()}>刷新</button>
      </div>
    );
  }

  const go = (delta: number) => {
    if (delta > 0) {
      bookRef.current?.pageFlip()?.flipNext();
    } else {
      bookRef.current?.pageFlip()?.flipPrev();
    }
  };

  return (
    <div className="memory-album">
      <div className="memory-album__viewer">
        <button type="button" className="memory-album__nav" onClick={() => go(-1)} aria-label="上一页">
          <FaChevronLeft />
        </button>
        <Image.PreviewGroup
          preview={{
            rootClassName: MEMORY_ALBUM_IMAGE_PREVIEW_ROOT_CLASS,
            zIndex: MEMORY_ALBUM_IMAGE_PREVIEW_Z_INDEX,
          }}
        >
          <div className="memory-album__book-wrap">
            <HTMLFlipBook
              ref={bookRef}
              className="memory-album__book"
              style={{}}
              startPage={0}
              width={460}
              height={540}
              size="stretch"
              minWidth={220}
              maxWidth={520}
              minHeight={300}
              maxHeight={580}
              drawShadow
              flippingTime={760}
              usePortrait
              startZIndex={0}
              autoSize
              maxShadowOpacity={0.45}
              showCover={false}
              mobileScrollSupport
              clickEventForward
              useMouseEvents
              swipeDistance={24}
              showPageCorners
              disableFlipByClick
              onFlip={(event: { data: number }) => setPageIndex(Number(event.data || 0))}
            >
              {pages.map((pageEntries, index) => (
                <AlbumPage
                  key={pageEntries.map((entry) => entry.id).join(':')}
                  entries={pageEntries}
                  pageNumber={index + 1}
                  totalPages={pages.length}
                />
              ))}
            </HTMLFlipBook>
          </div>
        </Image.PreviewGroup>
        <button type="button" className="memory-album__nav" onClick={() => go(1)} aria-label="下一页">
          <FaChevronRight />
        </button>
      </div>
      <div className="memory-album__footer">
        <span>第 {safePageIndex + 1} 页 / 共 {pages.length} 页</span>
        <span>{entries.length} 张照片 · 点击照片放大</span>
      </div>
    </div>
  );
}
