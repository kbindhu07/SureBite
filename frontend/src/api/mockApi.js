import QRCode from 'qrcode'
import { CURRENCIES, DEFAULT_CURRENCY, TOKEN_KEY } from '../utils/constants'

const DB_KEY = 'surebite_mock_db'
const SPEED = import.meta.env.MODE === 'test' ? 0 : 1

function wait(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms * SPEED))
}

function fail(status, message) {
  const error = new Error(message)
  error.response = { status, data: { message } }
  return error
}

function randomString(length, alphabet) {
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

const objectId = () => randomString(24, '0123456789abcdef')
const menuSlug = () => randomString(10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function item(name, description, price, category, dietaryType, allergens, isVerified) {
  return { _id: objectId(), name, description, price, category, allergens, dietaryType, aiInferred: true, isVerified }
}

function extractedItems(verifiedCount = 0) {
  const items = [
    item('Chana masala', 'Chickpeas, tomato, onion, sunflower oil and spices.', 220, 'Mains', 'veg', [], false),
    item('Fish curry', 'Fish, coconut milk, tomato and mustard seeds.', 420, 'Mains', 'non_veg', ['fish', 'mustard'], false),
    item('Dal tadka', 'Yellow lentils, ghee, garlic and mustard seeds.', 240, 'Mains', 'veg', ['dairy', 'mustard'], false),
    item('Egg fried rice', 'Rice, egg, vegetables and wheat-based soy sauce.', 260, 'Rice', 'egg', ['eggs', 'soy', 'gluten'], false),
    item('Paneer tikka', 'Paneer, yogurt, bell pepper and cumin.', 320, 'Starters', 'veg', ['dairy'], false),
    item('Chicken tikka', 'Chicken, yogurt, mustard oil and spices.', 380, 'Starters', 'non_veg', ['dairy', 'mustard'], false),
  ].map((dish, index) => ({ ...dish, isVerified: index < verifiedCount }))
  const order = ['Paneer tikka', 'Chicken tikka', 'Dal tadka', 'Chana masala', 'Fish curry', 'Egg fried rice']
  return order.map((name) => items.find((dish) => dish.name === name))
}

function sampleMenuImage() {
  const rows = [
    ['STARTERS'],
    ['Paneer tikka', '₹320', 'Paneer, yogurt, bell pepper and cumin.'],
    ['Chicken tikka', '₹380', 'Chicken, yogurt, mustard oil and spices.'],
    ['MAINS'],
    ['Dal tadka', '₹240', 'Yellow lentils, ghee, garlic and mustard seeds.'],
    ['Chana masala', '₹220', 'Chickpeas, tomato, onion, sunflower oil and spices.'],
    ['Fish curry', '₹420', 'Fish, coconut milk, tomato and mustard seeds.'],
    ['RICE'],
    ['Egg fried rice', '₹260', 'Rice, egg, vegetables and wheat-based soy sauce.'],
  ]
  let y = 190
  const body = rows
    .map((row) => {
      if (row.length === 1) {
        y += 34
        return `<text x="50" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="#2D4A3E">${row[0]}</text>`
      }
      y += 34
      const line = `<text x="50" y="${y}" font-family="Georgia,serif" font-size="19" fill="#1F2A24">${row[0]}</text><text x="550" y="${y}" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#1F2A24">${row[1]}</text>`
      y += 20
      return `${line}<text x="50" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#68726C">${row[2]}</text>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${y + 80}" width="600" height="${y + 80}"><rect width="100%" height="100%" fill="#FFFDF8"/><text x="300" y="80" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#1F2A24">Saffron Table</text><line x1="50" y1="110" x2="550" y2="110" stroke="#E3E0D7"/><text x="300" y="160" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#1F2A24">Dinner menu</text>${body}<text x="300" y="${y + 50}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="10" fill="#68726C">All prices in INR · Please speak to your server about allergies.</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const DEMO_ACCOUNT = { email: 'ananya@saffrontable.in', password: 'saffron123' }

function seed() {
  const owner = objectId()
  const now = new Date().toISOString()
  const image = sampleMenuImage()
  const menu = (fields) => ({
    _id: objectId(),
    owner,
    currency: 'INR',
    slug: '',
    imageUrl: image,
    items: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
  })
  return {
    users: [
      {
        _id: owner,
        name: 'Ananya Shah',
        email: DEMO_ACCOUNT.email,
        password: DEMO_ACCOUNT.password,
        restaurantName: 'Saffron Table',
        restaurantSlug: 'saffron-table',
      },
    ],
    menus: [
      menu({ name: 'Dinner menu', status: 'published', slug: 'e43ZvleZ1z', publishedAt: now, items: extractedItems(6) }),
      menu({ name: 'Dinner menu · revision', status: 'draft', items: revisionItems() }),
      menu({ name: 'Seasonal specials', status: 'processing' }),
      menu({ name: 'Breakfast menu', status: 'failed' }),
    ],
    scans: [],
  }
}

function revisionItems() {
  return extractedItems(6).map((dish) => (dish.category === 'Starters' ? { ...dish, isVerified: false } : dish))
}

function readDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(DB_KEY))
    if (saved && Array.isArray(saved.users) && Array.isArray(saved.menus)) return saved
  } catch {
  }
  const fresh = seed()
  writeDb(fresh)
  return fresh
}

function writeDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    const slim = { ...db, menus: db.menus.map((menu) => ({ ...menu, imageUrl: menu.imageUrl.startsWith('data:image/svg') ? menu.imageUrl : '', imageUrls: [] })) }
    localStorage.setItem(DB_KEY, JSON.stringify(slim))
  }
}

export function resetMockData() {
  localStorage.removeItem(DB_KEY)
}

function publicUser(user) {
  const { password: _password, ...safe } = user
  return safe
}

function ownerView(menu) {
  const { owner: _owner, ...rest } = menu
  return rest
}

function requireUser(db) {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const user = db.users.find((candidate) => token === `mock.${candidate._id}`)
  if (!user) throw fail(401, 'Please sign in again.')
  return user
}

function requireMenu(db, user, id) {
  const menu = db.menus.find((candidate) => candidate._id === id && candidate.owner === user._id)
  if (!menu) throw fail(404, 'We could not find that menu.')
  return menu
}

function readImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve('')
    reader.onload = () => {
      const dataUrl = String(reader.result)
      if (dataUrl.length < 600_000) return resolve(dataUrl)
      const image = new Image()
      image.onerror = () => resolve('')
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      image.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

const VALID_DIETARY = ['veg', 'non_veg', 'egg']

function cleanItem(raw) {
  return {
    _id: raw._id || objectId(),
    name: String(raw.name || '').trim(),
    description: String(raw.description || '').trim(),
    price: Number(raw.price) || 0,
    category: String(raw.category || '').trim(),
    allergens: Array.isArray(raw.allergens) ? raw.allergens : [],
    dietaryType: VALID_DIETARY.includes(raw.dietaryType) ? raw.dietaryType : 'veg',
    aiInferred: Boolean(raw.aiInferred),
    isVerified: Boolean(raw.isVerified),
  }
}

export const mockApi = {
  auth: {
    async register(data) {
      await wait(500)
      const db = readDb()
      const email = String(data.email || '').trim().toLowerCase()
      if (!data.name || !email || !data.password || !data.restaurantName) {
        throw fail(400, 'Name, restaurant name, email and password are required.')
      }
      if (db.users.some((user) => user.email === email)) {
        throw fail(409, 'An account with this email already exists.')
      }
      const user = {
        _id: objectId(),
        name: data.name.trim(),
        email,
        password: data.password,
        restaurantName: data.restaurantName.trim(),
        restaurantSlug: `${slugify(data.restaurantName)}-${randomString(4, 'abcdefghijklmnopqrstuvwxyz')}`,
      }
      db.users.push(user)
      writeDb(db)
      return { token: `mock.${user._id}`, user: publicUser(user) }
    },

    async login(data) {
      await wait(500)
      const db = readDb()
      const email = String(data.email || '').trim().toLowerCase()
      const user = db.users.find((candidate) => candidate.email === email)
      if (!user || user.password !== data.password) throw fail(401, 'Incorrect email or password.')
      return { token: `mock.${user._id}`, user: publicUser(user) }
    },

    async getMe() {
      await wait(150)
      return { user: publicUser(requireUser(readDb())) }
    },
  },

  menus: {
    async getAll() {
      await wait()
      const db = readDb()
      const user = requireUser(db)
      return { menus: db.menus.filter((menu) => menu.owner === user._id).map(ownerView) }
    },

    async upload(formData) {
      const db = readDb()
      const user = requireUser(db)
      const files = formData.getAll('image')
      const file = files[0]
      const name = String(formData.get('name') || '').trim()
      const currency = String(formData.get('currency') || DEFAULT_CURRENCY)
      if (!file || files.some((entry) => typeof entry === 'string')) throw fail(400, 'Choose a menu photo to upload.')
      if (!CURRENCIES.includes(currency)) throw fail(400, 'Unsupported currency.')

      const imageUrls = await Promise.all(files.map(readImage))
      const imageUrl = imageUrls[0]
      await wait(2600)
      if (files.some((entry) => /fail/i.test(entry.name))) throw fail(422, 'The extraction service didn’t return a usable draft.')

      const now = new Date().toISOString()
      const menu = {
        _id: objectId(),
        owner: user._id,
        name: name || 'Untitled menu',
        slug: '',
        imageUrl,
        imageUrls,
        status: 'draft',
        currency,
        items: extractedItems(0),
        createdAt: now,
        updatedAt: now,
      }
      const latest = readDb()
      latest.menus.unshift(menu)
      writeDb(latest)
      return { menu: ownerView(menu) }
    },

    async getById(id) {
      await wait()
      const db = readDb()
      return { menu: ownerView(requireMenu(db, requireUser(db), id)) }
    },

    async update(id, data) {
      await wait(350)
      const db = readDb()
      const menu = requireMenu(db, requireUser(db), id)
      if (typeof data.name === 'string' && data.name.trim()) menu.name = data.name.trim()
      if (CURRENCIES.includes(data.currency)) menu.currency = data.currency
      if (Array.isArray(data.items)) menu.items = data.items.map(cleanItem)
      menu.updatedAt = new Date().toISOString()
      writeDb(db)
      return { menu: ownerView(menu) }
    },

    async publish(id) {
      await wait(500)
      const db = readDb()
      const menu = requireMenu(db, requireUser(db), id)
      if (menu.items.length === 0 || menu.items.some((dish) => !dish.isVerified)) {
        throw fail(400, 'Every dish must be verified before the menu can be published.')
      }
      menu.status = 'published'
      if (!menu.slug) menu.slug = menuSlug()
      menu.updatedAt = new Date().toISOString()
      menu.publishedAt = menu.updatedAt
      writeDb(db)
      return { menu: ownerView(menu) }
    },

    async getQr(id) {
      await wait(300)
      const db = readDb()
      const menu = requireMenu(db, requireUser(db), id)
      if (menu.status !== 'published' || !menu.slug) throw fail(400, 'Publish this menu to create its QR code.')
      const publicUrl = `${window.location.origin}/m/${menu.slug}`
      const options = { margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1F2A24', light: '#FFFFFF' } }
      const qrPng = await QRCode.toDataURL(publicUrl, { ...options, width: 1024 })
      const qrSvg = await QRCode.toString(publicUrl, { ...options, type: 'svg' })
      return { qrPng, qrSvg, publicUrl }
    },

    async delete(id) {
      await wait(300)
      const db = readDb()
      const menu = requireMenu(db, requireUser(db), id)
      db.menus = db.menus.filter((candidate) => candidate._id !== menu._id)
      writeDb(db)
      return { success: true }
    },
  },

  diner: {
    async getMenu(slug) {
      await wait(500)
      const db = readDb()
      const menu = db.menus.find((candidate) => candidate.slug === slug && candidate.status === 'published')
      if (!menu) throw fail(404, 'This menu is not available.')
      const owner = db.users.find((user) => user._id === menu.owner)
      return { menu: { ...ownerView(menu), restaurantName: owner ? owner.restaurantName : '' } }
    },

    async logScan(slug, data = {}) {
      const db = readDb()
      db.scans = [...(db.scans || []), { slug, ...data, createdAt: new Date().toISOString() }]
      writeDb(db)
      return { success: true }
    },
  },
}
