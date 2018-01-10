const finalHandler = require('finalhandler');
const http = require('http');
const url = require('url');
const Router = require('router');
const ApiService = require('./services/api.js');
const env = require('node-env-file');
const path = require('path');
const BASE_DIR = path.normalize(__dirname);
const formatHtml = require('./services/response.template');
const compression = require('compression');
env(`${BASE_DIR}/.env`, { raise: false, logger: console });


function start() {
  let router = new Router();

  // define request/response helpers
  function jsonResponse(res) {
    return data => {
      res.setHeader('Content-type', 'application/json; charset=utf-8');
      let cache = [];
      let result = JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.indexOf(value) !== -1) {
            return 'Circular structure';
          }
          cache.push(value);
        }
        return value;
      });
      return res.end(result);
    };
  }

  function parseQuery(query) {
    return url.parse(query, true).query;
  }

  // define routes
  function getIp(req) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (req.query.ip) {
      ip = req.query.ip;
    }
    return ip;
  }

  let setCacheHeaders = res => {
    let now = new Date();
    let midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    let secondsLeft = Math.floor((midnight - now) / 1000);
    res.setHeader('Cache-Control', `public, max-age=${secondsLeft}`);
    res.setHeader('Expires', midnight.toUTCString());
  };

  let sendResponse = (req, res, result, embed) => {
    if (req.query.json === 'true') {
      res.json(result);
    } else {
      if (result.notification && result.notification.url) {
        res.statusCode = 302;
        res.setHeader('Location', result.notification.url);
        return res.end();
      }
      res.end(formatHtml(result, embed));
    }
  };
  let sendResponseWithCache = (req, res, result) => {
    setCacheHeaders(res);
    delete result.needCache;
    sendResponse(req, res, result);
  };

  router.use(compression());

  router.get('/get-proxy', (req, res) => {
    let domain = req.query.domain;
    let ip = getIp(req);
    let monetized = req.query.monetized === 'true';
    let process = () => {
      ApiService.processDomain(domain, ip, monetized).then(result => {
        if (result.needCache) {
          delete result.needCache;
          sendResponseWithCache(req, res, result);
          return;
        }
        sendResponse(req, res, result, true);
      });
    };
    process();
  });
  router.get('/domains', (req, res) => {
    let uid = req.query.uid;
    let selfHosted = req.query.selfHosted;
    let ip = getIp(req);
    // let ua = req.headers['user-agent'];
    // let simplify = ua.indexOf('Firefox') > -1;
    ApiService.getDomainList(uid, ip, selfHosted).then(result =>
      sendResponseWithCache(req, res, result)
    );
  });
  router.get('/config', (req, res) => {
    let params = {
      version: req.query.version,
      language: req.query.locale,
      browser: req.query.browser,
      uid: req.query.uid,
      monetizaion: req.query.monetization === 'true',
    };
    ApiService.getConfig(params)
      .then(result => {
        sendResponse(req, res, result);
      })
  });
  router.use((req, res) => {
    /* eslint no-param-reassign:0 */
    res.statusCode = 404;
    res.json({
      error: 'Nothing here',
    });
  });
  // start server
  const port = process.env.PORT || 4000;
  const server = http.createServer((req, res) => {
    res.json = jsonResponse(res);
    req.query = parseQuery(req.url);
    router(req, res, finalHandler(req, res));
  });
  if (!module.parent || !module.parent.parent) {
    server.listen(port);
    console.log('Api server listening ', port);
  }
  return server;
}

module.exports = start;
