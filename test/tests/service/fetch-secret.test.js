'use strict';

const async = require('async');
const expect = require('chai').expect;
const ms = require('ms');
const Secret = require('../../../lib/service');
const sinon = require('sinon');
const Vault = require('vault-client');
const _ = require('lodash');

describe('[service] secret.fetchSecret()', function() {

    it('should fail if all attempts to retreive secret fail', function(done) {
        const vault = new Vault({ url: 'http://vault:8200/v1' });
        const secret = new Secret(vault, {
            hook: {
                retry: {
                    retries: 2,
                    minTimeout: ms('1m'),
                    factor: 1,
                    maxTimeout: ms('1m')
                },
                log(...args) {
                    console.error.apply(console, args);
                }
            }
        });
        sinon.stub(vault, 'get').yieldsAsync({status: 503});
        const timeout = global.setTimeout;
        const clock = sinon.useFakeTimers();
        let err;
        secret.fetchSecret('/secret/foo', '.', function(e) {
            err = e;
        });
        async.eachSeries(_.range(3), function(i, next) {
            tick(timeout, clock, '1.1m', next);
        }, function() {
            const e = _.attempt(function() {
                expect(err).to.exist;
                expect(vault.get).to.have.callCount(3);
            });
            clock.restore();
            vault.get.restore();
            done(e);
        });
    });


    it('should set the secret on the private secret store', function(done) {
        const vault = new Vault({ url: 'http://vault:8200/v1' });
        const secret = new Secret(vault, {
            hook: {
                retry: {
                    retries: 2,
                    minTimeout: 10,
                    factor: 1,
                    maxTimeout: 10
                }
            }
        });
        sinon.stub(vault, 'get').yieldsAsync(null, {
            lease_duration: 0,
            data: {
                bar: 'baz'
            }
        });
        secret.fetchSecret('/secret/foo', '.', function(err, result) {
            const e = _.attempt(function() {
                expect(err).to.not.exist;
                expect(vault.get).to.have.callCount(1);
                expect(result).to.be.an('object').with.property('bar', 'baz');
            });
            vault.get.restore();
            done(e);
        });
    });

    it('should schedule a renewal if the secret includes a lease_duration greather than 0', function(done) {
        const timeout = global.setTimeout;
        const clock = sinon.useFakeTimers();
        const vault = new Vault({ url: 'http://vault:8200/v1' });
        const secret = new Secret(vault, {
            hook: {
                retry: {
                    retries: 2,
                    minTimeout: 10,
                    factor: 1,
                    maxTimeout: 10
                }
            }
        });
        const stub = sinon.stub(vault, 'get');
        stub.onCall(0).yieldsAsync(null, {
            lease_duration: ms('15m') / 1000,
            data: {
                bar: 'baz'
            }
        });
        stub.onCall(1).yieldsAsync(null, {
            lease_duration: 0,
            data: {
                bar: 'foo'
            }
        });

        secret.fetchSecret('/secret/foo', '.', function(err, result) {
            const e = _.attempt(function() {
                expect(err).to.not.exist;
                expect(vault.get).to.have.callCount(1);
                expect(result).to.be.an('object').with.property('bar', 'baz');
                expect(secret.renewals).to.have.property('/secret/foo');
            });
            if (_.isError(e)) {
                clock.restore();
                vault.get.restore();
                _.extend.restore();
                return done(e);
            }
            tick(timeout, clock, '15.1m', function() {
                const e = _.attempt(function() {
                    expect(vault.get).to.have.callCount(2);
                    expect(secret.renewals).to.not.have.property('/secret/foo');
                    expect(secret.get('bar')).to.equal('foo');
                });
                clock.restore();
                vault.get.restore();
                done(e);
            });
        });
    });

    it('should allow multiple secrets to be merged into the same address', function(done) {
        const vault = new Vault({ url: 'http://vault:8200/v1' });
        const secret = new Secret(vault, {
            hook: {
                retry: {
                    retries: 2,
                    minTimeout: 10,
                    factor: 1,
                    maxTimeout: 10
                }
            }
        });
        const stub = sinon.stub(vault, 'get');
        stub.onCall(0).yieldsAsync(null, {
            lease_duration: 0,
            data: {
                this: 'foo'
            }
        });
        stub.onCall(1).yieldsAsync(null, {
            lease_duration: 0,
            data: {
                that: 'bar'
            }
        });
        async.series([
            function(fn) {
                secret.fetchSecret('/secret/this', 'foo', fn);
            },

            function(fn) {
                secret.fetchSecret('/secret/that', 'foo', fn);
            }
        ], function(err) {
            const e = _.attempt(function() {
                expect(err).to.not.exist;
                const secrets = secret.get();
                expect(secrets).to.be.an('object').with.all.keys('foo');
                expect(secrets.foo).to.be.an('object').with.all.keys('this', 'that');
                expect(secrets.foo.this).to.equal('foo');
                expect(secrets.foo.that).to.equal('bar');
            });
            stub.restore();
            done(e);
        });
    });
});

function tick(timeout, clock, time, cb) {
    timeout.call(global, function() {
        clock.tick(_.isNumber(time) ? time : ms(time));
        timeout.call(global, cb, 0);
    }, 0);
}
