'use strict';
const RedisService = require('../lib/services/redis');
const maxMindDbReader = require('maxmind-db-reader');
const path = require('path');
const logger = new (require('../lib/services/log'))();

let instance = null;

const REDIS_KEYS_EXCEED_TIME = process.env.EXCEED_TIME || 86400;

const defaultDomains = {
  'www.fox.com': { regex: '.*', xpath: '//*' },
  'www.nbc.com': { regex: '.*', xpath: '//*' },
  'www.pandora.com': { regex: '.*', xpath: '//*' },
  'www.youtube.com': { regex: '.*', xpath: '//*' },
};

class RedisDataService {
  constructor() {
    this._redisService = RedisService.getInstance();
    this._countries = maxMindDbReader.openSync(
      path.resolve(__dirname, '../sources/GeoIP2-Country.mmdb')
    );
  }

  /**
   * Get from redis storage domain and related blocked geos based on its name
   * @param {String} domainName   name of requested domain
   * @returns {Promise.<T>}
   */
  getDomain(domainName) {
    return this._redisService.getValue(`${domainName}_domain`).then(domain => {
      try {
        return JSON.parse(domain);
      } catch (err) {
        return null;
      }
    });
  }

  getCountry(ip) {
    return new Promise((resolve, reject) => {
      this._countries.getGeoData(ip, function(err, geodata) {
        if (err) {
          reject(err);
        }
        resolve(geodata);
      });
    });
  }

  /**
   * Get id if country based on ip of requester
   * @param {String} ip       ip of requester
   * @returns {Promise.<T>}
   */
  getCountryByIP(ip) {
    return this._redisService.getValue(`${ip}_country`).then(async country => {
      if (country) {
        return country;
      }
      let result = {};
      try {
        result = await this.getCountry(ip);
      } catch (err) {
        result = {
          country: { iso_code: 'usa' },
        };
      }
      let code;
      if (result.country) {
        code = result.country.iso_code.toLowerCase();
      } else if (
        result.registered_country &&
        result.registered_country.iso_code
      ) {
        code = result.registered_country.iso_code.toLowerCase();
      } else {
        code = 'usa';
      }
      return this._redisService
        .setValue(`${ip}_country`, code)
        .then(() => code);
    });
  }

  /**
   * Get count of requests for selected domain from provided ip address
   * @param {String} ip       ip of requester
   * @param {Object} domain   simple domain object received from redis storage
   * @returns {Promise.<T>}
   */
  getRequestCount(ip, domain) {
    return this._redisService
      .getValue(`${ip}_${domain.name}_requestsCount`)
      .then(count => count || 0);
  }

  /**
   * Update count of requests for selected domain from provided ip address
   * @param {String} ip       ip of requester
   * @param {Object} domain   simple domain object received from redis storage
   * @returns {Promise}
   */
  incrementRequestsCount(ip, domain) {
    return this._redisService.increment(`${ip}_${domain.name}_requestsCount`);
  }

  /**
   * Get index of last returned proxy in arrays of proxies for selected country
   * @param {Number} countryId   id of country for which index of last proxy will be returned
   * @returns {Promise}
   */
  getLastProxyIndex(countryId) {
    return this._redisService.getValue(`${countryId}_lastProxyIndex`) || 0;
  }

  /**
   * Reset index of last returned proxy for selected country to 0
   * @param {Number} countryId   id of country for which id of last proxy will be returned
   * @returns {Promise}
   */
  resetLastProxyIndex(countryId) {
    return this._redisService.setValue(`${countryId}_lastProxyIndex`, 0);
  }

  /**
   * Increase index of last returned proxy for selected country
   * @param {Number} countryId   id of country for which id of last proxy will be returned
   * @returns {Promise}
   */
  incrementLastProxyIndex(countryId) {
    return this._redisService.increment(`${countryId}_lastProxyIndex`);
  }

  /**
   * Increase count of all requests to selected url
   * @param {String} url
   * @returns {Promise}
   */
  incrementThroughputValue(url) {
    return this._redisService.increment(`${url}_throughput`);
  }

