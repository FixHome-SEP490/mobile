import { UserRole, type UserInfo } from '../types'
import { useAuthStore } from './auth.store'

const customer: UserInfo = {
  id: 'customer-1',
  email: 'customer@fixhome.test',
  fullName: 'FixHome Customer',
  role: UserRole.CUSTOMER,
}

const secondCustomer: UserInfo = {
  id: 'customer-2',
  email: 'customer2@fixhome.test',
  fullName: 'Second Customer',
  role: UserRole.CUSTOMER,
}

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,
      sessionGeneration: 0,
    })
  })

  it('sets an authenticated user and starts a session generation', () => {
    useAuthStore.getState().setAuth('token', customer)

    expect(useAuthStore.getState()).toMatchObject({
      token: 'token',
      user: customer,
      isAuthenticated: true,
      isLoading: false,
      sessionGeneration: 1,
    })
  })

  it('keeps the generation stable for token/profile updates in the same session', () => {
    useAuthStore.getState().setAuth('token-1', customer)
    const generation = useAuthStore.getState().sessionGeneration

    useAuthStore.getState().setAuth('token-2', { ...customer, fullName: 'Updated Customer' })

    expect(useAuthStore.getState().sessionGeneration).toBe(generation)
    expect(useAuthStore.getState().token).toBe('token-2')
  })

  it('advances the generation for an explicit transition, account change, and logout', () => {
    useAuthStore.getState().setAuth('token-1', customer)
    const firstGeneration = useAuthStore.getState().sessionGeneration

    useAuthStore.getState().beginSessionTransition()
    expect(useAuthStore.getState().sessionGeneration).toBe(firstGeneration + 1)

    useAuthStore.getState().setAuth('token-2', secondCustomer)
    expect(useAuthStore.getState().sessionGeneration).toBe(firstGeneration + 2)

    useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      sessionGeneration: firstGeneration + 3,
    })
  })
})