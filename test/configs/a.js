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
            'AWS_ACCESS_KEY_ID': 'aws.accessKeyId',
            'AWS_SECRET_ACCESS_KEY': 'aws.secretAccessKey',
            'BUCKET': 'aws.s3.bucket',
            'BUGSNAG_API_KEY': 'bugsnag.api-key',
            'MONGO_DB': 'mongo.database',
            'MONGO_HOST': 'mongo.host',
            'MONGO_PASSWORD': 'mongo.password',
            'MONGO_PORT': 'mongo.port',
            'MONGO_URL': 'mongo.url',
            'MONGO_USERNAME': 'mongo.username',
            'NODE_ENV': 'env',
            'REGION': 'aws.s3.region'
        });
    },

    fetchVaultInfo: function(done) {
        return done(null, {
            prefix: '/v1/secret/documents',
            token: process.env.VAULT_TOKEN,
            url: process.env.VAULT_URL
        });
    },

    logValidationErrors: true,

    validate: [function(joi) {
        return joi.object({
            aws: joi.object({
                accessKeyId: joi.when('$env', {
                    is: joi.string().valid('development', 'test'),
                    then: joi.string().required(),
                    otherwise: joi.string()
                }),
                secretAccessKey: joi.when('$env', {
                    is: joi.string().valid('development', 'test'),
                    then: joi.string().required(),
                    otherwise: joi.string()
                }),
                s3: joi.object({
                    bucket: joi.string().required(),
                    region: joi.string().default('us-west-2')
                }).required()
            }).required(),
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
            }).or('host', 'url').with('host', 'database').required()
        });
    }, {}],

    vault: {
        '/documents/aws': 'aws',
        '/documents/bugsnag': 'bugsnag',
        '/documents/mongo': 'mongo',
        '/documents/s3': 'aws.s3'
    }
};
