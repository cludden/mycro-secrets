'use strict';

const async = require('async');
const expect = require('chai').expect;
const hook = require('../../../index');
const joi = require('joi');
const _ = require('lodash');

function Mycro() {
    this.log = function(...args) {
        console.log.apply(console, args);
    };
}

describe('integration tests', function() {
    it('test 1', function(done) {
        async.auto({
            add: function(fn) {
                client.post('/secret/foo', {
                    bar: 'baz'
                }, {
                    headers: { 'x-vault-token': global.root_token }
                }, fn);
            },

            hook: ['add', function(fn) {
                const mycro = new Mycro();
                const config = {
                    config() {
                        return {
                            auth: {
                                backend: 'userpass',
                                options: {
                                    username: 'test',
                                    password: 'password'
                                }
                            },
                            secrets: {
                                '/foo': '.'
                            },
                            vault: {
                                url: 'http://vault:8200/v1'
                            }
                        };
                    },

                    log(...args) {
                        console.log.apply(console, args);
                        mycro.log.apply(mycro, ['info'].concat(args));
                    },

                    retry: {
                        forever: true,
                        minTimeout: 100,
                        maxTimeout: 10000,
                        factor: 2
                    },

                    validate(secrets, cb) {
                        const schema = joi.object({
                            bar: joi.string().required(),
                            other: joi.string().default('secret')
                        }).required();
                        joi.validate(secrets, schema, cb);
                    },

                    vault: global.client
                };
                _.set(mycro, '_config.secrets', config);
                global.client.client.interceptors.response.use(function(res) {
                    console.log(res.config.method, res.config.url, res.status, res.data);
                    return res;
                }, function(res) {
                    console.log(res.config.method, res.config.url, res.status, res.data);
                    return res;
                });
                hook.call(mycro, function(err) {
                    const e = _.attempt(function() {
                        expect(err).to.not.exist;
                    });
                    fn(e);
                });
            }]
        }, function(err) {
            global.client.delete('/secret/foo', {}, {
                headers: { 'x-vault-token': global.root_token }
            }, function(e) {
                done(err || e);
            });
        });
    });
});
