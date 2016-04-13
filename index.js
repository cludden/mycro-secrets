'use strict';

const async = require('async');
const AWS = require('aws-sdk');
const axios = require('axios');
const joi = require('joi');
const ms = require('ms');
const _ = require('lodash');

module.exports = function secrets(done) {
    const mycro = this;

    // get secrets config
    const secretsConfig = _.get(mycro, '_config.secrets') || {};
    let result = joi.validate(secretsConfig, joi.object({
        attempts: joi.number().integer(),
        configId: joi.string().required(),
        interval: joi.alternatives().try(
            joi.number().integer(),
            joi.string()
        ),
        region: joi.string().required(),
        tableName: joi.string().required(),
        validate: joi.func()
    }).unknown(true).required());
    if (result.error) {
        return async.setImmediate(function() {
            done(result.error);
        });
    }
    if (_.isString(secretsConfig.attempts)) {
        secretsConfig.attempts = ms(secretsConfig.attempts);
        if (!secretsConfig.attempts) {
            secretsConfig.attempts = ms('30s');
        }
    }

    // configure AWS sdk
    const config = _.extend({
        region: _.get(mycro, '_config.secrets.region') || 'us-west-2'
    }, {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });
    AWS.config.update(config);

    // instantiate new dynamo db doc client
    const dynamo = mycro.dynamo || new AWS.DynamoDB.DocumentClient({
        sslEnabled: true
    });

    async.auto({
        // retrieve service config from dynamo db
        config: function getConfigFromDynamoDB(fn) {
            dynamo.get({
                TableName: secretsConfig.tableName,
                Key: {
                    id: secretsConfig.configId
                }
            }, function(err, data) {
                if (err) {
                    let errMsg = `Error retrieving service config from dynamodb`;
                    mycro.log('error', errMsg, err);
                    return fn(err);
                }
                mycro.log('silly', `Successfully retreived service config from dynamo db`);
                fn(null, data.Item);
            });
        },

        // validate the config object received from dynamodb
        validated: ['config', function validateServiceConfig(fn, r) {
            let configSchema = joi.object({
                secrets: joi.object().required(),
                vault: joi.object({
                    token: joi.string(),
                    'test-token': joi.string(),
                    url: joi.string().required()
                }).required()
            }).required();

            joi.validate(r.config, configSchema, {
                allowUnknown: true
            }, function(err, validated) {
                if (err) {
                    mycro.log('error', `Invalid config document retreived from dynamodb`, err);
                    return fn(err);
                }
                mycro.log('silly', `Successfully validated service config`);
                fn(null, validated);
            });
        }],

        // fetch required secrets from vault
        secrets: ['validated', function fetchSecretsFromVault(fn, r) {
            let config = flattenPaths(r.validated.secrets, r.validated.vault.url);
            let env = process.env.NODE_ENV || 'development';
            let prodToken = r.validated.vault.token;
            let testToken = r.validated.vault['test-token'];
            let devToken = process.env.VAULT_TOKEN;
            let devTestToken = process.env.VAULT_TOKEN_TEST;
            let token = env === 'test' ? (devTestToken || testToken) : (devToken || prodToken);
            if (!token) {
                return async.setImmediate(function() {
                    fn(new Error(`Missing required vault token`));
                });
            }

            let secrets = {};
            async.each(Object.keys(config), function(path, _fn) {
                let pathToSet = config[path];
                let response = null;
                let task = function requestFromVault(__fn) {
                    axios.get(path, {
                        headers: {
                            'X-Vault-Token': token
                        }
                    }).then(function(r) {
                        let data = _.get(r, 'data.data');
                        if (!data) {
                            return __fn(new Error(`Invalid response from vault. No \`data\` key found in responsebody.`));
                        }
                        mycro.log('silly', `Successfully retreived secret from vault (` + path + `)`);
                        _.set(secrets, pathToSet, data);
                        response = r;
                        __fn();
                    }).catch(function(response) {
                        mycro.log('error', `There was an error requesting a secret from vault: ` + path, response);
                        setTimeout(function() {
                            if (!secretsConfig.attempts) {
                                __fn(response);
                            } else {
                                __fn();
                            }
                        }, secretsConfig.interval);
                    });
                };
                if (!secretsConfig.attempts) {
                    async.doUntil(
                        task,
                        function test() {
                            return response !== null;
                        },
                        _fn
                    );
                } else {
                    async.retry(secretsConfig.attempts, task, _fn);
                }
            }, function(err) {
                if (err) {
                    mycro.log('error', err);
                    return fn(err);
                }
                fn(null, {
                    secrets,
                    vault: {
                        token: token
                    }
                });
            });
        }],

        // validate obtained secrets if applicable
        validate: ['secrets', function(fn, r) {
            if (!secretsConfig.validate) {
                return async.setImmediate(function() {
                    fn(null, r.secrets.secrets);
                });
            }
            let schema = secretsConfig.validate(joi);
            joi.validate(r.secrets.secrets, schema, {}, fn);
        }],

        // apply defaults and create accessor method on mycro instance
        publish: ['validate', function(fn, r) {
            let secrets = r.validate;
            _.defaults(secrets, _.pick(r.secrets, 'vault'));
            Object.freeze(secrets);
            mycro.secrets = function(path) {
                if (!path) {
                    return secrets;
                }
                return _.get(secrets, path);
            };
            fn();
        }]
    }, done);
};


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
