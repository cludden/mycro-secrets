'use strict';

const async = require('async');
const expect = require('chai').expect;
const hook = require('../../../index');
const joi = require('joi');
const moment = require('moment');
const sinon = require('sinon');
const _ = require('lodash');

function Mycro() {
    this.log = function(...args) {
        console.log.apply(console, args);
    };
}

describe('integration tests', function() {
    it('test 1', function(done) {
        const timeout = global.setTimeout;
        let clock;
        sinon.spy(global.client, 'login');
        sinon.spy(global.client, 'get');
        async.auto({
            add: function(fn) {
                client.post('/secret/foo', {
                    bar: 'baz',
                    ttl: '20m'
                }, {
                    headers: { 'x-vault-token': global.root_token }
                }, fn);
            },

            hook: ['add', function(fn) {
                const mycro = new Mycro();
                const config = {
                    config(mycro, cb) {
                        setTimeout(function() {
                            cb(null, {
                                auth: {
                                    backend: 'userpass',
                                    options: {
                                        username: 'test',
                                        password: 'password'
                                    },
                                    renew_interval: '15m'
                                },
                                secrets: {
                                    '/secret/foo': '.'
                                },
                                vault: {
                                    url: 'http://vault:8200/v1'
                                }
                            });
                        }, 0);
                    },

                    log(...args) {
                        mycro.log.apply(mycro, ['info'].concat(args));
                    },

                    retry: {
                        retries: 2,
                        minTimeout: 100,
                        maxTimeout: 10000,
                        factor: 2
                    },

                    validate(secrets, cb) {
                        const schema = joi.object({
                            bar: joi.string().required(),
                            other: joi.string().default('secret')
                        }).required();
                        joi.validate(secrets, schema, {
                            allowUnknown: true
                        }, cb);
                    },

                    vault() {
                        return global.client;
                    }
                };
                _.set(mycro, '_config.secrets', config);
                clock = sinon.useFakeTimers();
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.not.exist;
                        expect(global.client.login).to.have.been.called;
                        expect(global.client.get).to.have.callCount(1);
                        expect(mycro.services).to.have.property('secret');
                        const secrets = mycro.services.secret.get();
                        expect(secrets).to.be.an('object');
                        expect(secrets).to.have.property('bar', 'baz');
                        expect(secrets).to.have.property('other', 'secret');
                    });
                    fn(e);
                });
                clock.tick(10);
            }],

            timetravel: ['hook', function(fn) {
                async.eachSeries([16, 5], function(m, next) {
                    clock.tick(moment.duration(m, 'minutes').asMilliseconds());
                    timeout.call(global, next, 100);
                }, function() {
                    const e = _.attempt(function() {
                        expect(global.client.login).to.have.callCount(2);
                        expect(global.client.get).to.have.callCount(2);
                    });
                    fn(e);
                });
            }]
        }, function(err) {
            global.client.login.restore();
            global.client.get.restore();
            clock.restore();
            global.client.delete('/secret/foo', {}, {
                headers: { 'x-vault-token': global.root_token }
            }, function(e) {
                done(err || e);
            });
        });
    });
});
