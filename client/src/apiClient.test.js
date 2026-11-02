var mockRequestInterceptor;

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      interceptors: {
        request: {
          use: jest.fn(interceptor => { mockRequestInterceptor = interceptor; })
        }
      },
      get: jest.fn()
    }))
  }
}));

import apiClient from './apiClient';
import { auth } from './firebase';

jest.mock('./firebase', () => ({ auth: { currentUser: null } }));

describe('API authentication client', () => {
  afterEach(() => {
    auth.currentUser = null;
  });

  test('adds a Firebase ID token to signed-in requests', async () => {
    auth.currentUser = { getIdToken: jest.fn().mockResolvedValue('test-id-token') };
    const sentConfig = await mockRequestInterceptor({ headers: {} });

    expect(sentConfig.headers.Authorization).toBe('Bearer test-id-token');
  });

  test('does not add an authorization header to public signed-out requests', async () => {
    const sentConfig = await mockRequestInterceptor({ headers: {} });

    expect(sentConfig.headers?.Authorization).toBeUndefined();
  });
});
