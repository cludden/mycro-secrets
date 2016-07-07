'use strict';

const async = require('async');
const client = require('./initialize-vault-client');
const config = require('./fetch-secret-config');
const Secret = require('./service');
const _ = require('lodash');

module.exports = function(done) {
    const mycro = this;

    async.auto({
        // fetch and validate hook and secrets configuration
        config: function fetchAndValidateConfig(fn) {
            config(mycro, fn);
        },

        // create vault client and authenticate with vault server
        vault: ['config', function initialzieVaultClient(fn, r) {
            const config = r.config;
            client(mycro, config, fn);
        }],

        // instantiate new Secret service
        service: ['vault', function initializeService(fn, r) {
            const config = r.config;
            const vault = r.vault;
            const secret = _.attempt(function() {
                return new Secret(vault, config);
            });
            if (_.isError(secret)) {
                return async.setImmediate(function() {
                    fn(secret);
                });
            }
            _.set(mycro, 'services.secret', secret);
            secret.fetchSecrets(fn);
        }]
    }, done);
};
