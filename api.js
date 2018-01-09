'use strict';
if (process.env.HOME === '/app') {
  /* eslint no-unused-vars:0 */
  require('newrelic');
}
const cluster = require('cluster');
const memored = require('memored');
const log = new (require('./lib/services/log'))();
const downloadMaxmind = require('./services/update.maxmind');
const start = require('./start');
memored.setup({
  purgeInterval: 15000,
  logger: false,
});
let WORKERS = process.env.WEB_CONCURRENCY || 2;

const createWorkers = () => {
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(
      'worker %d died (%s). restarting...',
      worker.process.pid,
      signal || code
    );
    cluster.fork();
  });
};

if (!module.parent) {
  if (cluster.isMaster) {
    setTimeout(() => {}, 1000);
    downloadMaxmind()
      .then(createWorkers)
      .then(() => log.log('Maxmind DB updated successfully'))
      .catch(err => {
        log.log('Error on downloading maxmind DB, ', err);
        createWorkers();
      });
  } else {
    start();
  }
}

module.exports = start;
