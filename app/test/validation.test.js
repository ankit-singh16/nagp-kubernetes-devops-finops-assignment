const assert = require('node:assert/strict');
const test = require('node:test');
const { validatePost, DEFAULT_EMOJI, LIMITS } = require('../src/validation');

test('trims fields and defaults the emoji when omitted', () => {
  const { value, error } = validatePost({ author: '  Ada  ', message: '  hello  ' });

  assert.equal(error, undefined);
  assert.deepEqual(value, { author: 'Ada', message: 'hello', emoji: DEFAULT_EMOJI });
});

test('rejects empty author', () => {
  assert.match(validatePost({ author: '   ', message: 'hi' }).error, /author is required/);
});

test('rejects empty message', () => {
  assert.match(validatePost({ author: 'Ada', message: '' }).error, /message is required/);
});

test('rejects over-long message', () => {
  const long = 'x'.repeat(LIMITS.MESSAGE_MAX + 1);
  assert.match(validatePost({ author: 'Ada', message: long }).error, /at most/);
});

test('rejects a non-object body', () => {
  assert.match(validatePost(null).error, /JSON object/);
});
