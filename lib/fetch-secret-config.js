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
                config: joi.func().arity(2).required(),
                retry: joi.object(),
                validate: joi.func().arity(1).required()
            }).unknown(true).required();
            joi.validate(config, schema, fn);
        },

        // fetch secrets config
        config: ['hook', function fetchSecretConfig(fn, r) {
            const hook = r.hook;
            hook.config(mycro, fn);
        }],

        // validate secrets config
        validated: ['config', function validateSecretConfig(fn, r) {
            const config = r.config;
            const schema = joi.object({
                envs: joi.object().required().pattern(/.+/g, joi.object({
                    auth: joi.object({
                        backend: joi.string().required(),
                        options: joi.object(),
                        renew_interval: joi.string(),
                        retry: joi.object()
                    }).unknown(true).required(),
                    secrets: joi.object().required(),
                    vault: joi.object()
                })),
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