  /**
   * Remove all stored counts of requests for domains from ip addresses
   * @returns {Promise}
   */
  cleanRequestCounts() {
    return this._redisService
      .cleanByKeyPattern('*_requestsCount')
      .then(() => this._redisService.cleanByKeyPattern('*_exceeded'));
  }

  deleteCountriesIps() {
    return this._redisService
      .deleteKeysByPattern('*_country')
      .then(() => console.log('Country/ip pair cleaned'));
  }

  /**
   * Get object of first request with provided uid
   * If it doesn't exist it will be created
   * @param {String} uid      uid provided by requester
   * @returns {Promise.<T>}
   */
  getFirstRequestByUid(uid) {
    return this._redisService
      .getObject(`${uid}_domainRequest`)
      .then(firstRequest => {
        if (firstRequest) {
          return firstRequest;
        }
        let newFirstRequest = {
          date: Date.now(),
        };
        return this._redisService
          .setObject(`${uid}_domainRequest`, newFirstRequest)
          .then(() => newFirstRequest);
      });
  }

  /**
   * Get list of all available domains
   * Contains only name, regex, xpath and postpone delivery period for each domain
   * @param {Number} days
   * @returns {Promise.<TResult>}
   */
  getAllDomains(key, days) {
    return this._redisService
      .getValue(`allDomains_${key}_${days}`)
      .then(domains => {
        try {
          return JSON.parse(domains);
        } catch (err) {
          return [];
        }
      });
  }

  /**
   * Set timestamp for moment when request count exceeded
   * @param {String} ip       ip of requester
   * @param {Object} domain   simple domain object received from redis storage
   * @returns {Promise}
   */
  setExceededTimestamp(ip, domain) {
    let key = `${ip}_${domain.name}_exceeded`;
    let countKey = `${ip}_${domain.name}_requestsCount`;
    return this._redisService
      .setValue(key, Date.now())
      .then(() => this._redisService.expire(key, REDIS_KEYS_EXCEED_TIME))
      .then(() => this._redisService.expire(countKey, REDIS_KEYS_EXCEED_TIME));
  }

  /**
   * Get timestamp for moment when request count exceeded
   * @param {String} ip       ip of requester
   * @param {Object} domain   simple domain object received from redis storage
   * @returns {Promise}
   */
  getExceededTimestamp(ip, domain) {
    return this._redisService.getValue(`${ip}_${domain.name}_exceeded`);
  }

  getConfigData(browser) {
    let data = {};
    return this._redisService
      .getValue(`extension_config_${browser}`)
      .then(config => {
        try {
          data.config = JSON.parse(config);
        } catch (e) {
          data.config = null;
        }
        return this._redisService
          .getValue(`extension_config_${browser}_messages`)
          .then(messages => {
            try {
              data.messages = JSON.parse(messages);
            } catch (e) {
              data.messages = null;
            }
            return data;
          });
      });
  }

  setEtag(ip, domain, eTag, expire) {
    let key = `${ip}_${domain}_etag`;
    return this._redisService
      .setValue(key, String(eTag))
      .then(() => this._redisService.expire(key, expire));
  }

  getEtag(ip, domain) {
    return this._redisService
      .getValue(`${ip}_${domain}_etag`)
      .then(value => String(value));
  }

  isDomainExistInRedis(domain) {
    return this._redisService
      .isKeyExist(`${domain}_domain`)
      .then(res => Object.assign(res, { domain }));
  }

  saveExcludedUid(uid) {
    return this._redisService.saveSetValue(uid, 'excluded_uids');
  }

  removeExcludedUid(uid) {
    return this._redisService.removeSetValue(uid, 'excluded_uids');
  }

  isUidExcluded(uid) {
    return this._redisService.isValueExistsInSet(uid, 'excluded_uids');
  }

  getManualDomains() {
    return this._redisService.getValue('static_domains').then(res => {
      if (!res) {
        console.log('warn: no default domains found in redis');
      }
      return JSON.parse(res) || defaultDomains;
    });
  }

  /**
   * Get instance of current service
   * @returns {RedisDataService}
   */
  static getInstance() {
    if (instance === null) {
      instance = new RedisDataService();
    }
    return instance;
  }
}
module.exports = RedisDataService;
