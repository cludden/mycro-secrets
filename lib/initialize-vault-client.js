'use strict';

const async = require('async');
const Vault = require('vault-client');
const _ = require('lodash');

module.exports = function(mycro, config, cb) {
    const options = config.secrets.vault;
    const vault = config.hook.vault || _.attempt(function() {
        const _vault = new Vault(options);
        if (_.isFunction(config.hook.interceptRequest)) {
            _vault.client.__reqInterceptor = _vault.client.interceptors.request.use(config.hook.interceptRequest);
        }
        if (_.isArray(config.hook.interceptResponse) && config.hook.interceptResponse.length === 2) {
            const fn1 = config.hook.interceptResponse[0];
            const fn2 = config.hook.interceptResponse[1];
            if (_.isFunction(fn1) && _.isFunction(fn2)) {
                _vault.client.__resInterceptor = _vault.client.interceptors.response.use(fn1, fn2);
            }
        }
        return _vault;
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
