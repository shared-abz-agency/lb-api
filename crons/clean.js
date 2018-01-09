'use strict';
const RedisDataService = require('../services/redis.data');
try {
    let redisDataService = RedisDataService.getInstance();
    redisDataService.cleanRequestCounts()
        .then(() => process.exit(0))
        .catch((err) => {
            console.log('During clean error occurred', err);
            process.exit(0);
        });
} catch (err) {
    console.log('Clean cron throws error:', err); // should we log it to console ?
    process.exit(0);
}
