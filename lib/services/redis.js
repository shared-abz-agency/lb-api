'use strict';
const redis = require('redis');
const logger = new (require('./log'))();
const settings = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    dataPrefix: 'loadBalancerData_',
  },
};
const prefix = settings.redis.dataPrefix;
/**
 * Class for workflow with redis data storage
 */
let instance = null;
class RedisService {
  constructor() {
    this._ready = false;
    this._connecting = false;
    this.onReady = this._doConnect();
  }

  /**
   * Retrieve data from redis data storage using methods for different data types
   * @param {String} method   name of redis client method
   * @param {String} key      key under which data was stored
   * @returns {Promise}
   * @private
   */
  _get(method, key) {
    return new Promise((resolve, reject) => {
      if (!this._ready) {
        reject(new Error('Redis is not available'));
        return;
      }
      this.client[method](prefix + key, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Store data to redis data storage using methods for different data types
   * @param {String} method       name of redis client method
   * @param {String} key           key under which data will be stored
   * @param {*} value              data to store
   * @param {Number} [lifetime]  lifetime of key in seconds
   * @returns {Promise}
   * @private
   */
  _set(method, key, value, lifetime) {
    return new Promise((resolve, reject) => {
      if (!this._ready) {
        reject(new Error('Redis is not available'));
        return;
      }
      let onResult = (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      };
      if (lifetime) {
        this.client[method](
          prefix + key,
          value,
          'NX',
          'EX',
          lifetime,
          onResult
        );
        return;
      }
      this.client[method](prefix + key, value, onResult);
    });
  }

  /**
   * Store data for primitive type
   * @param {String} key      key under which data will be stored
   * @param {*} value         data of primitive type
   * @returns {Promise}
   */
  setValue(key, value, lifetime) {
    return this._set('set', key, value, lifetime);
  }

  /**
   * Retrieve stored data of primitive type
   * @param {String} key      key under which data was stored
   * @returns {Promise}
   */
  getValue(key) {
    return this._get('get', key).then(value => RedisService.fromString(value));
  }

  /**
   * Store one level object (without nested objects)
   * @param {String} key      key under which data will be stored
   * @param {Object} value    data as simple object
   * @param {Number} [lifetime]     lifetime of key in seconds
   * @returns {Promise}
   */
  setObject(key, value, lifetime) {
    let result = {};
    Object.keys(value).forEach(property => {
      if (value.hasOwnProperty(property)) {
        result[property] = String(value[property]);
      }
    });
    return this._set('hmset', key, result, lifetime);
  }

  /**
   * Retrieve stored object
   * @param {String} key      key under which data was stored
   * @returns {Promise}
   */
  getObject(key) {
    return this._get('hgetall', key).then(object => {
      if (RedisService.isEmpty(object)) {
        return null;
      }
      let result = {};
      Object.keys(object).forEach(property => {
        if (object.hasOwnProperty(property)) {
          result[property] = RedisService.fromString(object[property]);
        }
      });
      return result;
    });
  }

  getRawObject(key) {
    return new Promise((resolve, reject) => {
      this.client.hgetall(key, (err, object) => {
        if (err) {
          reject(err);
          return;
        }
        if (RedisService.isEmpty(object)) {
          return null;
        }
        let result = {};
        Object.keys(object).forEach(property => {
          if (object.hasOwnProperty(property)) {
            result[property] = RedisService.fromString(object[property]);
          }
        });
        resolve(result);
      });
    });
  }

  /**
   * Store array of primitive type values
   * @param {String} key      key under which data will be stored
   * @param {*[]|*} value       data as array of values or single value of primitive type
   * @returns {Promise}
   */
  setList(key, value) {
    return new Promise((resolve, reject) => {
      if (value.length === 0) {
        reject(new Error("Can't store empty array"));
        return;
      }
      this._set('sadd', key, value)
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Retrieve stored array
   * @param {String} key      key under which data was stored
   * @returns {Promise}
   */
  getList(key) {
    return this._get('smembers', key).then(list => {
      if (RedisService.isEmpty(list)) {
        return [];
      }
      return list.map(item => RedisService.fromString(item));
    });
  }

  /**
   * Increment variable stored in redis. if variable doesn't exist it will be created and set to 1
   * @param {String} key      key under which data will be incremented
   * @returns {Promise}
   */
  increment(key) {
    return new Promise((resolve, reject) => {
      this.client.incr(prefix + key, err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Find keys matched by pattern and remove them from redis data storage
   * @param {String} pattern  pattern for keys. i.e. example.com* will remove all keys starts from example.com
   * @returns {Promise}
   */
  cleanByKeyPattern(pattern) {
    return new Promise((resolve, reject) => {
      this.getKeysByPattern(pattern)
        .then(keys => {
          if (keys.length === 0) {
            return resolve();
          }
          this.client.del(keys, err => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        })
        .catch(reject);
    });
  }

  deleteKeysByPattern(pattern) {
    let total = 0;
    return new Promise((resolve, reject) => {
      let scanAsync = cursor =>
        this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*${pattern}`,
          'COUNT',
          '10000',
          (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            let newCursor = response[0];
            let keys = response[1];
            if (keys.length !== 0) {
              total += keys.length;

              this.client.del(keys, error => {
                if (error) {
                  console.log('ERR on DELETING KEY', error);
                }
              });
            }
            if (newCursor === '0') {
              console.log('Total deleted countyip keys - ', total);
              resolve();
              return;
            }
            scanAsync(newCursor);
          }
        );
      scanAsync('0');
    });
  }

  /**
   * Find keys matched by pattern
   * @param {String} pattern          pattern for keys. i.e. example.com* will get all keys starts from example.com
   * @param {Boolean} [clean = false] define return keys with prefix or not
   * @returns {Promise}
   */
  getKeysByPattern(pattern, clean) {
    return new Promise((resolve, reject) => {
      let result = [];
      let scanAsync = cursor =>
        this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*${pattern}`,
          'COUNT',
          '50000',
          (err, response) => {
            if (err) {
              reject(err);
              return;
            }
            let newCursor = response[0];
            let keys = response[1];
            /* eslint no-param-reassign:0 */
            result = result.concat(keys);
            if (newCursor === '0') {
              if (clean) {
                resolve(result.map(key => key.replace(prefix, '')));
              }
              resolve(result);
              return;
            }
            scanAsync(newCursor);
          }
        );
      scanAsync('0');
    });
  }

  /**
   * Returns true if passed key exist in Redis
   * @param key Key for check
   */
  isKeyExist(key) {
    return new Promise((resolve, reject) => {
      this.client.exists(prefix + key, (err, reply) => {
        if (err) {
          reject(err);
        }
        resolve({ reply });
      });
    });
  }

  expire(key, seconds) {
    this.client.expire(prefix + key, +seconds);
    return Promise.resolve();
  }

  getInfo() {
    return new Promise((resolve, reject) => {
      this.client.info(err => {
        if (err) {
          reject(err);
          return;
        }
        return resolve(this.client.server_info);
      });
    });
  }

  /**
   * Save value in redis set
   * @param set Set name
   * @param value Value
   * @returns {Promise}
   */
  saveSetValue(set, value) {
    return new Promise((resolve, reject) => {
      this.client.sadd(set, value, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
  }

  removeSetValue(set, value) {
    return new Promise((resolve, reject) => {
      this.client.srem(set, value, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
  }

  deleteKey(key) {
    return new Promise((resolve, reject) => {
      this.client.del(`${prefix}${key}`, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        // console.log('Redis, removed keys :', key, data)
        resolve();
      });
    });
  }

  /**
   * Check if value exists in set
   * @param set Set name
   * @param value Value
   * @returns {Promise}
   */
  isValueExistsInSet(set, value) {
    return new Promise((resolve, reject) => {
      this.client.sismember(set, value, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res !== 0);
      });
    });
  }

  getClient() {
    return this.client;
  }

  /**
   * Check if stored in redis variable contains value
   * @param {*} variable  string to parse
   * @returns {boolean}
   */
  static isEmpty(variable) {
    return !variable || variable === 'null' || variable === 'undefined';
  }

  /**
   * Parse string values and convert them to entities of primitive type
   * @param {String} item     string to parse
   * @returns {*}
   */
  static fromString(item) {
    if (item === 'undefined') {
      return undefined;
    }
    if (RedisService.isEmpty(item)) {
      return null;
    }
    if (isNaN(item)) {
      return item;
    }
    let f = parseFloat(item);
    let i = parseInt(item, 10);
    return i === f ? i : f;
  }

  /**
   * Get instance of current service
   * @returns {RedisService}
   */
  static getInstance() {
    if (instance === null) {
      instance = new RedisService();
    }
    return instance;
  }

  _doConnect() {
    if (this._connecting) {
      Promise.reject();
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        this._connecting = true;
        let tries = 5;
        let params = {
          retry_strategy: options => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              reject(new Error('Redis server refused connection'));
              return;
            }
            if (options.attempt > tries) {
              reject(
                new Error(
                  `Exhausted all attempts (${tries}) to connect to Redis`
                )
              );
              return;
            }
            return 1000;
          },
          no_ready_check: true,
        };
        if (process.env.REDIS_URL) {
          this.client = redis.createClient(process.env.REDIS_URL, params);
        } else {
          this.client = redis.createClient(
            settings.redis.port,
            settings.redis.host,
            params
          );
        }
        this.client.on('connect', () => {
          this._ready = true;
          this._connecting = false;
          resolve();
        });
        this.client.on('error', err => {
          logger.log('Redis error', err);
          reject(err);
          this._connecting = false;
          process.nextTick(() => {
            this._doConnect();
          });
        });
        this.client.on('end', () => {
          logger.log('Redis connection closed. Reconnecting');
          process.nextTick(() => {
            this._doConnect();
          });
        });
      } catch (err) {
        reject(err);
        return;
      }
    });
  }
}
module.exports = RedisService;
