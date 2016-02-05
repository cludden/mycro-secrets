/* jshint expr:true */
'use strict';

var axios = require('axios'),
    chai = require('chai'),
    expect = chai.expect,
    ms = require('ms'),
    Mycro = require('mycro'),
    sinon = require('sinon'),
    supertest = require('supertest'),
    _ = require('lodash');

describe('config: a', function() {
    let mycro, originalEnv;

    // define required environment variables
    let required = {
        'AWS_ACCESS_KEY_ID': ['abc123', 'aws.accessKeyId'],
        'AWS_SECRET_ACCESS_KEY': ['def456', 'aws.secretAccessKey'],
        'BUCKET': ['sample-bucket', 'aws.s3.bucket'],
        'BUGSNAG_API_KEY': ['bugsnag8888', 'bugsnag.api-key'],
        'MONGO_DB': ['sample-db', 'mongo.database'],
        'MONGO_HOST': ['localhost', 'mongo.host'],
        'MONGO_PASSWORD': ['2340909348', 'mongo.password'],
        'MONGO_PORT': ['27017', 27017, 'mongo.port'],
        'MONGO_USERNAME': ['sample-user', 'mongo.username'],
        'REGION': ['us-east-1', 'aws.s3.region']
    };

    // store the original environment
    before(function() {
        originalEnv = _.clone(process.env);
    });

    // reset the environment
    after(function() {
        process.env = originalEnv;
    });


    describe('all required environment variables present', function() {
        let mycro, request;

        before(function(done) {
            // define environment variables
            let newEnv = _.transform(required, function(memo, value, key) {
                memo[key] = value[0];
            }, {});
            _.extend(process.env, newEnv);

            mycro = new Mycro();
            mycro._config.secrets = require('../configs/a');
            mycro.start(function(err) {
                request = supertest.agent(mycro.server);
                done(err);
            });
        });

        it('the app should start successfully', function(done) {
            request.get('/healthy')
                .expect(200)
                .end(done);
        });

        _.each(required, function(value, key) {
            it('should correctly set path `' + _.last(value) + '` with variable `' + key + '`', function() {
                expect(mycro.secrets(_.last(value))).to.equal(value.length === 3 ? value[1] : value[0]);
            });
        });
    });

    describe('some required environment variables missing', function() {

        describe('missing vault info', function() {
            let mycro;

            it('should fail to start', function(done) {
                // define partial environment variables
                let newEnv = _.omit(_.transform(required, function(memo, value, key) {
                    delete process.env[key];
                    memo[key] = value[0];
                }, {}), 'MONGO_HOST');
                _.extend(process.env, newEnv);

                mycro = new Mycro();
                mycro._config.secrets = require('../configs/a');
                mycro.start(function(err) {
                    expect(err).to.exist;
                    done();
                });
            });

        });

        describe('vault not available', function() {
            let count = 0, mycro;

            before(function(done) {
                this.clock = sinon.clock.create();

                // define partial environment variables
                let newEnv = _.omit(_.transform(required, function(memo, value, key) {
                    delete process.env[key];
                    memo[key] = value[0];
                }, {}), 'MONGO_HOST');
                newEnv.VAULT_URL = 'https://api.example.com';
                newEnv.VAULT_TOKEN = 'super-secret-vault-token';
                newEnv.VAULT_PREFIX = '/vault';
                _.extend(process.env, newEnv);

                // define custom adapter to intercept vault requests and fail
                axios.defaults.adapter = function(resolve, reject, config) {
                    count++;
                    reject({
                        data: {
                            error: new Error('Something unexpected')
                        },
                        status: 500,
                        statusText: 'Server Error',
                        config: config
                    });
                };

                mycro = new Mycro();
                mycro._config.secrets = require('../configs/a');
                mycro._config.secrets.__clock = this.clock;
                mycro.start();
                setTimeout(done, 40);
            });

            after(function() {
                delete axios.defaults.adapter;
            });

            it('should attempt to contact vault 2 times in 35 seconds', function(done) {
                this.timeout(ms('10s'));
                this.clock.tick(ms('35s'));
                setTimeout(() => {
                    expect(count).to.equal(8);
                    done();
                }, 50);
            });
        });

        describe('vault available', function() {
            this.timeout(ms('2s'));
            let mycro, request;

            before(function(done) {
                // clear environment
                _.keys(required).forEach(function(variable) {
                    delete process.env[variable];
                });
                process.env.VAULT_URL = 'https://api.example.com';
                process.env.VAULT_TOKEN = 'super-secret-vault-token';
                process.env.VAULT_PREFIX = '/vault';
                process.env.NODE_ENV = 'production';

                // define custom adapter to intercept vault requests and fail
                axios.defaults.adapter = function(resolve, reject, config) {
                    let secrets = {
                        bugsnag: {
                            'api-key': 'bugsnag8888'
                        },
                        mongo: {
                            database: 'sample-db',
                            host: 'localhost',
                            password: '2340909348',
                            username: 'sample-user'
                        },
                        s3: {
                            bucket: 'sample-bucket',
                            region: 'us-east-1'
                        }
                    };
                    let data;
                    if (/^.+\/bugsnag$/.test(config.url.url)) {
                        data = secrets.bugsnag;
                    }
                    if (/^.+\/mongo$/.test(config.url.url)) {
                        data = secrets.mongo;
                    }
                    if (/^.+\/s3$/.test(config.url.url)) {
                        data = secrets.s3;
                    }
                    if (data) {
                        resolve({
                            data: {data: data},
                            status: 200,
                            statusText: 'OK',
                            config: config
                        });
                    } else {
                        reject({
                            data: {},
                            status: 404,
                            statusText: 'Not Found',
                            config: config
                        });
                    }
                };

                mycro = new Mycro();
                mycro._config.secrets = require('../configs/a');
                mycro.start(function(err) {
                    request = supertest.agent(mycro.server);
                    done(err);
                });
            });

            after(function() {
                delete axios.defaults.adapter;
            });

            it('the app should start successfully', function(done) {
                request.get('/healthy')
                    .expect(200)
                    .end(done);
            });

            _.each(required, function(value, key) {
                if (key !== 'AWS_ACCESS_KEY_ID' && key !== 'AWS_SECRET_ACCESS_KEY') {
                    it('should correctly set path `' + _.last(value) + '` with variable `' + key + '`', function() {
                        expect(mycro.secrets(_.last(value))).to.equal(value.length === 3 ? value[1] : value[0]);
                    });
                }
            });
        });
    });
});
