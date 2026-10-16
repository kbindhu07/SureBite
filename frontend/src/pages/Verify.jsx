import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Loader2, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import api, { getErrorMessage } from '../api/api'
import { DietaryMark } from '../components/DishCard'
import ImageInspector from '../components/ImageInspector'
import UndoToast from '../components/UndoToast'
import { useAuth } from '../context/AuthContext'
import {
  ALLERGENS,
  CURRENCIES,
  CURRENCY_SYMBOLS,
  DEFAULT_CATEGORIES,
  DIETARY_LABELS,
  DIETARY_TYPES,
  allergenLabel,
  formatAllergens,
} from '../utils/constants'

const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,2fr)_8rem_5.5rem_6.5rem_minmax(0,1.1fr)_8.5rem] lg:gap-3'

let nextKey = 0
function toDraft(items = []) {
  return items.map((dish) => ({ ...dish, allergens: dish.allergens || [], _key: dish._id || `new-${(nextKey += 1)}` }))
}

function toPayload(items) {
  return items.map(({ _key, ...dish }) => ({
    ...dish,
    name: dish.name.trim(),
    description: (dish.description || '').trim(),
    category: (dish.category || '').trim(),
    price: Number(dish.price),
  }))
}

function findProblem(items) {
  for (const dish of items) {
    const label = dish.name.trim() || 'A dish'
    if (!dish.name.trim()) return 'Every dish needs a name.'
    if (dish.price === '' || Number.isNaN(Number(dish.price)) || Number(dish.price) < 0) return `${label} needs a valid price.`
    if (!(dish.category || '').trim()) return `${label} needs a category.`
  }
  return ''
}

