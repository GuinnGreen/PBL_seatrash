export async function compressImageFile(file, {
  maxSide = 1600,
  quality = 0.82,
} = {}) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('請選擇圖片檔。');
  }

  const image = await loadDrawableImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image.drawable, 0, 0, width, height);
  image.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((out) => {
      if (out) resolve(out);
      else reject(new Error('照片壓縮失敗，請換一張照片再試。'));
    }, 'image/jpeg', quality);
  });

  return { blob, width, height };
}

async function loadDrawableImage(file) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      drawable: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('照片讀取失敗，請換一張照片再試。'));
      el.src = url;
    });
    return {
      drawable: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
