'use strict';

const async = require('async');
const Vault = require('vault-client');
const _ = require('lodash');

module.exports = function(mycro, config, cb) {
    const env = process.env.NODE_ENV || 'development';
    const options = _.get(config, `envs.${env}.vault`) || config.vault;
    const vault = _.attempt(function() {
        return new Vault(options);
    });

    if (_.isError(vault)) {
        return async.setImmediate(function() {
            cb(vault);
        });
    }

    const auth = _.get(config, `envs.${env}.auth`);
    vault.login(auth, function(err) {
        if (err) {
            return cb(err);
        }
        cb(null, vault);
    });
};
