import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, uploadImage } from '../api';
import type { UploadedImage } from '../types';

type LocalImage = { id: string; name: string; file: File; previewUrl: string };
export type PendingImage = LocalImage & (
  { status: 'uploading' } |
  { status: 'ready'; uploaded: UploadedImage } |
  { status: 'error'; error: string }
);

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
}

export function useAttachments(notify: (message: string) => void) {
  const [images, setImages] = useState<PendingImage[]>([]);
  const current = useRef<PendingImage[]>([]);
  const uploads = useRef(new Map<string, AbortController>());

  function publish(next: PendingImage[]) {
    current.current = next;
    setImages(next);
  }

  const dispose = useCallback(() => {
    for (const controller of uploads.current.values()) controller.abort();
    uploads.current.clear();
    for (const image of current.current) URL.revokeObjectURL(image.previewUrl);
    current.current = [];
  }, []);
  useEffect(() => dispose, [dispose]);

  function clear() {
    dispose();
    setImages([]);
  }

  async function upload(image: PendingImage) {
    if (uploads.current.has(image.id)) return;
    const controller = new AbortController();
    uploads.current.set(image.id, controller);
    const replace = (next: PendingImage) => {
      if (!controller.signal.aborted) publish(current.current.map(item => item.id === image.id ? next : item));
    };
    replace({ ...image, status: 'uploading' });

    try {
      const data = await readBase64(image.file);
      if (controller.signal.aborted) return;
      const uploaded = await uploadImage(image.name, data, controller.signal);
      replace({ ...image, status: 'ready', uploaded });
    } catch (error) {
      replace({ ...image, status: 'error', error: errorMessage(error) });
    } finally {
      if (uploads.current.get(image.id) === controller) uploads.current.delete(image.id);
    }
  }

  function add(files: File[]) {
    const added: PendingImage[] = [];
    for (const file of files) {
      if (current.current.length + added.length >= 4) {
        notify('每条消息最多 4 张图片');
        break;
      }
      if (!imageTypes.includes(file.type)) {
        notify('仅支持 PNG、JPEG、WebP 图片');
        continue;
      }
      if (file.size > 6 * 1024 * 1024) {
        notify('每张图片最多 6MB');
        continue;
      }
      added.push({
        id: crypto.randomUUID(), name: file.name || '粘贴图片', file,
        previewUrl: URL.createObjectURL(file), status: 'uploading',
      });
    }
    if (added.length) publish([...current.current, ...added]);
    for (const image of added) void upload(image);
  }

  function remove(id: string) {
    const image = current.current.find(item => item.id === id);
    if (!image) return;
    uploads.current.get(id)?.abort();
    uploads.current.delete(id);
    URL.revokeObjectURL(image.previewUrl);
    publish(current.current.filter(item => item.id !== id));
  }

  function retry(id: string) {
    const image = current.current.find(item => item.id === id);
    if (image?.status === 'error') void upload(image);
  }

  return { images, add, clear, remove, retry };
}
