/**
 * New Relic agent configuration.
 *
 * See lib/config.defaults.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
exports.config = {
    /**
     * Array of application names.
     */
    app_name: ['loadbalancer-api'],
    /**
     * Your New Relic license key.
     */
    license_key: '662f0c5fe84ed9b6ea5d574b4e03023a04458ffe',
    logging: {
        /**
         * Level at which to log. 'trace' is most useful to New Relic when diagnosing
         * issues with the agent, 'info' and higher will impose the least overhead on
         * production applications.
         */
        level: 'warn',
    },
};
