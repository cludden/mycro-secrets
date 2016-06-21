'use strict';

const async = require('async');
const Vault = require('vault-client');
const _ = require('lodash');

module.exports = function(mycro, config, cb) {
    const options = config.vault;
    const vault = config.vault || _.attempt(function() {
        return new Vault(options);
    });

    if (_.isError(vault)) {
        return async.setImmediate(function() {
            cb(vault);
        });
    }

    const auth = config.auth;
    vault.login(auth, function(err) {
        if (err) {
            return cb(err);
        }
        cb(null, vault);
    });
};
