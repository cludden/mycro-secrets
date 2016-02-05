'use strict';

var _ = require('lodash');

function convertToTestVar(obj) {
    if (process.env.NODE_ENV !== 'test') {
        return obj;
    }
    return _.transform(obj, function(result, value, key) {
        if (_.isPlainObject(value)) {
            result[key] = convertToTestVar(value);
        } else if (_.isString(value)) {
            result[key] = value + '_TEST';
        }
    }, {});
}

module.exports = {
    env: function() {
        return convertToTestVar({
            aws: {
                accessKeyId: 'AWS_ACCESS_KEY_ID',
                secretAccessKey: 'AWS_SECRET_ACCESS_KEY',
                s3: {
                    bucket: 'BUCKET',
                    region: 'REGION'
                }
            },
            bugsnag: {
                'api-key': 'BUGSNAG_API_KEY'
            },
            env: 'NODE_ENV',
            mongo: {
                database: 'MONGO_DB',
                host: 'MONGO_HOST',
                password: 'MONGO_PASSWORD',
                port: 'MONGO_PORT',
                url: 'MONGO_URL',
                username: 'MONGO_USERNAME'
            }
        });
    },

    fetchVaultInfo: function(done) {
        return done(null, {
            prefix: 'documents',
            token: process.env.VAULT_TOKEN,
            url: process.env.VAULT_URL
        });
    },

    validate: [function(joi) {
        return joi.object({
            aws: joi.object({
                accessKeyId: joi.string(),
                secretAccessKey: joi.string(),
                s3: joi.object({
                    bucket: joi.string().required(),
                    region: joi.string().default('us-west-2')
                })
            }),
            bugsnag: joi.object({
                'api-key': joi.string().required()
            }),
            env: joi.string().default(function() {
                return process.env.NODE_ENV || 'development';
            }, 'node environment'),
            mongo: joi.object({
                database: joi.string(),
                host: joi.string(),
                password: joi.string().required(),
                port: joi.number().integer().default(27017),
                url: joi.string(),
                username: joi.string().required()
            }).or('host', 'url').with('host', 'database')
        });
    }, {}],

    vault: function() {
        return '/documents/init';
    }
};
