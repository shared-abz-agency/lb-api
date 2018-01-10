'use strict';
const compareVersions = require('compare-versions');
const RedisDataService = require('./redis.data');
const logger = new (require('../lib/services/log'))();
const cluster = require('cluster');
const generateUrl = require('../lib/services/url');
const shareHtml = require('../services/config.share');
const memored = require('memored');
let redisDataService = RedisDataService.getInstance();
const NOT_SUPPORTED_DOMAIN = 1;
const NOT_SUPPORTED_GEO = 2;
const REQUESTS_EXCEEDED = 3;
const NOT_FOUND_PROXY = 4;
const WRONG_UID = 5;
const WRONG_CONFIG_PARAMS = 6;
const ALREADY_EXCEEDED = 98;
const NEED_PAY = 99;
const OTHER_ERROR = 100;
const messages = {
  [NOT_SUPPORTED_DOMAIN]: 'Domain not supported',
  [NOT_SUPPORTED_GEO]: 'Unsupported user GEO',
  [REQUESTS_EXCEEDED]:
    'Fair use of our service for this website has been exceeded',
  [NOT_FOUND_PROXY]: 'No proxy available for selected geo',
  [WRONG_UID]: 'UID is missing or incorrect',
  [WRONG_CONFIG_PARAMS]:
    'Required params are missing. Please check if "browser", "locale", "version" are present',
  [OTHER_ERROR]: 'Unexpected error',
};
const cachedDomains = ['youtube.com', 'pandora.com', 'nbc.com', 'fox.com'];
/**
 * Form error object to return to requester
 * @param {Object} error            error object
 * @param {Number} error.code       integer code of error defined in constants
 * @param {String|*} [error.extra]  extra data string related to received error
 * @returns {*}
 */
function returnError(error) {
  if (error.code === OTHER_ERROR) {
    logger.trace(error.extra);
  }
  if (error.code === NEED_PAY) {
    return {
      notification: {
        url: error.extra,
      },
    };
  }
  let needCache = false;
  if (error.code === REQUESTS_EXCEEDED) {
    needCache = true;
  }
  if (error.code === ALREADY_EXCEEDED) {
    /* eslint no-param-reassign:0 */
    error.code = REQUESTS_EXCEEDED;
    needCache = true;
  }
  let result = {
    error: {
      type: error.code,
      message:
        typeof error.extra === 'string' ? error.extra : messages[error.code],
    },
  };
  if (needCache) {
    result.needCache = needCache;
  }
  return result;
}
/**
 * Format and return proxy data for requester
 * @param {Object} proxy            simple proxy object received from redis storage
 * @param {Boolean} [cache=false]   define if response should be cached
 */
function returnProxy(proxy, cache) {
  let response = {
    proxy: {
      ip: proxy.ip,
      port: proxy.port,
    },
  };
  if (cache) {
    response.needCache = true;
  }
  return response;
}
/**
 * Validate if user with current ip can request current domain
 * based on his geo location
 * @param {Object} domain   simple domain object received from redis storage
 * @param {String} ip       ip of requester
 * @returns {Promise}
 */
function checkForGeo(domain, ip) {
  return new Promise((resolve, reject) =>
    redisDataService
      .getCountryByIP(ip)
      .then(countryCode => {
        if (domain.allowedGeo.length) {
          let isAllowed = domain.allowedGeo.some(
            geo => geo.toLowerCase() === countryCode
          );
          if (isAllowed) {
            return resolve();
          }
          return reject({ code: NOT_SUPPORTED_GEO });
        }
        let isBlocked = domain.blockedGeo.some(
          geo => geo.toLowerCase() === countryCode
        );
        if (isBlocked) {
          return reject({ code: NOT_SUPPORTED_GEO });
        }
        resolve();
      })
      .catch(err => {
        logger.log(err);
        reject({ code: NOT_SUPPORTED_GEO });
      })
  );
}
/**
 * Generate url for redirect based on requested domain and requester's ip
 * @param {Object} domain   simple domain object received from redis storage
 * @returns {string}
 */
function getDefaultUrl(domain) {
  return generateUrl(domain.name);
}
/**
 * Validate if user with current ip can request current domain
 * based on count of requests from current ip for current domain
 * @param {Object} domain               simple domain object received from redis storage
 * @param {String} ip                   ip of requester
 * @param {Boolean} [monetized = false]  define if requester paid for service. request count not comparing with max
 *     count
 * @returns {Promise}
 */
