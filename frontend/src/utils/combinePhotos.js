export const UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024

const MAX_WIDTH = 1600
const MAX_HEIGHT = 16000
const GAP = 24

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`We couldn’t read “${file.name}”. Try a different photo.`))
    }
    image.src = url
  })
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function render(images, scale, quality) {
  const width = Math.round(Math.min(MAX_WIDTH, Math.max(...images.map((image) => image.naturalWidth))) * scale)
  const heights = images.map((image) => Math.round((image.naturalHeight * width) / image.naturalWidth))
  const height = heights.reduce((total, h) => total + h, 0) + GAP * (images.length - 1)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  let y = 0
  images.forEach((image, index) => {
    context.drawImage(image, 0, y, width, heights[index])
    y += heights[index] + GAP
  })
  return toBlob(canvas, quality)
}

export async function combinePhotos(files) {
  if (files.length === 1 && files[0].size <= UPLOAD_LIMIT_BYTES) return files[0]

  const images = await Promise.all(files.map(loadImage))
  const width = Math.min(MAX_WIDTH, Math.max(...images.map((image) => image.naturalWidth)))
  const fullHeight = images.reduce((total, image) => total + (image.naturalHeight * width) / image.naturalWidth, 0)
  let scale = Math.min(1, MAX_HEIGHT / fullHeight)

  const attempts = [0.85, 0.75, 0.65]
  for (let round = 0; round < 4; round++) {
    for (const quality of attempts) {
      const blob = await render(images, scale, quality)
      if (blob && blob.size <= UPLOAD_LIMIT_BYTES) {
        const name = files.length === 1 ? files[0].name.replace(/\.\w+$/, '.jpg') : `menu-${files.length}-pages.jpg`
        return new File([blob], name, { type: 'image/jpeg' })
      }
    }
    scale *= 0.8
  }
  throw new Error('These photos are too large to upload together. Try fewer pages or smaller photos.')
}
