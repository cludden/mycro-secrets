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

function pluckPaths(obj, paths) {
    paths = _.isArray(paths) ? paths : [];
    if (_.isString(obj)) {
        paths.push(obj);
    } else if (_.isPlainObject(obj)) {
        _.values(obj).forEach(function(value) {
            if (_.isString(value) && paths.indexOf(value) === -1) {
                paths.push(value);
            } else if (_.isPlainObject(value)) {
                pluckPaths(value, paths);
            }
        });
    }
    return paths;
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
                fn(null, validated);
            });
        },

        // attempt to locate secrets in the environment
        env: ['config', function validateEnv(fn, r) {
            let envSecrets = map(config.env),
                schema = r.config.validate[0],
                options = r.config.validate[1];

            // apply validation defaults
            _.defaults(options, {
                allowUnknown: true,
                convert: true
            });

            try {
                schema = schema(joi);
                schema.options(options);
                envSecrets = joi.attempt(envSecrets, schema);
                mycro.secrets = function(path) {
                    let secrets = _.cloneDeep(envSecrets);
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
            let paths = pluckPaths(config.vault),
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
                            let vaultSecrets = map(config.vault, env);
                            mycro.secrets = function(path) {
                                let secrets = _.cloneDeep(vaultSecrets);
                                return _.isString(path) ? _.get(secrets, path) : secrets;
                            };
                            exchanged = true;
                            _fn();
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
