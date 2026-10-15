import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import api from '../api/api'
import { DEMO_ACCOUNT } from '../api/mockApi'
import { TOKEN_KEY } from '../utils/constants'

function open(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

async function signInDirectly() {
  const { token } = await api.auth.login(DEMO_ACCOUNT)
  localStorage.setItem(TOKEN_KEY, token)
}

const dish = (name) => screen.queryByRole('heading', { name })

describe('branding', () => {
  it('the landing page says SureBite and never AllergyMenu', () => {
    open('/')
    expect(screen.getAllByText('SureBite').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/AllergyMenu/i)
    expect(screen.getByRole('heading', { name: 'AI Infers. Humans Verify. Diners Stay Safe.' })).toBeInTheDocument()
  })
})

describe('auth', () => {
  it('sends signed-out managers to /auth and validates the form', async () => {
    const user = userEvent.setup()
    open('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email address'), DEMO_ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })

  it('signs in and lands on the dashboard that was requested', async () => {
    const user = userEvent.setup()
    open('/dashboard')
    await user.type(await screen.findByLabelText('Email address'), DEMO_ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), DEMO_ACCOUNT.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Your menus' })).toBeInTheDocument()
    expect(screen.getByText('Dinner menu · revision')).toBeInTheDocument()
    expect(screen.getByText('4 / 6 verified')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue verification' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy()
  })

  it('registers a new restaurant and shows the empty dashboard', async () => {
    const user = userEvent.setup()
    open('/auth?mode=register')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter your restaurant’s name.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Manager name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Restaurant name'), 'Mandi House')
    await user.type(screen.getByLabelText('Email address'), 'ravi@mandi.in')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Password'), 'er-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'No menus yet' })).toBeInTheDocument()
  })
})

