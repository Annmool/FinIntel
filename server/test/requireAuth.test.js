const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireAuth } = require('../middleware/requireAuth');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('requires a bearer token', async () => {
  const middleware = createRequireAuth(async () => ({ uid: 'user-1' }));
  const res = responseRecorder();
  let continued = false;
  await middleware({ headers: {} }, res, () => { continued = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(continued, false);
});

test('rejects invalid tokens', async () => {
  const middleware = createRequireAuth(async () => { throw new Error('bad token'); });
  const res = responseRecorder();
  await middleware({ headers: { authorization: 'Bearer invalid' } }, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('attaches the verified identity before continuing', async () => {
  const identity = { uid: 'firebase-user-7' };
  const middleware = createRequireAuth(async token => {
    assert.equal(token, 'valid-token');
    return identity;
  });
  const req = { headers: { authorization: 'Bearer valid-token' } };
  let continued = false;
  await middleware(req, responseRecorder(), () => { continued = true; });
  assert.equal(req.user, identity);
  assert.equal(continued, true);
});
