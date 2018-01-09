'use strict';
const RedisDataService = require('../services/redis.data');
try {
  let redisDataService = RedisDataService.getInstance();
  redisDataService.deleteCountriesIps()
    .then(() => process.exit(0))
    .catch((err) => {
      console.log('During country/ip clean error occurred', err);
      process.exit(0);
    });
} catch (err) {
  console.log('Clean country/ip cron throws error:', err);
  process.exit(0);
}
