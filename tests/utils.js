const vm = require('vm');
/**
 * Generate unique UID
 * @returns {String} GUID
 */
const generateUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let random = (Math.random() * 16) | 0;
    let v = c === 'x' ? random : (random & 0x3) | 0x8; //eslint-disable-line
    return v.toString(16);
  });
};

const HTML_RESPONSE_MATCHER = /{response:(.*)(?=}})/;

const parseHTMLResponse = html => {
  if (typeof html !== 'string') {
    throw new Error('Incorrect HTML');
  }
  const data = html.match(HTML_RESPONSE_MATCHER);
  if (!data || !data.length) {
    throw new Error('Incorrect HTML');
  }
  const sandbox = { result: '' };
  vm.createContext(sandbox); // Contextify the sandbox.
  vm.runInContext(`result = ${data[1]}`, sandbox);
  return sandbox.result;
};

const sendSupertestRequest = (req, url, delay) =>
  new Promise((resolve, reject) => {
    const fn = () =>
      req.get(url).end((err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    delay ? setTimeout(fn, delay) : fn();
  });

module.exports = {
  generateUID,
  parseHTMLResponse,
  sendSupertestRequest,
};
