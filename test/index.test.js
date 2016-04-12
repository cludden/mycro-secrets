/* jshint expr:true */
'use strict';

const async = require('async');
const axios = require('axios');
const AWS = require('aws-sdk');
const chai = require('chai');
const hook = require('../index');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const _ = require('lodash');

const expect = chai.expect;

chai.use(sinonChai);

let awsConfig = {region: 'us-west-2'};
AWS.config.update(awsConfig);

const dynamo = new AWS.DynamoDB.DocumentClient();

function Mycro() {
    this.log = function() {};
    this._config = {};
}

describe('mycro-secrets', function() {
    context('(expected failures)', function() {
        let config = {
            attempts: 3,
            configId: 'my-service',
            interval: '30s',
            region: 'us-west-2',
            tableName: 'config-table',
            validate: function(joi) {
                return joi.object({
                    mongo: joi.object().required()
                }).required().unknown(true);
            }
        };

        ['tableName', 'configId', 'region'].forEach(function(attr) {
            it(`should fail if the config is missing a '${attr}' attribute`, function(done) {
                let mycro = new Mycro();
                _.set(mycro, '_config.secrets', _.omit(config, attr));
                hook.call(mycro, function(err) {
                    expect(err).to.exist;
                    done();
                });
            });
        });

        it('should fail if the config object contains an invalid `attempts` attribute', function(done) {
            let invalid = _.merge({}, config, {attempts: true});
            let mycro = new Mycro();
            _.set(mycro, '_config.secrets', invalid);
            hook.call(mycro, function(err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if the config object contains an invalid `interval` attribute', function(done) {
            let invalid = _.merge({}, config, {interval: true});
            let mycro = new Mycro();
            _.set(mycro, '_config.secrets', invalid);
            hook.call(mycro, function(err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if the config object contains an invalid `validate` attribute', function(done) {
            let invalid = _.merge({}, config, {validate: true});
            let mycro = new Mycro();
            _.set(mycro, '_config.secrets', invalid);
            hook.call(mycro, function(err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if there is an error retreiving the config from dynamo db', function(done) {
            let mycro = new Mycro();
            mycro.dynamo = dynamo;
            _.set(mycro, '_config.secrets', config);
            sinon.stub(mycro.dynamo, 'get').yieldsAsync(new Error('something unexpected'));
            hook.call(mycro, function(err) {
                mycro.dynamo.get.restore();
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if the config is not the correct format', function(done) {
            let mycro = new Mycro();
            mycro.dynamo = dynamo;
            _.set(mycro, '_config.secrets', config);
            sinon.stub(mycro.dynamo, 'get').yieldsAsync(null, {
                Item: {
                    secrets: 2
                }
            });
            hook.call(mycro, function(err) {
                mycro.dynamo.get.restore();
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if `attempts` are specified and at least one secret can not be fetched successfully', function(done) {
            let mycro = new Mycro();
            mycro.dynamo = dynamo;
            _.set(mycro, '_config.secrets', config);
            sinon.stub(mycro.dynamo, 'get').yieldsAsync(null, {
                Item: {
                    secrets: {
                        '/cubbyhole/my-service': 'my-service'
                    },
                    vault: {
                        token: 'abcdefg123',
                        'test-token': 'abcdefg123-test',
                        url: 'https://www.example.com/api/vault/v1'
                    }
                }
            });
            axios.defaults.adapter = function(resolve, reject, config) {
                async.setImmediate(function() {
                    reject({
                        status: 500,
                        data: {
                            errors: [new Error('something unexpected')]
                        }
                    });
                });
            };
            hook.call(mycro, function(err) {
                mycro.dynamo.get.restore();
                delete axios.defaults.adapter;
                expect(err).to.exist;
                done();
            });
        });

        it('should fail if the `secrets` returned by the hook don\'t pass the validation test', function(done) {
            let mycro = new Mycro();
            mycro.dynamo = dynamo;
            _.set(mycro, '_config.secrets', config);
            sinon.stub(mycro.dynamo, 'get').yieldsAsync(null, {
                Item: {
                    secrets: {
                        '/cubbyhole/my-service': 'my-service'
                    },
                    vault: {
                        token: 'abcdefg123',
                        'test-token': 'abcdefg123-test',
                        url: 'https://www.example.com/api/vault/v1'
                    }
                }
            });
            axios.defaults.adapter = function(resolve, reject, config) {
                async.setImmediate(function() {
                    resolve({
                        status: 200,
                        data: {
                            data: {
                                mongodb: {
                                    url: 'mongodb://localhost:27017/my-db'
                                }
                            }
                        }
                    });
                });
            };
            hook.call(mycro, function(err) {
                mycro.dynamo.get.restore();
                delete axios.defaults.adapter;
                expect(err).to.exist;
                done();
            });
        });
    });

    context('(expected successes)', function() {
        it('should make secrets available at mycro.secrets', function(done) {
            let mycro = new Mycro();
            mycro.dynamo = dynamo;
            _.set(mycro, '_config.secrets', {
                configId: 'my-service',
                interval: '30s',
                region: 'us-west-2',
                tableName: 'my-config-table',
                validate: function(joi) {
                    return joi.object({
                        bugsnag: joi.object({
                            'api-key': joi.string().required()
                        }).required(),
                        mongo: joi.object({
                            url: joi.string().required()
                        })
                    }).required();
                }
            });
            sinon.stub(mycro.dynamo, 'get').yieldsAsync(null, {
                Item: {
                    secrets: {
                        '/cubbyhole/my-service': {
                            '/bugsnag': 'bugsnag',
                            '/mongo': 'mongo'
                        }
                    },
                    vault: {
                        token: 'abcdefg123',
                        'test-token': 'abcdefg123-test',
                        url: 'https://www.example.com/api/vault/v1'
                    }
                }
            });
            axios.defaults.adapter = function(resolve, reject, config) {
                let data = {
                    'https://www.example.com/api/vault/v1/cubbyhole/my-service/bugsnag': {
                        'api-key': 'abcdefg123'
                    },
                    'https://www.example.com/api/vault/v1/cubbyhole/my-service/mongo': {
                        url: 'mongodb://localhost:27017/my-db'
                    }
                };
                async.setImmediate(function() {
                    resolve({
                        status: 200,
                        data: {
                            data: data[config.url]
                        }
                    });
                });
            };
            hook.call(mycro, function(err) {
                mycro.dynamo.get.restore();
                delete axios.defaults.adapter;
                expect(err).to.not.exist;
                expect(mycro.secrets).to.be.a('function');
                expect(mycro.secrets()).to.have.all.keys('bugsnag', 'mongo');
                expect(mycro.secrets('bugsnag.api-key')).to.equal('abcdefg123');
                expect(mycro.secrets('mongo.url')).to.equal('mongodb://localhost:27017/my-db');
                done();
            });
        });
    });
});
