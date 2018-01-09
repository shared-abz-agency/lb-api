'use strict';
class Logger {
    /* eslint prefer-rest-params:0 */
    /* eslint no-console:0 */
    log () {
        if (this.visible()) {
            console.log.apply(null, arguments);
        }
    }

    trace () {
        if (this.visible()) {
            console.trace.apply(null, arguments);
        }
    }

    info () {
        if (this.visible()) {
            console.info.apply(null, arguments);
        }
    }

    visible () {
        return process.env.DEBUG;
    }
}
module.exports = Logger;
