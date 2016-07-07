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
        const log = _.isFunction(self.config.hook.log) ? self.config.hook.log : _.noop;

        // handle renewal cb
        if (!_.isFunction(cb)) {
            cb = _.noop;
        }

        // if there is a scheduled renewal, clear it
        if (_.has(self.renewals, path)) {
            clearTimeout(self.renewals.path);
            delete self.renewals[path];
        }

        operation.attempt(function(attemptN) {
            vault.get(path, {
                timeout: 1000
            }, function(err, res) {
                console.log(err);
                if (operation.retry(err)) {
                    log(`Error retreiving secret at path ${path} on attempt ${attemptN}`);
                    log(err);
                    return;
                }
                if (err) {
                    const mainErr = operation.mainError();
                    err = mainErr ? mainErr : err;
                    log(`Unable to retrieve secret at path ${path} after ${attemptN} attempts`);
                    log(err);
                    return cb(err);
                }
                if (_.isNumber(res.lease_duration) && res.lease_duration > 0) {
                    self.renewals[path] = setTimeout(function() {
                        self.fetchSecret.call(self, path, address);
                    }, 10000);
                }
                if (address === '.') {
                    _.merge(secrets, res.data);
                } else {
                    if (!_.get(secrets, address)) {
                        _.set(secrets, address, res.data);
                    } else {
                        const tempSecrets = {};
                        _.set(tempSecrets, address, res.data);
                        _.merge(secrets, tempSecrets);
                    }
                }
                const result = address === '.' ? self.get() : self.get(address);
                const eventName = address === '.' ? 'secret:global' : `secret:${address}`;
                self.emit(eventName, result);
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
                cb(new Error(`No paths found in config object`));
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