function Verify() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [menu, setMenu] = useState(null)
  const [items, setItems] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [removed, setRemoved] = useState(null)
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')

  function load() {
    setLoading(true)
    setLoadError('')
    api.menus
      .getById(id)
      .then(({ menu: found }) => {
        const draft = toDraft(found.items)
        setMenu(found)
        setItems(draft)
        const firstUnverified = draft.find((dish) => !dish.isVerified)
        setSelectedKey((firstUnverified || draft[0])?._key ?? null)
        setDirty(false)
      })
      .catch((err) => setLoadError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])

  useEffect(() => {
    if (!dirty) return
    const warn = (event) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function touch() {
    setDirty(true)
    setSaved(false)
    setError('')
  }

  function editItem(key, patch, { needsReview = false } = {}) {
    touch()
    setItems((current) =>
      current.map((dish) => (dish._key === key ? { ...dish, ...patch, ...(needsReview ? { isVerified: false } : {}) } : dish)),
    )
  }

  function toggleAllergen(dish, allergen) {
    const allergens = dish.allergens.includes(allergen)
      ? dish.allergens.filter((a) => a !== allergen)
      : ALLERGENS.filter((a) => a === allergen || dish.allergens.includes(a))
    editItem(dish._key, { allergens, aiInferred: false }, { needsReview: true })
  }

  function addDish() {
    const [dish] = toDraft([
      { name: '', description: '', price: '', category: 'Mains', allergens: [], dietaryType: 'veg', aiInferred: false, isVerified: false },
    ])
    touch()
    setItems((current) => [...current, dish])
    setSelectedKey(dish._key)
    setOnlyNeedsReview(false)
  }

  function removeDish(dish) {
    touch()
    setRemoved({ dish, index: items.findIndex((candidate) => candidate._key === dish._key) })
    setItems((current) => current.filter((candidate) => candidate._key !== dish._key))
    setSelectedKey(null)
  }

  function undoRemove() {
    if (!removed) return
    setItems((current) => {
      const next = [...current]
      next.splice(Math.min(removed.index, next.length), 0, removed.dish)
      return next
    })
    setSelectedKey(removed.dish._key)
    setRemoved(null)
  }

  const dismissRemoved = useCallback(() => setRemoved(null), [])

  async function save() {
    const problem = findProblem(items)
    if (problem) {
      setError(problem)
      return null
    }
    const { menu: updated } = await api.menus.update(id, { name: menu.name, currency: menu.currency, items: toPayload(items) })
    const selectedIndex = items.findIndex((dish) => dish._key === selectedKey)
    const draft = toDraft(updated.items)
    setMenu(updated)
    setItems(draft)
    setSelectedKey(draft[selectedIndex]?._key ?? null)
    setDirty(false)
    return updated
  }

  async function handleSave() {
    setBusy('saving')
    setError('')
    try {
      if (await save()) setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  async function handlePublish() {
    setBusy('publishing')
    setError('')
    try {
      if (dirty && !(await save())) return
      await api.menus.publish(id)
      navigate(`/menus/${id}/qr`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <p className="page-loader" role="status">Loading the menu…</p>

  if (!menu) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="notice notice-red" role="alert">
          {loadError}
        </p>
        <Link to="/dashboard" className="btn btn-secondary">
          <ArrowLeft size={15} aria-hidden="true" /> Back to menus
        </Link>
      </div>
    )
  }

  if (menu.status === 'processing' || menu.status === 'failed') {
    const failed = menu.status === 'failed'
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="eyebrow">{menu.name}</p>
        <h1 className="text-3xl">{failed ? 'We couldn’t finish reading this menu.' : 'Still reading your menu…'}</h1>
        <p className={`notice ${failed ? 'notice-red' : 'notice-green'}`}>
          {failed
            ? 'There is no extraction to review. Nothing was published. Upload the photo again, or try a clearer one.'
            : 'AI is still preparing the first draft. Nothing is visible to diners. Check again in a moment.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {failed ? (
            <Link to="/upload" className="btn btn-primary">
              Retry upload
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={load}>
              Check again
            </button>
          )}
          <Link to="/dashboard" className="btn btn-secondary">
            Back to menus
          </Link>
        </div>
      </div>
    )
  }

  const isPublished = menu.status === 'published'
  const total = items.length
  const verified = items.filter((dish) => dish.isVerified).length
  const unverified = items.filter((dish) => !dish.isVerified)
  const allVerified = total > 0 && unverified.length === 0
  const selected = items.find((dish) => dish._key === selectedKey) || null
  const shown = onlyNeedsReview ? unverified : items
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...items.map((dish) => dish.category).filter(Boolean)])]
  const symbol = CURRENCY_SYMBOLS[menu.currency] || ''
  const canSave = dirty && !busy && (!isPublished || allVerified)
  const unverifiedNames = unverified.map((dish) => dish.name.trim() || 'the new dish').join(' and ')

  return (
    <div className="space-y-5">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft size={12} aria-hidden="true" /> Menus / {menu.name}
        </Link>
        <p className="eyebrow mt-3">
          {user?.restaurantName} · {isPublished ? 'Published · Public' : 'Draft · Private'}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl">A human eye on every dish.</h1>
          <span className={`pill ${allVerified ? 'pill-green' : 'pill-amber'}`}>
            {verified} / {total} dishes verified
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">Check the extracted details against the original menu and your kitchen’s recipes.</p>
      </div>

      <div className="notice notice-amber">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">AI suggestions are preliminary. Review is required.</p>
          <p className="mt-1 text-xs">
            Confirm names, ingredients, category, prices, dietary type and allergens for every dish.{' '}
            {isPublished ? 'This menu is live: changes reach diners when you save.' : 'This draft is not visible to diners.'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3.2fr)]">
        <aside className="space-y-4">
          <ImageInspector imageUrls={menu.imageUrls?.length ? menu.imageUrls : [menu.imageUrl]} alt={`Original photo of ${menu.name}`} caption="Use zoom to inspect small text." />
          <div className="notice notice-green">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <p className="font-semibold">Check with the kitchen</p>
              <p className="mt-1 text-xs text-muted">
                A paper menu may not list every ingredient. Verify allergen tags against the full recipe, including oils, sauces and garnishes.
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-sm font-semibold tracking-normal">Extracted dishes · {total}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={!onlyNeedsReview} onClick={() => setOnlyNeedsReview(false)} className={`pill ${!onlyNeedsReview ? 'bg-brand text-white' : 'pill-grey'}`}>
                All dishes
              </button>
              <button type="button" aria-pressed={onlyNeedsReview} onClick={() => setOnlyNeedsReview(true)} className={`pill ${onlyNeedsReview ? 'bg-brand text-white' : 'pill-amber'}`}>
                Needs review · {unverified.length}
              </button>
              <label className="pill pill-green">
                Currency:
                <select
                  className="bg-transparent font-semibold focus:outline-none"
                  value={menu.currency}
                  onChange={(event) => {
                    touch()
                    setMenu({ ...menu, currency: event.target.value })
                  }}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addDish}>
                <Plus size={13} aria-hidden="true" /> Add dish
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className={`hidden bg-brand-soft px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider ${ROW_GRID}`}>
              <span>Dish &amp; ingredients</span>
              <span>Category</span>
              <span>{symbol} / {menu.currency}</span>
              <span>Dietary type</span>
              <span>Allergens</span>
              <span>Review</span>
            </div>

            {shown.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted">
                {total === 0 ? 'No dishes were extracted. Add your dishes by hand, or upload a clearer photo.' : 'Every dish has been verified.'}
              </p>
            )}

            <ul>
              {shown.map((dish) => {
                const isSelected = dish._key === selectedKey
                const label = dish.name.trim() || 'new dish'
                return (
                  <li
                    key={dish._key}
                    className={`space-y-3 border-t border-line px-4 py-4 first:border-t-0 lg:space-y-0 ${ROW_GRID} ${isSelected ? 'bg-brand-soft/60' : ''}`}
                    onFocus={() => setSelectedKey(dish._key)}
                  >
                    <div className="space-y-1.5">
                      <input
                        className="input py-1.5 font-semibold"
                        value={dish.name}
                        placeholder="Dish name"
                        aria-label="Dish name"
                        onChange={(event) => editItem(dish._key, { name: event.target.value }, { needsReview: true })}
                      />
                      <input
                        className="input py-1.5 text-xs"
                        value={dish.description || ''}
                        placeholder="Ingredients or description"
                        aria-label={`Ingredients for ${label}`}
                        onChange={(event) => editItem(dish._key, { description: event.target.value }, { needsReview: true })}
                      />
                    </div>

                    <select
                      className="input self-start py-1.5 text-xs"
                      value={dish.category || ''}
                      aria-label={`Category for ${label}`}
                      onChange={(event) => editItem(dish._key, { category: event.target.value })}
                    >
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>

                    <input
                      className="input self-start py-1.5 text-xs"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={dish.price}
                      aria-label={`Price for ${label} in ${menu.currency}`}
                      onChange={(event) => editItem(dish._key, { price: event.target.value })}
                    />

                    <div className="self-start">
                      <DietaryMark dietaryType={dish.dietaryType} />
                    </div>

                    <div className="self-start text-xs">
                      <p>{dish.allergens.length > 0 ? formatAllergens(dish.allergens) : 'None listed'}</p>
                      <p className={`mt-0.5 text-[11px] ${dish.isVerified ? 'text-muted' : 'text-warn-text'}`}>
                        {dish.isVerified ? 'Staff confirmed' : dish.aiInferred ? 'AI inferred' : 'Not yet confirmed'}
                      </p>
                    </div>

                    <div className="flex items-start justify-between gap-2 self-start lg:flex-col">
                      <span className={`pill ${dish.isVerified ? 'pill-green' : 'pill-amber'}`}>
                        {dish.isVerified ? (
                          <>
                            <Check size={11} aria-hidden="true" /> Verified
                          </>
                        ) : (
                          'Needs review'
                        )}
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-brand"
                          checked={Boolean(dish.isVerified)}
                          onChange={(event) => editItem(dish._key, { isVerified: event.target.checked })}
                          aria-label={`${label} verified`}
                        />
                        Verify dish
                      </label>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {selected && (
            <div key={selected._key} className="card animate-fade-in border-brand p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Editing selected dish</p>
                  <h2 className="mt-1 font-sans text-lg font-semibold tracking-normal">{selected.name.trim() || 'New dish'}</h2>
                </div>
                <span className={`pill ${selected.isVerified ? 'pill-green' : 'pill-amber'}`}>
                  {selected.isVerified ? 'Staff verified' : selected.aiInferred ? 'AI inferred · Unverified' : 'Unverified'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">Dietary type</span>
                {DIETARY_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected.dietaryType === type}
                    onClick={() => editItem(selected._key, { dietaryType: type }, { needsReview: true })}
                    className={`pill px-3 py-1.5 ${selected.dietaryType === type ? 'bg-brand text-white' : 'bg-brand-soft text-ink hover:bg-brand-tint'}`}
                  >
                    {selected.dietaryType === type && <Check size={11} aria-hidden="true" />}
                    {DIETARY_LABELS[type]}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs font-semibold">Allergens present in this dish</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {ALLERGENS.map((allergen) => {
                  const present = selected.allergens.includes(allergen)
                  return (
                    <button
                      key={allergen}
                      type="button"
                      aria-pressed={present}
                      onClick={() => toggleAllergen(selected, allergen)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium ${
                        present ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand'
                      }`}
                    >
                      {present ? <Check size={12} aria-hidden="true" /> : <Plus size={12} className="text-muted" aria-hidden="true" />}
                      {allergenLabel(allergen)}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-md text-xs text-muted">
                  {selected.aiInferred && !selected.isVerified && (
                    <span className="block font-semibold text-warn-text">
                      AI suggested {selected.allergens.length > 0 ? formatAllergens(selected.allergens) : 'no allergens'} from the menu text.
                    </span>
                  )}
                  Confirm the full recipe and preparation before marking this dish verified.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDish(selected)}>
                    <Trash2 size={13} aria-hidden="true" /> Remove dish
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(selected.isVerified)}
                    onClick={() => editItem(selected._key, { isVerified: true })}
                  >
                    <Check size={13} aria-hidden="true" /> {selected.isVerified ? 'Dish verified' : 'Mark dish verified'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="notice notice-red" role="alert">
              {error}
            </p>
          )}

          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div aria-live="polite">
              <p className="text-sm font-semibold">
                {total === 0 && 'Add at least one dish before publishing'}
                {total > 0 && allVerified && `All ${total} dishes verified`}
                {total > 0 && !allVerified && `${verified} of ${total} verified · ${unverified.length} ${unverified.length === 1 ? 'dish still needs' : 'dishes still need'} your review`}
              </p>
              <p className="mt-1 text-xs text-muted">
                {saved && !dirty && 'Changes saved. '}
                {dirty && 'You have unsaved changes. '}
                {total > 0 && !allVerified && `Verify ${unverifiedNames} to ${isPublished ? 'save changes to this live menu' : 'enable publishing'}.`}
                {!isPublished && !allVerified && ' Saving keeps this menu private.'}
                {!isPublished && allVerified && 'Publishing makes this menu public and creates its QR code.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={!canSave}>
                {busy === 'saving' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                Save changes
              </button>
              {isPublished ? (
                <Link to={`/menus/${id}/qr`} className="btn btn-primary">
                  View QR code
                </Link>
              ) : (
                <button type="button" className="btn btn-primary" onClick={handlePublish} disabled={!allVerified || Boolean(busy)}>
                  {busy === 'publishing' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                  Publish menu
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {removed && (
        <UndoToast
          key={removed.dish._key}
          message={`“${removed.dish.name.trim() || 'Dish'}” removed. Save to keep this change.`}
          onUndo={undoRemove}
          onTimeout={dismissRemoved}
        />
      )}
    </div>
  )
}

export default Verify
