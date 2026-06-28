export async function compressImageFile(file, {
  maxSide = 1600,
  quality = 0.82,
  maxBytes = 4.5 * 1024 * 1024,
} = {}) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('請選擇圖片檔。');
  }

  const image = await loadDrawableImage(file);
  let side = maxSide;
  let width = 0;
  let height = 0;
  let blob = null;

  const attempts = [
    { side, quality },
    { side, quality: 0.74 },
    { side, quality: 0.66 },
    { side: 1400, quality: 0.72 },
    { side: 1200, quality: 0.68 },
    { side: 1000, quality: 0.64 },
  ];

  try {
    for (const attempt of attempts) {
      side = Math.min(maxSide, attempt.side);
      const scale = Math.min(1, side / Math.max(image.width, image.height));
      width = Math.max(1, Math.round(image.width * scale));
      height = Math.max(1, Math.round(image.height * scale));
      blob = await renderJpeg(image.drawable, width, height, attempt.quality);
      if (blob.size <= maxBytes) break;
    }
  } finally {
    image.close?.();
  }

  if (!blob || blob.size > maxBytes) {
    throw new Error('照片壓縮後仍超過上傳限制，請換一張或裁切後再試。');
  }

  return { blob, width, height };
}

function renderJpeg(drawable, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(drawable, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => {
      if (out) resolve(out);
      else reject(new Error('照片壓縮失敗，請換一張照片再試。'));
    }, 'image/jpeg', quality);
  });
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
