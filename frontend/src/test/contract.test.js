import { describe, expect, it } from 'vitest'
import api from '../api/api'
import { DEMO_ACCOUNT } from '../api/mockApi'
import { filterDishes } from '../hooks/useMenuFilter'
import { ALLERGENS, TOKEN_KEY } from '../utils/constants'

const DISHES = [
  { name: 'Paneer tikka', dietaryType: 'veg', allergens: ['dairy'] },
  { name: 'Chana masala', dietaryType: 'veg', allergens: [] },
  { name: 'Fish curry', dietaryType: 'non_veg', allergens: ['fish', 'mustard'] },
  { name: 'Egg fried rice', dietaryType: 'egg', allergens: ['eggs', 'soy', 'gluten'] },
]
const names = (items) => items.map((dish) => dish.name)

describe('filterDishes (spec section 8)', () => {
  it('shows everything with no filters', () => {
    expect(filterDishes(DISHES, { dietaryPreference: 'all', selectedAllergens: [], filterMode: 'hide' })).toHaveLength(4)
  })

  it('veg excludes non-veg and egg dishes', () => {
    const result = filterDishes(DISHES, { dietaryPreference: 'veg', selectedAllergens: [], filterMode: 'hide' })
    expect(names(result)).toEqual(['Paneer tikka', 'Chana masala'])
  })

  it('non_veg shows only non-veg dishes', () => {
    const result = filterDishes(DISHES, { dietaryPreference: 'non_veg', selectedAllergens: [], filterMode: 'hide' })
    expect(names(result)).toEqual(['Fish curry'])
  })

  it('hide mode removes dishes containing a selected allergen', () => {
    const result = filterDishes(DISHES, { dietaryPreference: 'all', selectedAllergens: ['dairy', 'gluten'], filterMode: 'hide' })
    expect(names(result)).toEqual(['Chana masala', 'Fish curry'])
  })

  it('mark mode keeps conflicting dishes visible', () => {
    const result = filterDishes(DISHES, { dietaryPreference: 'all', selectedAllergens: ['dairy', 'gluten'], filterMode: 'mark' })
    expect(result).toHaveLength(4)
  })
})

describe('constants', () => {
  it('has the 14 canonical allergens', () => {
    expect(ALLERGENS).toEqual([
      'dairy', 'gluten', 'eggs', 'peanuts', 'tree_nuts', 'soy', 'fish',
      'shellfish', 'sesame', 'mustard', 'celery', 'lupin', 'molluscs', 'sulfites',
    ])
  })
})

describe('mock API follows the spec response shapes', () => {
  async function signIn() {
    const { token, user } = await api.auth.login(DEMO_ACCOUNT)
    localStorage.setItem(TOKEN_KEY, token)
    return user
  }

  function photo(name = 'menu.png') {
    const formData = new FormData()
    formData.append('image', new File(['fake'], name, { type: 'image/png' }))
    formData.append('name', 'Lunch menu')
    formData.append('currency', 'USD')
    return formData
  }

  it('register and login return { token, user } without the password', async () => {
    const data = await api.auth.register({ name: 'Ravi', email: 'Ravi@Example.com', password: 'password1', restaurantName: 'Mandi House' })
    expect(Object.keys(data).sort()).toEqual(['token', 'user'])
    expect(data.user).toMatchObject({ name: 'Ravi', email: 'ravi@example.com', restaurantName: 'Mandi House' })
    expect(data.user.restaurantSlug).toMatch(/^mandi-house-/)
    expect(data.user.password).toBeUndefined()
    await expect(api.auth.login({ email: 'ravi@example.com', password: 'wrong' })).rejects.toMatchObject({ response: { status: 401 } })
  })

  it('manager calls need a token', async () => {
    await expect(api.menus.getAll()).rejects.toMatchObject({ response: { status: 401 } })
  })

  it('getMe returns { user }', async () => {
    const user = await signIn()
    expect(await api.auth.getMe()).toEqual({ user })
  })

  it('upload keeps every photo of a multi-page menu', async () => {
    await signIn()
    const formData = photo()
    formData.append('image', new File(['fake2'], 'page-2.png', { type: 'image/png' }))
    const { menu } = await api.menus.upload(formData)
    expect(menu.imageUrls).toHaveLength(2)
    expect(menu.imageUrl).toBe(menu.imageUrls[0])
  })

  it('runs upload -> verify -> publish -> QR -> diner', async () => {
    await signIn()
    const before = (await api.menus.getAll()).menus

    const { menu } = await api.menus.upload(photo())
    expect(menu).toMatchObject({ name: 'Lunch menu', status: 'draft', currency: 'USD' })
    expect(menu._id).toMatch(/^[0-9a-f]{24}$/)
    expect(menu.imageUrl).toMatch(/^data:image\/png/)
    expect(menu.items.length).toBeGreaterThan(0)
    for (const dish of menu.items) {
      expect(Object.keys(dish).sort()).toEqual(
        ['_id', 'aiInferred', 'allergens', 'category', 'description', 'dietaryType', 'isVerified', 'name', 'price'].sort(),
      )
      expect(dish.aiInferred).toBe(true)
      expect(dish.isVerified).toBe(false)
      expect(['veg', 'non_veg', 'egg']).toContain(dish.dietaryType)
      expect(dish.allergens.every((allergen) => ALLERGENS.includes(allergen))).toBe(true)
    }
    expect((await api.menus.getAll()).menus).toHaveLength(before.length + 1)

    await expect(api.menus.publish(menu._id)).rejects.toMatchObject({ response: { status: 400 } })
    await expect(api.menus.getQr(menu._id)).rejects.toMatchObject({ response: { status: 400 } })

    const verifiedItems = menu.items.map((dish) => ({ ...dish, isVerified: true }))
    const updated = (await api.menus.update(menu._id, { items: verifiedItems })).menu
    expect(updated.items.every((dish) => dish.isVerified)).toBe(true)

    const published = (await api.menus.publish(menu._id)).menu
    expect(published.status).toBe('published')
    expect(published.slug).toMatch(/^[A-Za-z0-9]{10}$/)

    const qr = await api.menus.getQr(menu._id)
    expect(Object.keys(qr).sort()).toEqual(['publicUrl', 'qrPng', 'qrSvg'])
    expect(qr.publicUrl).toMatch(new RegExp(`/m/${published.slug}$`))

    const diner = (await api.diner.getMenu(published.slug)).menu
    expect(diner.items).toHaveLength(menu.items.length)
    expect(diner.owner).toBeUndefined()
    expect(await api.diner.logScan(published.slug, {})).toEqual({ success: true })

    expect(await api.menus.delete(menu._id)).toEqual({ success: true })
    await expect(api.diner.getMenu(published.slug)).rejects.toMatchObject({ response: { status: 404 } })
  })

  it('a failed extraction rejects and creates no menu', async () => {
    await signIn()
    const before = (await api.menus.getAll()).menus.length
    await expect(api.menus.upload(photo('fail-blurry.png'))).rejects.toMatchObject({ response: { status: 422 } })
    expect((await api.menus.getAll()).menus).toHaveLength(before)
  })

  it('draft menus are not public', async () => {
    await signIn()
    const draft = (await api.menus.getAll()).menus.find((menu) => menu.status === 'draft')
    expect(draft.slug).toBe('')
    await expect(api.diner.getMenu('not-a-real-slug')).rejects.toMatchObject({ response: { status: 404 } })
  })
})
