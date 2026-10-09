/**
 * Perkecil foto bon sebelum diunggah. Vercel menolak body request di atas
 * 4,5 MB (413), padahal foto kamera HP biasanya 3-8 MB. Sisi terpanjang 2000 px
 * masih cukup tajam untuk OCR Gemini.
 */
const MAX_SIDE = 2000
const TARGET_BYTES = 3.5 * 1024 * 1024
const QUALITY = 0.85

export async function shrinkImage(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // format yang tidak bisa dibaca browser: biarkan server yang menolak
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= TARGET_BYTES) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob || blob.size >= file.size) return file
  const name = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}
