/**
 * Removes `//` line comments and block comments from a JSON body, leaving string literals
 * untouched.
 *
 * The desktop app and the CLI run the request body through `decomment` before sending it
 * (see `bruno-electron/src/ipc/network/prepare-request.js`), so collections are commonly
 * authored with comments. This keeps the extension in line without pulling in a JavaScript
 * parser: a JSON body has no regular expressions or template literals, so a string-aware
 * scan is enough to tell a comment from a `//` that happens to live inside a value.
 */
export const stripJsonComments = (text: string): string => {
  let result = '';
  let index = 0;
  let insideString = false;
  let escaped = false;

  while (index < text.length) {
    const char = text[index];

    if (insideString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        insideString = false;
      }
      index++;
      continue;
    }

    if (char === '"') {
      insideString = true;
      result += char;
      index++;
      continue;
    }

    // The newline is left in place: dropping it would join the next line to this one.
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') {
        index++;
      }
      continue;
    }

    if (char === '/' && text[index + 1] === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index++;
      }
      index += 2;
      continue;
    }

    result += char;
    index++;
  }

  return result;
};

export default stripJsonComments;
