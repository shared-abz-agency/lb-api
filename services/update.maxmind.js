'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const DESTINATION = path.resolve(__dirname, '../sources/');
const FILENAME = 'GeoIP2-Country.mmdb';
const ERRORS = {
    NO_SUCH_FILE_OR_DIRECTORY: 'ENOENT'
};

/**
 * Check if passed file exist
 * @param file
 * @returns {Promise}
 */
const checkFileExist = (file) => {
    return new Promise((resolve, reject) => {
        fs.stat(file, (err, stats) => {
            if (err) {
                return err.code === ERRORS.NO_SUCH_FILE_OR_DIRECTORY ? resolve(false) : reject(err);
            }
            resolve(stats.isFile());
        });
    });
};

/**
 * Check if destination directory exist for maxmind DB.
 * @param destinationPath
 * @returns {Promise}
 */
const checkDestinationFolder = (destinationPath) => {
    return new Promise((resolve, reject) => {
        fs.stat(destinationPath, (err, stats) => {
            if (err) {
                return err.code === ERRORS.NO_SUCH_FILE_OR_DIRECTORY ? resolve(false) : reject(err);
            }
            resolve(stats.isDirectory());
        });
    });
};

/**
 * Download maxmind DB from foxydeal.com
 */
const downloadFile = () => new Promise((resolve, reject) => {
    let originPath = `${DESTINATION}/${FILENAME}`;
    let fileStream = fs.createWriteStream(`${originPath}.tmp`);
    let request = https.get({
        hostname: 'php.foxydeal.com',
        path: '/geoip/GeoIP2-Country.mmdb',
        auth: 'geoip:zV21lZl3qbeZilRXU4Ta',
    }, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
            checkFileExist(originPath)
                .then((res) => {
                    if (res) {
                        fs.unlink(originPath, () => {
                            fs.rename(`${originPath}.tmp`, `${originPath}`, resolve);
                        });
                    } else {
                        fs.rename(`${originPath}.tmp`, `${originPath}`, resolve);
                    }
                });
        });
        fileStream.on('error', reject);
    });
    request.on('error', reject);
});

/**
 * Download GeoToIP Maxmind DB file to DESTINATION folder
 * @returns {Promise.<TResult>}
 */
const downloadMaxmind = () => {
    return checkDestinationFolder(DESTINATION)
        .then((isDirectoryExist) => {
            return new Promise((resolve, reject) => {
                if (!isDirectoryExist) {
                    mkdirp(DESTINATION, (err) => err ? reject(err) : resolve());
                } else {
                    resolve();
                }
            });
        })
        .then(downloadFile)
        .catch(err => Promise.reject(err));
};

module.exports = downloadMaxmind;
