'use strict';

const async = require('async');
const EventEmitter = require('events').EventEmitter;
const retry = require('retry');
const util = require('util');
const _ = require('lodash');

function Secret(vault, config) {
    if (!vault || !config) {
        throw new Error('A secrets service requires a vault client and a config object');
    }

    EventEmitter.call(this);

    this.vault = vault;
    this.config = config;
    this.renewals = {};

    const secrets = {};

    /**
     * Fetch a single secret from vault. If the secret has a lease duration,
     * renew it when the lease is up.
     * @param  {String} path
     * @param  {String} address
     * @param  {Function} cb
     */
    this.fetchSecret = function(path, address, cb) {
        const self = this;
        const retryOptions = _.get(self.config, 'hook.retry', {});
        const vault = self.vault;
        const operation = retry.operation(retryOptions);

        // handle renewal cb
        if (!_.isFunction(cb)) {
            cb = _.noop;
        }

        // if there is a scheduled renewal, clear it
        if (_.has(self.renewals, path)) {
            clearTimeout(self.renewals[path]);
            delete self.renewals[path];
        }

        operation.attempt(function(attemptN) {
            vault.get(path, {
                timeout: 5000
            }, function(err, res) {
                if (err) {
                    if (operation.retry(err)) {
                        if (_.isFunction(config.hook.log)) {
                            config.log(`Error retreiving secret at path ${path} on attempt ${attemptN}`);
                            config.log(err);
                        }
                        return;
                    }
                    err = operation.mainError();
                    if (_.isFunction(config.hook.log)) {
                        config.log(`Unable to retrieve secret at path ${path} after ${attemptN} attempts`);
                        config.log(err);
                    }
                    return cb(err);
                }
                if (_.isNumber(res.lease_duration) && res.lease_duration > 0) {
                    const timeout = res.lease_duration * 1000 > 2147483647 ? 2147483647 : res.lease_duration * 1000;
                    self.renewals[path] = setTimeout(function() {
                        self.fetchSecret.call(self, path, address);
                    }, timeout);
                }

                if (address === '.') {
                    _.extend(secrets, res.data);
                } else {
                    _.set(secrets, address, res.data);
                }
                const result = address === '.' ? self.get() : self.get(address);
                self.emit(`secret:${address}`, result);
                cb(null, result);
            });
        });
    };


    /**
     * Fetch all secrets defined in the secrets config. Set up renewing.
     * @param  {Function} cb
     */
    this.fetchSecrets = function(cb) {
        const self = this;
        const map = flattenPaths(self.config.secrets.secrets);
        const paths = Object.keys(map);

        if (!paths.length) {
            return async.setImmediate(function() {
                cb(new Error(`Missing secrets config`));
            });
        }

        async.waterfall([
            function fetchInvididualSecrets(fn) {
                async.eachLimit(paths, 5, function(path, next) {
                    const address = map[path];
                    self.fetchSecret(path, address, next);
                }, fn);
            },

            function validateSecrets(fn) {
                const hook = self.config.hook;
                if (hook.validate.length < 2) {
                    const validated = _.attempt(function() {
                        return hook.validate(secrets);
                    });
                    if (_.isError(validated)) {
                        return async.setImmediate(function() {
                            fn(validated);
                        });
                    }
                    _.merge(secrets, validated);
                    return async.setImmediate(fn);
                } else {
                    hook.validate(secrets, function(err, validated) {
                        if (err) {
                            return fn(err);
                        }
                        _.merge(secrets, validated);
                        fn();
                    });
                }
            }
        ], cb);
    };

    /**
     * Retrieve part or all of the secrets tree
     * @param  {String} [path]
     * @return {*}
     */
    this.get = function(path) {
        if (!_.isString(path)) {
            return _.cloneDeep(secrets);
        }
        const result = _.get(secrets, path);
        return _.cloneDeep(result);
    };
}

util.inherits(Secret, EventEmitter);

/**
* Flatten a nested object by concatenating keys
* @param  {Object} config - the object to flatten
* @param  {String} [basePath=''] - the parent key
* @return {Object} the flattened object
*/
function flattenPaths(config, basePath) {
    if (!basePath) {
        basePath = '';
    }
    return _.transform(config, function(result, value, key) {
        if (_.isString(value)) {
            result[basePath + key] = value;
        } else if (_.isObject(value)) {
            let flattened = flattenPaths(value, basePath + key);
            _.extend(result, flattened);
        }
    }, {});
}

module.exports = Secret;
