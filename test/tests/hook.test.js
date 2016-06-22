'use strict';

const async = require('async');
const expect = require('chai').expect;
const hook = require('../../lib');
const joi = require('joi');
const sinon = require('sinon');
const _ = require('lodash');

function Mycro() {
    this._config = {};
    this.log = function() {};
}

describe('basic tests', function() {

    context('(expected failures)', function() {

        it('should fail if the hook config is invalid', function(done) {
            const tests = [{
                desc: `missing 'config' function`,
                config: {
                    log: _.noop,
                    validate: function(secrets) {
                        return secrets;
                    }
                }
            }, {
                desc: `missing 'validate' function`,
                config: {
                    config: sinon.stub().yieldsAsync(),
                    log: _.noop
                }
            }];

            async.each(tests, function(test, next) {
                const mycro = new Mycro();
                _.merge(mycro._config, { secrets: test.config });
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.exist;
                    });
                    next(e);
                });
            }, done);
        });

        it('should fail if the config function returns an invalid secrets config', function(done) {
            const tests = [{
                envs: {}
            }, {
                envs: {
                    production: {
                        auth: {
                            options: {
                                username: 'bob',
                                password: 'smith'
                            }
                        }
                    }
                }
            },{
                vault: {
                    url: 'https://vault.example.com'
                }
            }].map(function(config) {
                return {
                    config: {
                        config: function(mycro, cb) {
                            setTimeout(function() {
                                cb(null, config);
                            }, 0);
                        },
                        validate: _.noop
                    }
                };
            });

            async.eachSeries(tests, function(test, next) {
                const mycro = new Mycro();
                sinon.spy(joi, 'validate');
                _.merge(mycro._config, { secrets: test.config });
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.exist;
                        expect(joi.validate).to.have.callCount(2);
                    });
                    joi.validate.restore();
                    next(e);
                });
            }, done);
        });

        it('should fail if the vault client is unable to authenticate', function(done) {
            const mycro = new Mycro();
            _.set(mycro._config, 'secrets', {
                config: function(mycro, cb) {
                    async.setImmediate(function() {
                        cb(null, {
                            auth: {
                                backend: 'userpass',
                                options: {
                                    username: 'test',
                                    password: 'password'
                                },
                                renew_interval: '15m',
                                retry: {
                                    forever: true,
                                    maxTimeout: 1000 * 60
                                }
                            },
                            secrets: {
                                '/secrets/foo': '.'
                            },
                            vault: {
                                url: 'http://vault:8200/v1'
                            }
                        });
                    });
                },
                log: _.noop,
                retry: {
                    forever: true,
                    minTimeout: 1000 * 60,
                    maxTimeout: 1000 * 60 * 15
                },
                validate: function(secrets) {
                    return secrets;
                }
            });
            mycro.vault = {
                login: sinon.stub().yieldsAsync(new Error('something unexpected'))
            };
            hook.call(mycro, function(err) {
                const e = _.attempt(function() {
                    expect(err).to.exist;
                    expect(mycro.vault.login).to.have.been.called;
                });
                done(e);
            });
        });
    });
});
