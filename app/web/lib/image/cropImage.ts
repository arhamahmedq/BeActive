// Render the crop region (from react-easy-crop, in source-image pixels) — with
// rotation applied — into a square output canvas and return a JPEG Blob. Standard
// react-easy-crop canvas recipe; pixelCrop is square (aspect=1) so output is square.
//
// Accepts File | Blob directly (matching stripExif's pattern) so the function owns
// the object URL lifecycle internally. This avoids React Strict Mode's double-effect
// cleanup revoking a component-managed URL before canvas processing starts.

interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

const toRad = (deg: number) => (deg * Math.PI) / 180

export async function getCroppedBlob(
  imageSource: File | Blob,
  pixelCrop: PixelCrop,
  rotation = 0,
  outputSize = 512,
): Promise<Blob> {
  const url = URL.createObjectURL(imageSource)
  const image = await loadImage(url).finally(() => URL.revokeObjectURL(url))
  const rot = toRad(rotation)

  // 1) Draw the (rotated) image onto a canvas sized to its rotated bounding box.
  const bBoxW = Math.abs(Math.cos(rot) * image.width) + Math.abs(Math.sin(rot) * image.height)
  const bBoxH = Math.abs(Math.sin(rot) * image.width) + Math.abs(Math.cos(rot) * image.height)
  const work = document.createElement('canvas')
  work.width = Math.round(bBoxW)
  work.height = Math.round(bBoxH)
  const wctx = work.getContext('2d')
  if (!wctx) throw new Error('Canvas not supported')
  wctx.translate(bBoxW / 2, bBoxH / 2)
  wctx.rotate(rot)
  wctx.drawImage(image, -image.width / 2, -image.height / 2)

  // 2) Extract the crop region and draw it, downscaled, into the square output.
  const out = document.createElement('canvas')
  out.width = outputSize
  out.height = outputSize
  const octx = out.getContext('2d')
  if (!octx) throw new Error('Canvas not supported')
  octx.drawImage(
    work,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  )

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))), 'image/jpeg', 0.9)
  })
}