function checkRequestCount(domain, ip, monetized) {
  return new Promise((resolve, reject) => {
    if (domain.preventCount) {
      return resolve();
    }
    if (monetized || domain.addedManually) {
      redisDataService.incrementRequestsCount(ip, domain);
      return resolve();
    }
    redisDataService
      .getRequestCount(ip, domain)
      .then(count => {
        // logger.log(`ip (${ip}) requested ${domain.name} ${count} times`);
        redisDataService.incrementRequestsCount(ip, domain);
        if (count === domain.maxRequests) {
          // let url = domain.url || getDefaultUrl(domain);
          let url = getDefaultUrl(domain);
          return reject({ code: NEED_PAY, extra: url });
        }
        if (count > domain.maxRequests) {
          return redisDataService
            .setExceededTimestamp(ip, domain)
            .then(() => reject({ code: REQUESTS_EXCEEDED }));
        }
        resolve();
      })
      .catch(reject);
  });
}
/**
 * Get single available proxy for selected domain using simple enumeration
 * @param {Object} domain   simple domain object received from redis storage
 * @returns {Promise}
 */
function getAvailableProxy(domain) {
  if (domain.proxies.length === 0) {
    return Promise.reject({ code: NOT_FOUND_PROXY });
  }
  return redisDataService
    .getLastProxyIndex(domain.countryId)
    .then(lastProxyIndex => {
      let next;
      if (lastProxyIndex >= domain.proxies.length - 1) {
        next = 0;
        redisDataService.resetLastProxyIndex(domain.countryId);
      } else {
        next = lastProxyIndex + 1;
        redisDataService.incrementLastProxyIndex(domain.countryId);
      }
      return domain.proxies[next];
    });
}
/**
 * Store domain data in memory if it should be stored
 * @param {Object} domain   simple domain object received from redis storage
 * @returns {Promise}
 */
function cacheDomain(domain) {
  return new Promise(resolve => {
    cachedDomains.forEach(cachedDomain => {
      if (domain.name.indexOf(cachedDomain) !== -1) {
        memored.store(`domain-${domain.name}`, domain, 1800000, () => {
          resolve();
        });
        return;
      }
      resolve();
    });
  });
}
/**
 * Validate if requester can receive proxy for selected domain and return result
 * @param {Object} domain       domain to work with
 * @param {String} ip           ip of requester
 * @param {Boolean} monetized   define if requester paid for service
 */
function validateRequest(domain, ip, monetized) {
  if (domain.addedManually) {
    return getAvailableProxy(domain).then(res => returnProxy(res, true));
  }
  return Promise.all([
    checkForGeo(domain, ip),
    checkRequestCount(domain, ip, monetized),
    cacheDomain(domain),
    getAvailableProxy(domain),
  ])
    .then(results => returnProxy(results[3], domain.addedManually))
    .catch(returnError);
}
/**
 * Check for domain availability and validate request for current domain name and requester
 * @param {String} domainName   domain name received from requester
 * @param {String} ip           ip of requester
 * @param {Boolean} monetized   define if requester paid for service
 * @returns {*}
 */
function processDomain(domainName, ip, monetized) {
  redisDataService.incrementThroughputValue('get-proxy');
  if (!domainName) {
    return Promise.resolve(returnError({ code: NOT_SUPPORTED_DOMAIN }));
  }
  return isDomainExistInRedis(domainName)
    .then(domain => {
      let process = () =>
        redisDataService
          .getDomain(domain)
          .then(domain => {
            if (!domain) {
              return returnError({ code: NOT_SUPPORTED_DOMAIN });
            }
            return redisDataService
              .getExceededTimestamp(ip, domain)
              .then(timestamp => {
                if (timestamp !== null) {
                  return returnError({
                    code: ALREADY_EXCEEDED,
                    extra: timestamp,
                  });
                }
                return validateRequest(domain, ip, monetized);
              });
          })
          .catch(err => returnError({ code: OTHER_ERROR, extra: err }));
      for (let i = 0; i < cachedDomains.length; i++) {
        if (domain.indexOf(cachedDomains[i]) !== -1) {
          return new Promise((resolve, reject) => {
            memored.read(`domain-${domain}`, (err, result) => {
              if (!err && result) {
                getAvailableProxy(result)
                  .then(proxy => resolve(returnProxy(proxy, true)))
                  .catch(error => resolve(returnError(error)));
                return;
              }
              process()
                .then(resolve)
                .catch(reject);
            });
          });
        }
      }
      return process();
    })
    .catch(() => returnError({ code: NOT_SUPPORTED_DOMAIN }));
}

/**
 * Check if domain name exist in Redis
 * @param domain
 * @returns {*}
 */
function isDomainExistInRedis(domain) {
  let hostnameParts = domain.split('.');
  if (!hostnameParts.length) {
    return Promise.reject();
  }
  let allPosibilities = [];
  while (hostnameParts.length > 1) {
    allPosibilities.push(hostnameParts.join('.'));
    hostnameParts.splice(0, 1);
  }
  let promises = allPosibilities.map(domainName =>
    redisDataService.isDomainExistInRedis(domainName)
  );
  return Promise.all(promises).then(results => {
    let founded = results.find(item => item.reply > 0);
    return founded ? founded.domain : Promise.reject();
  });
}

