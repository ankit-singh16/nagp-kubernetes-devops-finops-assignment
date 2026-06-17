const LIMITS = {
  AUTHOR_MAX: 40,
  MESSAGE_MAX: 280,
  EMOJI_MAX: 8
};

const DEFAULT_EMOJI = '👋';

// Validates a post submission at the system boundary.
// Returns { value } on success or { error } with a user-facing message.
function validatePost(body) {
  if (typeof body !== 'object' || body === null) {
    return { error: 'request body must be a JSON object' };
  }

  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const rawEmoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';

  if (author.length === 0) {
    return { error: 'author is required' };
  }
  if (author.length > LIMITS.AUTHOR_MAX) {
    return { error: `author must be at most ${LIMITS.AUTHOR_MAX} characters` };
  }
  if (message.length === 0) {
    return { error: 'message is required' };
  }
  if (message.length > LIMITS.MESSAGE_MAX) {
    return { error: `message must be at most ${LIMITS.MESSAGE_MAX} characters` };
  }
  if (rawEmoji.length > LIMITS.EMOJI_MAX) {
    return { error: `emoji must be at most ${LIMITS.EMOJI_MAX} characters` };
  }

  return {
    value: {
      author,
      message,
      emoji: rawEmoji.length > 0 ? rawEmoji : DEFAULT_EMOJI
    }
  };
}

module.exports = { LIMITS, DEFAULT_EMOJI, validatePost };