describe('manager flow', () => {
  it('uploads, verifies every dish, publishes and shows the QR code', async () => {
    const user = userEvent.setup()
    await signInDirectly()
    open('/upload')

    await user.click(await screen.findByRole('button', { name: /Upload & extract/ }))
    expect(screen.getByText(/Give this menu a name/)).toBeInTheDocument()
    expect(screen.getByText('Choose a photo of your menu to continue.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Menu name'), 'Lunch menu')
    await user.upload(screen.getByLabelText('Menu photo'), new File(['x'], 'lunch.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /Upload & extract/ }))

    expect(await screen.findByRole('heading', { name: 'A human eye on every dish.' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText('0 / 6 dishes verified')).toBeInTheDocument()
    const publish = screen.getByRole('button', { name: /Publish menu/ })
    expect(publish).toBeDisabled()

    const price = screen.getByLabelText('Price for Paneer tikka in INR')
    await user.clear(price)
    await user.type(price, '350')
    await user.click(screen.getByLabelText('Dish name', { selector: 'input[value="Paneer tikka"]' }))
    await user.click(screen.getByRole('button', { name: 'Sesame' }))

    for (const box of screen.getAllByRole('checkbox')) await user.click(box)
    expect(screen.getByText('6 / 6 dishes verified')).toBeInTheDocument()
    expect(publish).toBeEnabled()

    await user.click(publish)
    expect(await screen.findByRole('heading', { name: 'Your menu is ready for the table.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download PNG/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download SVG/ })).toBeInTheDocument()

    const saved = (await api.menus.getAll()).menus.find((menu) => menu.name === 'Lunch menu')
    expect(saved.status).toBe('published')
    expect(screen.getByLabelText('Public menu link')).toHaveValue(`${window.location.origin}/m/${saved.slug}`)
    const paneer = saved.items.find((item) => item.name === 'Paneer tikka')
    expect(paneer).toMatchObject({ price: 350, allergens: ['dairy', 'sesame'], aiInferred: false, isVerified: true })
    expect(paneer._key).toBeUndefined()
  })

  it('editing a verified dish sends it back to review', async () => {
    const user = userEvent.setup()
    await signInDirectly()
    const draft = (await api.menus.getAll()).menus.find((menu) => menu.status === 'draft')
    open(`/menus/${draft._id}/verify`)

    expect(await screen.findByText('4 / 6 dishes verified')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Ingredients for Dal tadka'), ' Cream.')
    expect(screen.getByText('3 / 6 dishes verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish menu/ })).toBeDisabled()
  })

  it('shows the extraction-failed state and nothing is created', async () => {
    const user = userEvent.setup()
    await signInDirectly()
    open('/upload')
    await user.type(await screen.findByLabelText('Menu name'), 'Blurry')
    await user.upload(screen.getByLabelText('Menu photo'), new File(['x'], 'fail.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /Upload & extract/ }))
    expect(await screen.findByRole('heading', { name: 'We couldn’t finish reading this menu.' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry extraction/ })).toBeInTheDocument()
  })

  it('rejects files that are not images', async () => {
    const user = userEvent.setup({ applyAccept: false })
    await signInDirectly()
    open('/upload')
    await user.upload(await screen.findByLabelText('Menu photo'), new File(['x'], 'menu.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('Choose a JPG, PNG or WebP image.')).toBeInTheDocument()
  })

  it('accepts several menu pages, up to five, and lets you remove one', async () => {
    const user = userEvent.setup()
    await signInDirectly()
    open('/upload')
    const page = (n) => new File(['x'], `page-${n}.png`, { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Menu photo'), [page(1), page(2)])
    expect(screen.getByRole('img', { name: 'Menu page 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Menu page 2' })).toBeInTheDocument()
    expect(screen.getByText(/2 of 5 photos/)).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Menu photo'), [page(3), page(4), page(5), page(6)])
    expect(screen.getByText(/5 of 5 photos/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('You can add up to 5 photos.')

    await user.click(screen.getByRole('button', { name: 'Remove page 1' }))
    expect(screen.getByText(/4 of 5 photos/)).toBeInTheDocument()
    expect(screen.getByText('page-2.png')).toBeInTheDocument()
  })

  it('will not show a QR code for a draft', async () => {
    await signInDirectly()
    const draft = (await api.menus.getAll()).menus.find((menu) => menu.status === 'draft')
    open(`/menus/${draft._id}/qr`)
    expect(await screen.findByRole('heading', { name: 'This menu isn’t published yet.' })).toBeInTheDocument()
  })

  it('deletes a menu from the dashboard straight away and can undo it', async () => {
    const user = userEvent.setup()
    await signInDirectly()
    open('/dashboard')
    await user.click(await screen.findByRole('button', { name: 'Delete Breakfast menu' }))
    expect(screen.queryByText('Breakfast menu')).not.toBeInTheDocument()
    expect(screen.getByText('All menus · 3')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('“Breakfast menu” deleted.')

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(screen.getByText('Breakfast menu')).toBeInTheDocument()
    expect(screen.getByText('All menus · 4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Breakfast menu' }))
    await user.click(screen.getByRole('button', { name: 'Delete Seasonal specials' }))
    await waitFor(async () => {
      const { menus } = await api.menus.getAll()
      expect(menus.map((menu) => menu.name)).not.toContain('Breakfast menu')
    })
  })
})

describe('diner menu', () => {
  it('filters by diet and allergens with hide and mark modes', async () => {
    const user = userEvent.setup()
    const scan = vi.spyOn(api.diner, 'logScan')
    open('/m/e43ZvleZ1z')

    expect(await screen.findByRole('heading', { name: 'Saffron Table' })).toBeInTheDocument()
    expect(scan).toHaveBeenCalledWith('e43ZvleZ1z', {})
    expect(screen.getAllByText(/Cross-contact may occur in the kitchen/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '6 dishes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'Gluten' }))
    expect(screen.getByRole('heading', { name: '2 dishes match your filters' })).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 6 dishes · 4 hidden by your filters')).toBeInTheDocument()
    expect(dish('Chana masala')).toBeInTheDocument()
    expect(dish('Fish curry')).toBeInTheDocument()
    expect(dish('Paneer tikka')).not.toBeInTheDocument()
    expect(dish('Egg fried rice')).not.toBeInTheDocument()
    expect(screen.getByText('Starters · 0')).toBeInTheDocument()
    expect(screen.getByText('Mains · 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark' }))
    expect(screen.getByRole('heading', { name: '2 dishes match your filters' })).toBeInTheDocument()
    expect(screen.getByText('Showing all 6 dishes · 4 have allergen conflicts')).toBeInTheDocument()
    const paneer = dish('Paneer tikka').closest('article')
    expect(within(paneer).getByText('Allergen conflict: Dairy')).toBeInTheDocument()
    expect(within(dish('Egg fried rice').closest('article')).getByText('Allergen conflict: Gluten')).toBeInTheDocument()
    expect(within(dish('Chana masala').closest('article')).getByText('Matches your filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await user.click(screen.getByRole('button', { name: 'Veg' }))
    expect(dish('Paneer tikka')).toBeInTheDocument()
    expect(dish('Fish curry')).not.toBeInTheDocument()
    expect(dish('Egg fried rice')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Non-Veg' }))
    expect(dish('Chicken tikka')).toBeInTheDocument()
    expect(dish('Egg fried rice')).not.toBeInTheDocument()
    expect(dish('Paneer tikka')).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup()
    open('/m/e43ZvleZ1z')
    await user.click(await screen.findByRole('button', { name: 'Non-Veg' }))
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'Fish' }))
    expect(screen.getByRole('heading', { name: 'No matching dishes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show dishes with warnings' }))
    expect(dish('Fish curry')).toBeInTheDocument()
  })

  it('does not open an unpublished or unknown menu', async () => {
    open('/m/doesNotExist')
    expect(await screen.findByRole('heading', { name: 'We couldn’t open this menu.' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This menu is not available.')
  })
})