function getDomainsByCountry(daysPassed, countryCode) {
  let formatResult = allDomains => {
    let result = {};
    new Array(daysPassed + 1).fill().forEach((elm, days) => {
      if (allDomains[days]) {
        result = Object.assign(result, allDomains[days]);
      }
    });
    return result;
  };
  return new Promise((resolve, reject) => {
    memored.read(`allDomains_${countryCode}`, (err, storedDomains) => {
      if (!storedDomains) {
        storedDomains = {};
      }
      Promise.all(
        new Array(daysPassed + 1).fill().map((elm, days) => {
          if (typeof storedDomains[days] !== 'undefined') {
            return Promise.resolve();
          }
          return redisDataService
            .getAllDomains(countryCode, days)
            .then(domains => {
              storedDomains[days] = domains;
            });
        })
      )
        .then(() => {
          memored.store(
            `allDomains_${countryCode}`,
            storedDomains,
            1800000,
            () => {
              resolve(formatResult(storedDomains));
            }
          );
        })
        .catch(reject);
    });
  });
}
/**
 * Get all domains that have postpone delivery value less then provided days
 * @param {number} daysPassed       days since first request with provided uid
 * @param {String} [countryCode]    code of requester's country
 * @returns {Promise.<T>}
 */
function getAllDomains(daysPassed, countryCode) {
  let keys = ['global'];
  if (countryCode) {
    keys.push(countryCode.toLowerCase());
  }
  redisDataService.incrementThroughputValue('domains');
  return Promise.all(
    keys.map(key => getDomainsByCountry(daysPassed, key))
  ).then(results => {
    let result = {};
    results.forEach(tempResult => {
      Object.assign(result, tempResult);
    });
    return result;
  });
}

/**
 * Get list of domains based on uid provided by requester
 * @param {String} uid  uid provided by requester
 */
function getDomainList(uid, ip, selfHosted) {
  if (!uid) {
    return Promise.resolve(returnError({ code: WRONG_UID }));
  }
  if (selfHosted === 'true') {
    redisDataService.saveExcludedUid(uid);
    return redisDataService.getManualDomains();
  }
  if (selfHosted === 'undo') {
    redisDataService
      .removeExcludedUid(uid)
      .then(() => getDomainsByUid(uid, ip));
  }
  return redisDataService
    .isUidExcluded(uid)
    .then(result => {
      if (result) {
        return redisDataService.getManualDomains();
      }
      return getDomainsByUid(uid, ip);
    })
    .catch(err => returnError({ code: OTHER_ERROR, extra: err }));
}

// Temp for FF static date for UIDs
const staticDate = new Date(2017, 10, 21).getTime();

function getDomainsByUid(uid, ip) {
  return redisDataService.getFirstRequestByUid(uid).then(firstRequest => {
    if (staticDate < parseInt(firstRequest.date, 10)) {
      return redisDataService.getManualDomains();
    }
    let now = Date.now();
    let requestDate = parseInt(firstRequest.date, 10);
    let daysPassed = Math.floor((now - requestDate) / (1000 * 60 * 60 * 24)); // diff in days
    return redisDataService
      .getCountryByIP(ip)
      .then(countryCode => {
        return getAllDomains(daysPassed, countryCode)
      })
      .catch(e => {
        return getAllDomains(daysPassed);
      });
  });
}

// Default notification object for each browsers
const defaultNotification = {
  chrome: {
    active: false,
    title: null,
    message: null,
    imgurl: null,
    buttontext: null,
    clicklink: null,
  },
  firefox: { active: false, title: null, message: null, clicklink: null },
};
/**
 *
 * @param params
 * @returns {*}
 */
function getConfig(params) {
  if (!params.browser || !params.language || !params.version) {
    return Promise.resolve(returnError({ code: WRONG_CONFIG_PARAMS }));
  }
  return redisDataService.getConfigData(params.browser).then(data => {
    let config = JSON.stringify(data.config);
    let configMessages = data.messages[params.language];
    if (!configMessages) {
      configMessages = '{}';
    }
    let notification = null;
    if (params.language === 'en') {
      notification = JSON.parse(data.messages.notificationEn);
    } else {
      notification = JSON.parse(data.messages.notificationDe);
    }
    let configVersion = data.messages.minVersion;
    let newNotification = {};
    let version = params.version.split('-')[0];
    if (compareVersions(version, configVersion) < 0) {
      newNotification = Object.assign(
        {},
        defaultNotification[params.browser],
        notification
      );
    } else {
      newNotification = defaultNotification[params.browser];
    }
    config = config.replace('"[messages]"', configMessages);
    config = config.replace(
      '"[notification]"',
      JSON.stringify(newNotification)
    );
    config = config.replace(
      '"[share]"',
      shareHtml(params.browser, params.language, params.monetizaion)
    );
    if (params.uid) {
      return redisDataService.isUidExcluded(params.uid).then(isExcluded => {
        let resConfig = JSON.parse(config);
        resConfig.isExcluded = isExcluded;
        return resConfig;
      });
    }
    try {
      return JSON.parse(config);
    } catch (e) {
      return Promise.resolve(returnError({ code: OTHER_ERROR, extra: e }));
    }
  });
}

module.exports = { processDomain, getDomainList, getConfig };
