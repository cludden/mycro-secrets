'use strict';

const async = require('async');
const Vault = require('vault-client');
const _ = require('lodash');

module.exports = function(mycro, config, cb) {
    const options = config.secrets.vault;
    const vault = config.hook.vault || _.attempt(function() {
        return new Vault(options);
    });

    if (_.isError(vault)) {
        return async.setImmediate(function() {
            cb(vault);
        });
    }

    const auth = config.secrets.auth;
    vault.login(auth, function(err) {
        if (err) {
            return cb(err);
        }
        cb(null, vault);
    });
};
