const RedisClient = require('../lib/services/redis');

const redisService = RedisClient.getInstance();

// Test UIDS
const testUids = [
  {
    uid: 201,
    data: {
      date: new Date(2017, 10, 10).getTime(),
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
  let testExceedDataPromise = redisService.setValue(key, Date.now());
  return Promise.all([
    ...testUids.map(item =>
      redisService.setObject(`${item.uid}_domainRequest`, item.data)
    ),
    testExceedDataPromise,
  ]);
}

function removeTestDataFromRedis() {
  let removeKeyPromise = redisService.deleteKey(key);
  return Promise.all([
    ...testUids.map(item =>
      redisService.deleteKey(`${item.uid}_domainRequest`)
    ),
    removeTestIps(),
    removeKeyPromise,
  ]);
}

function removeTestIps() {
  const GERMAN_IP = '84.180.213.142';
  const GERMAN_IP2 = '84.180.213.143';
  const RANDOM_IP = '123.123.21.23';
  return Promise.all([
    redisService.cleanByKeyPattern(`*${GERMAN_IP}*`),
    redisService.cleanByKeyPattern(`*${GERMAN_IP2}*`),
    redisService.cleanByKeyPattern(`*${RANDOM_IP}*`),
  ]);
}

module.exports = {
  importTestDataToRedis,
  removeTestDataFromRedis,
};
