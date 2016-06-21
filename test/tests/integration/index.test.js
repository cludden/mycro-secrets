'use strict';

const async = require('async');
const expect = require('chai').expect;
const hook = require('../../../index');
const joi = require('joi');
const _ = require('lodash');

function Mycro() {
    this.log = function(...args) {
        console.log.apply(console, args.slice(1));
    };
}

describe('integration tests', function() {
    it('test 1', function(done) {
        async.auto({
            add: function(fn) {
                client.post('/secret/foo', {
                    bar: 'baz',
                    ttl: '15m'
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
                                    }
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
                    }
                };
                _.set(mycro, '_config.secrets', config);
                mycro.vault = global.client;
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.not.exist;
                        expect(mycro.services).to.have.property('secret');
                        const secrets = mycro.services.secret.get();
                        expect(secrets).to.be.an('object');
                        expect(secrets).to.have.property('bar', 'baz');
                        expect(secrets).to.have.property('other', 'secret');
                    });
                    fn(e);
                });
            }]
        }, function(err) {
            global.client.delete('/secret/foo', {
                headers: { 'x-vault-token': global.root_token }
            }, function(e) {
                done(err || e);
            });
        });
    });
});
