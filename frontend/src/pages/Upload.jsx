import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Images,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload as UploadIcon,
  X,
} from 'lucide-react'
import api, { getErrorMessage } from '../api/api'
import CameraCapture from '../components/CameraCapture'
import { useAuth } from '../context/AuthContext'
import { CURRENCIES, CURRENCY_SYMBOLS, DEFAULT_CURRENCY } from '../utils/constants'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 10
const MAX_PHOTOS = 10

let nextPhotoId = 0

const PHOTO_TIPS = [
  'Keep the whole menu in frame.',
  'Use even light and avoid glare.',
  'Hold the camera straight, not at an angle.',
  'Make names, ingredients and prices readable.',
  'Check that the photo is sharp before uploading.',
]

function Stepper({ current }) {
  const steps = ['Upload photo', 'AI extraction', 'Verify & publish']
  return (
    <ol className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      {steps.map((label, index) => {
        const number = index + 1
        const done = number < current
        const active = number === current
        return (
          <li key={label} className={`flex items-center gap-2 ${active || done ? 'font-semibold text-ink' : 'text-muted'}`} aria-current={active ? 'step' : undefined}>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active || done ? 'bg-brand text-white' : 'bg-line text-muted'
              }`}
            >
              {done ? <Check size={11} aria-label="Done" /> : number}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

function photoCount(photos) {
  return `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`
}

function OriginalPreview({ photos, currency, badge }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Original menu</p>
        <span className="pill pill-green">{badge}</span>
      </div>
      <div className="max-h-[30rem] space-y-3 overflow-y-auto">
        {photos.map((photo, index) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={`Menu photo ${index + 1} of ${photos.length}`}
            className="w-full rounded-xl border border-line bg-white object-contain"
          />
        ))}
      </div>
      <p className="mt-2 break-all text-xs text-muted">
        {photos.length === 1 ? photos[0].file.name : photoCount(photos)} · Currency: {currency}
      </p>
    </div>
  )
}

function Upload() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const cameraInput = useRef(null)

  const [phase, setPhase] = useState('ready')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [photos, setPhotos] = useState([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')

  const photoUrls = useRef([])
  photoUrls.current = photos.map((photo) => photo.url)
  useEffect(() => () => photoUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function addFiles(candidates) {
    const list = Array.from(candidates || [])
    if (list.length === 0) return
    let error = ''
    const accepted = []
    for (const candidate of list) {
      if (!ACCEPTED_TYPES.includes(candidate.type)) error = 'Choose a JPG, PNG or WebP image.'
      else if (candidate.size > MAX_SIZE_MB * 1024 * 1024) error = `Choose an image smaller than ${MAX_SIZE_MB} MB.`
      else accepted.push(candidate)
    }
    const room = MAX_PHOTOS - photos.length
    if (accepted.length > room) error = `You can add up to ${MAX_PHOTOS} photos per menu.`
    const added = accepted.slice(0, Math.max(room, 0)).map((candidate) => ({ id: ++nextPhotoId, file: candidate, url: URL.createObjectURL(candidate) }))
    setErrors((current) => ({ ...current, file: error }))
    if (added.length) setPhotos((current) => [...current, ...added])
  }

  function removePhoto(target) {
    URL.revokeObjectURL(target.url)
    setPhotos((current) => current.filter((photo) => photo.id !== target.id))
    setErrors((current) => ({ ...current, file: '' }))
  }

  function openCamera() {
    const isPhone = window.matchMedia('(pointer: coarse)').matches
    if (isPhone || !navigator.mediaDevices?.getUserMedia) {
      cameraInput.current.click()
      return
    }
    setCameraOpen(true)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  async function runUpload() {
    setPhase('processing')
    setFailure('')
    try {
      const formData = new FormData()
      photos.forEach((photo) => formData.append('image', photo.file))
      formData.append('name', name.trim())
      formData.append('currency', currency)
      const { menu } = await api.menus.upload(formData)
      if (menu.status === 'failed') {
        setFailure('The extraction service didn’t return a usable draft.')
        setPhase('failed')
        return
      }
      navigate(`/menus/${menu._id}/verify`)
    } catch (error) {
      setFailure(getErrorMessage(error))
      setPhase('failed')
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const found = {}
    if (!name.trim()) found.name = 'Give this menu a name, like “Dinner menu”.'
    if (photos.length === 0) found.file = 'Choose a photo of your menu to continue.'
    setErrors(found)
    if (Object.keys(found).length === 0) runUpload()
  }

  function chooseAnother() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url))
    setPhotos([])
    setPhase('ready')
  }

  const eyebrow = `${user?.restaurantName || 'Your restaurant'} · ${phase === 'ready' ? 'New menu' : name.trim()}`

  if (phase === 'processing') {
    return (
      <div className="space-y-6">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-4xl">Reading your menu…</h1>
          <p className="mt-2 text-sm text-muted">Your photo is uploaded. AI is preparing a draft for your team to review.</p>
        </div>
        <Stepper current={2} />
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <OriginalPreview photos={photos} currency={currency} badge={photos.length > 1 ? 'Photos uploaded' : 'Photo uploaded'} />
          <div className="card p-6 sm:p-8" role="status" aria-live="polite">
            <div className="flex flex-col items-center text-center">
              <Loader2 size={40} className="animate-spin text-brand" aria-hidden="true" />
              <span className="pill pill-green mt-4">Processing · Private</span>
              <h2 className="mt-4 text-3xl">A first draft is taking shape.</h2>
              <p className="mt-3 max-w-lg text-sm text-muted">
                We’re reading dish names, ingredients and prices, and looking for possible allergens. Please keep this page open.
              </p>
            </div>
            <ul className="mt-6 space-y-4 border-t border-line pt-6 text-sm">
              <li className="flex gap-3">
                <Check size={16} className="mt-0.5 text-brand" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Photo received</p>
                  <p className="text-xs text-muted">Your original is ready for comparison.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Loader2 size={16} className="mt-0.5 animate-spin text-brand" aria-hidden="true" />
                <div>
                  <p className="font-semibold">AI extraction in progress</p>
                  <p className="text-xs text-muted">Reading the photo and suggesting dish details.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Lock size={16} className="mt-0.5 text-muted" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Staff review comes next</p>
                  <p className="text-xs text-muted">You’ll check every dish before publishing.</p>
                </div>
              </li>
            </ul>
            <div className="notice notice-green mt-6">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <div>
                <p className="font-semibold">Not visible to diners</p>
                <p className="mt-1 text-xs text-muted">No dishes have been published. AI suggestions must be checked by restaurant staff first.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-6">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-4xl">Let’s give that another try.</h1>
          <p className="mt-2 text-sm text-muted">Your {photos.length > 1 ? 'photos are' : 'photo is'} still here, but AI couldn’t finish extracting the menu.</p>
        </div>
        <Stepper current={2} />
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <OriginalPreview photos={photos} currency={currency} badge={photos.length > 1 ? 'Photos retained' : 'Photo retained'} />
          <div className="card p-6 sm:p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-bg text-danger-text">
              <AlertCircle size={20} aria-hidden="true" />
            </span>
            <span className="pill pill-red mt-4">Extraction failed · Private</span>
            <h2 className="mt-4 text-3xl">We couldn’t finish reading this menu.</h2>
            <p className="mt-3 text-sm text-muted" role="alert">
              {failure} No dishes were published. You can retry with the same {photos.length > 1 ? 'photos' : 'photo'} or choose clearer ones.
            </p>
            <div className="notice notice-red mt-5">
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Your menu is not visible to diners.</p>
                <p className="mt-1 text-xs">There is no completed extraction to review yet. Any menu you already published is unchanged.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={runUpload}>
                <RefreshCw size={15} aria-hidden="true" /> Retry extraction
              </button>
              <button type="button" className="btn btn-secondary" onClick={chooseAnother}>
                <Images size={15} aria-hidden="true" /> Choose other photos
              </button>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm font-semibold">Before you try again</p>
              <ul className="mt-3 space-y-2 text-xs text-muted">
                {['Check that the entire menu is in frame.', 'Use a sharp photo with readable text and prices.', 'Avoid shadows, folds and reflections.'].map((tip) => (
                  <li key={tip} className="flex items-center gap-2">
                    <Check size={13} className="text-brand" aria-hidden="true" /> {tip}
                  </li>
                ))}
              </ul>
              <Link to="/dashboard" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-brand">
                <ArrowLeft size={13} aria-hidden="true" /> Back to menus
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-4xl">Start with a photo.</h1>
        <p className="mt-2 text-sm text-muted">Your existing paper menu is all you need to get started.</p>
      </div>
      <Stepper current={1} />

      <div className="grid gap-6 lg:grid-cols-[5fr_3fr]">
        <form className="card space-y-6 p-5 sm:p-6" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="menu-name" className="label">
              Menu name
            </label>
            <input
              id="menu-name"
              className={`input ${errors.name ? 'input-error' : ''}`}
              value={name}
              placeholder="Dinner menu"
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors((current) => ({ ...current, name: '' }))
              }}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <p className="mt-1.5 text-xs font-medium text-danger-text">{errors.name}</p>}
          </div>

          <fieldset>
            <legend className="label">Currency</legend>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={currency === code}
                  onClick={() => setCurrency(code)}
                  className={`pill px-3 py-1.5 ${currency === code ? 'bg-brand text-white' : 'bg-brand-soft text-ink hover:bg-brand-tint'}`}
                >
                  {code} {CURRENCY_SYMBOLS[code]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{currency} is selected. All extracted prices will use this currency.</p>
          </fieldset>

          <div>
            <div
              className={`flex flex-col items-center rounded-2xl border border-dashed px-4 py-10 text-center transition-colors ${
                dragging ? 'border-brand bg-brand-soft' : errors.file ? 'border-danger-text bg-danger-bg/40' : 'border-line bg-cream'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {photos.length > 0 ? (
                <>
                  <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((photo, index) => (
                      <li key={photo.id} className="relative rounded-lg border border-line bg-white p-1.5">
                        <img src={photo.url} alt={`Selected menu photo ${index + 1}`} className="h-32 w-full rounded object-contain" />
                        <p className="mt-1 truncate text-[11px] font-semibold" title={photo.file.name}>
                          {index + 1}. {photo.file.name}
                        </p>
                        <p className="text-[11px] text-muted">{(photo.file.size / 1024 / 1024).toFixed(1)} MB</p>
                        <button
                          type="button"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white hover:bg-ink"
                          onClick={() => removePhoto(photo)}
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    {photoCount(photos)} selected. Add every page of a multi-page menu, in order.
                  </p>
                </>
              ) : (
                <>
                  <ImagePlus size={28} className={`text-brand transition-transform duration-300 ${dragging ? '-translate-y-1 scale-110' : ''}`} aria-hidden="true" />
                  <p className="mt-3 font-semibold">Drop your menu photos here</p>
                  <p className="mt-1 text-xs text-muted">Or choose images from your device. Add one photo per page.</p>
                </>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${photos.length ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => fileInput.current.click()}
                  disabled={photos.length >= MAX_PHOTOS}
                >
                  <UploadIcon size={14} aria-hidden="true" /> {photos.length ? 'Add more photos' : 'Choose images'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openCamera} disabled={photos.length >= MAX_PHOTOS}>
                  <Camera size={14} aria-hidden="true" /> Use camera
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted">
                Use your phone or laptop camera. JPG, PNG or WebP, up to {MAX_SIZE_MB} MB each, {MAX_PHOTOS} photos max.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                className="sr-only"
                multiple
                aria-label="Menu photo"
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Take a menu photo"
                tabIndex={-1}
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              {cameraOpen && (
                <CameraCapture
                  onClose={() => setCameraOpen(false)}
                  onCapture={(photo) => {
                    setCameraOpen(false)
                    addFiles([photo])
                  }}
                />
              )}
            </div>
            {errors.file && (
              <p className="mt-1.5 text-xs font-medium text-danger-text" role="alert">
                {errors.file}
              </p>
            )}
          </div>

          <div className="notice notice-green">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <p className="font-semibold">A person checks every dish.</p>
              <p className="mt-1 text-xs text-muted">
                AI extraction is a starting point. Your staff must review ingredients and allergen suggestions before publishing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{photos.length ? 'Ready when you are.' : 'Choose a photo to continue.'}</p>
            <button type="submit" className="btn btn-primary">
              <Sparkles size={15} aria-hidden="true" /> Upload &amp; extract
            </button>
          </div>
        </form>

        <aside className="self-start rounded-2xl bg-brand-soft p-6">
          <Camera size={20} className="text-brand" aria-hidden="true" />
          <h2 className="mt-5 text-2xl leading-snug">
            A clearer photo.
            <br />A better first draft.
          </h2>
          <p className="mt-4 text-xs text-muted">A few small checks help AI read your menu correctly.</p>
          <ol className="mt-4 space-y-4 text-xs">
            {PHOTO_TIPS.map((tip, index) => (
              <li key={tip} className="flex gap-3">
                <span className="font-bold">{String(index + 1).padStart(2, '0')}</span> {tip}
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[11px] text-muted">After extraction, compare every dish against your menu and kitchen recipes.</p>
        </aside>
      </div>
    </div>
  )
}

export default Upload
