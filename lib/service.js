'use strict';

const async = require('async');
const retry = require('retry');
const _ = require('lodash');

function Secrets(vault, config) {
    if (!vault || !config) {
        throw new Error('A secrets service requires a vault client and a config object');
    }
    this.vault = vault;
    this.config = config;
    this.renewals = {};

    const secrets = {};

    this.fetchSecret = function(path, pathToSet, cb) {
        const self = this;
        const retryOptions = _.get(self.config, 'hook.retry', {});
        const vault = self.vault;
        const operation = retry.operation(retryOptions);

        // handle renewal cb
        if (!_.isFunction(cb)) {
            cb = _.noop();
        }

        // if there is a scheduled renewal, clear it
        if (_.has(self.renewals, path)) {
            clearTimeout(_.get(self.renewals, path));
            delete(self.renewals, path);
        }

        operation.attempt(function(attemptN) {
            vault.get(path, {
                timeout: 5000
            }, function(err, res) {
                if (operation.retry(err)) {
                    if (_.isFunction(config.log)) {
                        config.log(`Error retreiving secret at path ${path} on attempt ${attemptN}`);
                        config.log(err);
                    }
                    return;
                }
                if (err) {
                    err = operation.mainError();
                    if (_.isFunction(config.log)) {
                        config.log(`Unable to retrieve secret at path ${path} after ${attemptN} attempts`);
                        config.log(err);
                    }
                    return cb(err);
                }
                if (_.isNumber(res.lease_duration) && res.lease_duration > 0) {
                    this.renewals[path] = setTimeout(function() {
                        self.fetchSecret.call(self, path, pathToSet);
                    });
                }
                if (pathToSet === '.') {
                    _.extend(secrets, res.data);
                } else {
                    _.set(secrets, pathToSet, res.data);
                }
                const result = self.get(pathToSet);
                self.emit(`secret:${pathToSet}`, result);
                cb(null, result);
            });
        });
    };

    this.fetchSecrets = function(cb) {
        const self = this;
        const env = process.env.NODE_ENV;
        const retryOptions = _.get(self.config, 'hook.retry', {});
        const map = flattenPaths(_.get(self.config, `secrets.env.${env}`, {}));
        const paths = Object.keys(map);
        const vault = self.vault;

        if (!paths.length) {
            return async.setImmediate(function() {
                cb(new Error(`Missing secrets config for environment: ${env}`));
            });
        }

        async.eachLimit(paths, 5, function(path, next) {


        }, function(err) {

        });
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

module.exports = Secrets;
