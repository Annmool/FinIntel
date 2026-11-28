const { test } = require('node:test');
const assert = require('node:assert/strict');
const { notFound, errorHandler } = require('../services/httpErrors');

function response() {
  return { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
const request = { method: 'POST', path: '/api/alerts' };

test('answers unknown routes and malformed bodies with JSON', () => {
  const missing = response();
  notFound(request, missing);
  assert.deepEqual([missing.code, missing.body], [404, { error: 'Not found.' }]);

  const malformed = response();
  errorHandler(() => assert.fail('should not log'))({ type: 'entity.parse.failed', message: 'Unexpected token' }, request, malformed, () => {});
  assert.deepEqual([malformed.code, malformed.body], [400, { error: 'Request body is not valid JSON.' }]);
});

test('turns a malformed record ID into 400 and hides other failures behind a generic 500', () => {
  const cast = response();
  errorHandler(() => {})({ name: 'CastError', message: 'Cast to ObjectId failed' }, request, cast, () => {});
  assert.equal(cast.code, 400);

  const logged = [];
  const failed = response();
  errorHandler(line => logged.push(line))(new Error('mongodb+srv://user:secret@host timed out'), request, failed, () => {});
  assert.deepEqual([failed.code, failed.body], [500, { error: 'The server could not complete this request.' }]);
  assert.match(logged[0], /POST \/api\/alerts/);
});

test('defers to Express when the response has already started', () => {
  let passed;
  errorHandler(() => {})(new Error('late'), request, { headersSent: true }, error => { passed = error; });
  assert.equal(passed.message, 'late');
});
