'use strict';

var async = require('async'),
    axios = require('axios'),
    joi = require('joi'),
    ms = require('ms'),
    secrets,
    _ = require('lodash');

var delayCallback = function(currentBackoff, maxBackoff, step, callback, context) {
    let timeout = currentBackoff;
    if (timeout > maxBackoff) {
        timeout = maxBackoff;
    } else {
        currentBackoff = step ? currentBackoff + step : currentBackoff * 2;
    }
    context.setTimeout(function() {
        callback();
    }, timeout);
};

function draw(map, env) {
    return _.transform(map, function(result, value, key) {
        _.set(result, value, env[key] || {});
    }, {});
}

function map(obj, env) {
    env = env || process.env;
    if (_.isString(obj)) {
        return env[obj];
    }
    return _.transform(obj, function(result, value, key) {
        if (_.isPlainObject(value)) {
            result[key] = map(value, env);
        } else if (_.isString(value)) {
            result[key] = _.get(env, value);
        } else {
            result[key] = value;
        }
    }, {});
}

function refer(value) {
    return value;
}

module.exports = function Secrets(done) {
    let mycro = this,
        config = mycro._config.secrets;

    // resolve function attributes
    ['env', 'vault'].forEach(function(key) {
        if (_.isFunction(config[key])) {
            config[key] = config[key]();
        }
    });

    let schema, options;
    async.auto({
        // validate hook config
        config: function validateHookConfig(fn) {
            joi.validate(mycro._config.secrets, joi.object({
                __clock: joi.object().optional(),
                env: joi.object().default({}),
                fetchVaultInfo: joi.func().arity(1).optional(),
                validate: joi.array().ordered(
                    joi.func().arity(1).required(),
                    joi.object().default({})
                ).single(),
                vault: joi.alternatives().try(
                    joi.string(),
                    joi.object()
                )
            }), {presence: 'required'}, function(err, validated) {
                if (err) {
                    err.message = 'Invalid `secrets` config: ' + err.message;
                    return fn(err);
                }

                schema = validated.validate[0];
                options = validated.validate[1];

                // apply validation defaults
                options = _.merge({}, {
                    allowUnknown: true,
                    convert: true,
                    context: {
                        env: process.env.NODE_ENV
                    }
                }, options);

                try {
                    schema = schema(joi);
                    return fn(null, validated);
                } catch (e) {
                    return fn(e);
                }
            });
        },

        // attempt to locate secrets in the environment
        env: ['config', function validateEnv(fn, r) {
            try {
                let envSecrets = map(config.env),
                    result = joi.validate(envSecrets, schema, options);
                if (result.error) {
                    throw result.error;
                }
                mycro.secrets = function(path) {
                    let secrets = _.cloneDeep(result.value);
                    return _.isString(path) ? _.get(secrets, path) : secrets;
                };
                fn(null, true);
            } catch (e) {
                mycro.log('silly', '[Secrets]', 'Insufficient environment variables present.');
                fn();
            }
        }],

        // attempt to locate vault info
        vault: ['env', function fetchVaultInfo(fn, r) {
            if (r.env) {
                return fn();
            }
            if (_.isFunction(config.fetchVaultInfo)) {
                return config.fetchVaultInfo(function(err, info) {
                    if (err) {
                        return fn(err);
                    }
                    if (!info.url || !info.token) {
                        return fn(new Error('Missing required vault info'));
                    }
                    fn(null, info);
                });
            }
            let info = _.pick(process.env, ['VAULT_PREFIX', 'VAULT_TOKEN', 'VAULT_URL']);
            if (info.VAULT_TOKEN && info.VAULT_URL) {
                return fn(null, _.mapKeys(info, function(v, k) {
                    return k.replace('VAULT_', '').toLowerCase();
                }));
            }
            fn(new Error('Unable to locate vault info (url and/or token)'));
        }],

        // attempt to fetch secrets from vault
        fetch: ['vault', function contactVault(fn, r) {
            if (r.env) {
                return fn();
            }
            // get an array of vault paths to fetch
            let paths = _.keys(config.vault),
                baseUrl = r.vault.url + (r.vault.url.charAt(-1) === '/' ? '' : '/') + 'v1/secret' + (r.vault.prefix || '');

            // define delays
            let backoffs = config.backoff || {},
                currentBackoff = ms(backoffs.first),
                maxBackoff = ms(backoffs.max),
                step = ms(backoffs.step);

            if (isNaN(currentBackoff)) {
                currentBackoff = ms('30s');
            }
            if (isNaN(maxBackoff)) {
                maxBackoff = ms('10m');
            }
            if (isNaN(step)) {
                step = false;
            }

            // attempt to fetch secrets indefinitely, with increasing backoff after each failed attempt
            let exchanged = false;
            async.doUntil(
                function fetchSecrets(_fn) {
                    async.mapLimit(paths, 5, function(path, __fn) {
                        let url = baseUrl + path;
                        axios.get({
                            url: url,
                            headers: {
                                'x-vault-token': r.vault.token
                            }
                        }).then(function(response) {
                            let result = {
                                path: path,
                                data: response.data.data
                            };
                            __fn(null, result);
                        }).catch(function(response) {
                            if (response.status === 404) {
                                let result = {
                                    path: path,
                                    data: {}
                                };
                                return __fn(null, result);
                            }
                            __fn(new Error(response));
                        });
                    }, function(err, results) {
                        if (err) {
                            mycro.log('error', new Error('Vault communication error: ' + (err.message || err)));
                            delayCallback(currentBackoff, maxBackoff, step, _fn, config.__clock || global);
                        } else {
                            let env = _.reduce(results, function(memo, result) {
                                memo[result.path] = result.data;
                                return memo;
                            }, {});
                            try {
                                let vaultSecrets = draw(config.vault, env),
                                    result = joi.validate(vaultSecrets, schema, options);
                                if (result.error) {
                                    throw result.error;
                                }
                                mycro.secrets = function(path) {
                                    let secrets = _.cloneDeep(result.value);
                                    return _.isString(path) ? _.get(secrets, path) : secrets;
                                };
                                exchanged = true;
                                _fn();
                            } catch (e) {
                                mycro.log('error', new Error('Invalid secrets received from vault: ' + (e.message || e)));
                                console.error(process.env.NODE_ENV);
                                console.error(e);
                                delayCallback(currentBackoff, maxBackoff, step, _fn, config.__clock || global);
                            }
                        }
                    });
                },
                function evaluateExchange() {
                    return exchanged;
                },
                fn
            );
        }]
    }, done);
};
