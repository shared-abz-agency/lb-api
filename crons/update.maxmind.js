const updateMaxmind = require('../services/update.maxmind');

console.log('Start downloading maxmind DB');
updateMaxmind()
  .then(() => console.log('Maxmind DB updated successfuly'))
  .catch(err => console.log('Error on update maxmind', err));
