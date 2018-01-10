const RedisClient = require('../lib/services/redis');

const redisService = RedisClient.getInstance();

// Test UIDS
const testUids = [
  {
    uid: 201,
    data: {
      date: new Date(2016, 10, 10).getTime(),
    },
  }, // 1 day back
  {
    uid: 202,
    data: {
      date: new Date(new Date().getTime() - 1000 * 60 * 60 * 24).getTime(),
    },
  },
];

// Test ip/domains exceed key
const ip = '10.10.20.20';
const domain = { name: 'otto.de' };
const key = `${ip}_${domain.name}_exceeded`;

function importTestDataToRedis() {
  return Promise.all([
    ...testUids.map(item =>
      redisService.setObject(`${item.uid}_domainRequest`, item.data)
    ),
    redisService.setValue(key, Date.now()),
  ]);
}

function removeTestDataFromRedis() {
  // let removeKeyPromise = redisService.deleteKey(key);
  return Promise.all([
    ...testUids.map(item =>
      redisService.deleteKey(`${item.uid}_domainRequest`)
    ),
    removeTestIps(),
    redisService.deleteKey(key),
  ]);
}

function removeTestIps() {
  const testKeys = [
    '84.180.213.142_amazon.de_exceeded',
    '84.180.213.142_amazon.de_requestsCount',
    '84.180.213.143_amazon.de_requestsCount',
    '84.180.213.143_country',
    '123.123.21.23_amazon.de_exceeded',
    '123.123.21.23_amazon.de_requestsCount',
    '123.123.21.23_country',
  ];
  return Promise.all(testKeys.map(item => redisService.deleteKey(item)));
}

function waitForRedis(maxWaitingTime) {
  const MAX_WAIT_TIME = maxWaitingTime || 15000;
  let failTimeoutId;
  return new Promise((resolve, reject) => {
    failTimeoutId = setTimeout(reject, MAX_WAIT_TIME);
    const check = callback => {
      if (redisService._ready) {
        clearTimeout(failTimeoutId);
        resolve();
      } else {
        setTimeout(() => {
          check(callback);
        }, 500);
      }
    };
    check(resolve);
  });
}

module.exports = {
  importTestDataToRedis,
  removeTestDataFromRedis,
  waitForRedis,
};
