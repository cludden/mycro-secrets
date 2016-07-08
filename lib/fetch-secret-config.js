'use strict';

const async = require('async');
const joi = require('joi');
const _ = require('lodash');

/**
 * Validate hook options, retrieve secrets configuration, validate it, and
 * return
 * @param  {Object} mycro
 * @param  {Function} cb
 */
module.exports = function fetchSecretConfig(mycro, cb) {
    async.auto({
        // validate hook configuration
        hook: function validateHookConfig(fn) {
            const config = _.get(mycro, '_config.secrets');
            const schema = joi.object({
                config: joi.func().maxArity(2).required(),
                interceptRequest: joi.func(),
                interceptResponse: joi.array().items(
                    joi.func()
                ).length(2),
                log: joi.func(),
                retry: joi.object(),
                validate: joi.func().maxArity(2).required(),
                vault: joi.alternatives().try(
                    joi.func(),
                    joi.object()
                )
            }).unknown(true).required();
            joi.validate(config, schema, function(err) {
                if (err) {
                    return fn(err);
                }
                if (_.isFunction(config.vault)) {
                    config.vault = config.vault(mycro);
                }
                fn(null, config);
            });
        },

        // fetch secrets config
        config: ['hook', function fetchSecretConfig(fn, r) {
            const hook = r.hook;
            if (hook.config.length < 2) {
                return async.setImmediate(function() {
                    const config = _.attempt(function() {
                        return hook.config(mycro);
                    });
                    if (_.isError(config)) {
                        return fn(config);
                    }
                    fn(null, config);
                });
            }
            hook.config(mycro, fn);
        }],

        // validate secrets config
        validated: ['config', function validateSecretConfig(fn, r) {
            const config = r.config;
            const schema = joi.object({
                auth: joi.object({
                    backend: joi.string().required(),
                    options: joi.object(),
                    renew_interval: joi.string(),
                    retry: joi.object()
                }).unknown(true).required(),
                secrets: joi.object().required(),
                vault: joi.object()
            }).unknown(true).required();
            joi.validate(config, schema, fn);
        }]
    }, function(err, r) {
        cb(err, {
            hook: r.hook,
            secrets: r.validated
        });
    });
};
