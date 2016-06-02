'use strict';

const async = require('async');
const chai = require('chai');
const hook = require('../../lib');
const sinon = require('sinon');
const sinonchai = require('sinon-chai');
const _ = require('lodash');

chai.use(sinonchai);
const expect = chai.expect;

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
            const tests = [];

            async.each(tests, function(test, next) {
                const mycro = new Mycro();
                _.merge(mycro._config, { secrets: test.config });
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.exist;
                        expect(test.config.config).to.have.been.called;
                    });
                    next(e);
                });
            }, done);
        });

        it('should fail if the vault client is unable to authenticate', function(done) {
            const mycro = new Mycro();
            mycro.vault = {
                login: sinon.stub().yieldsAsync(new Error('something unexpected'))
            };
            _.set(mycro._config, 'secrets', {
                config: function(mycro, cb) {
                    async.setImmediate(function() {
                        cb(null, {
                            envs: {
                                production: {
                                    auth: {
                                        backend: 'userpass',
                                        options: {
                                            username: 'test',
                                            password: 'passwor'
                                        },
                                        renew_interval: '15m',
                                        retry: {
                                            forever: true,
                                            maxTimeout: 1000 * 60
                                        }
                                    },
                                    secrets: {
                                        '/secrets/foo': '.'
                                    }
                                }
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
