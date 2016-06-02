'use strict';

const async = require('async');
const expect = require('chai').expect;
const ms = require('ms');
const Secret = require('../../../lib/service');
const sinon = require('sinon');
const Vault = require('vault-client');
const _ = require('lodash');

describe('[service] secret.fetchSecret()', function() {
    context('(expected failures)', function() {
        it('should fail all attempts to retreive secret fail', function(done) {
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
            sinon.stub(vault, 'get').yieldsAsync({status: 503});
            const timeout = global.setTimeout;
            const clock = sinon.useFakeTimers();
            let err;
            secret.fetchSecret('/secret/foo', '.', function(e) {
                err = e;
            });
            async.eachSeries(_.range(3), function(i, next) {
                tick(timeout, clock, 11, next);
            }, function() {
                const e = _.attempt(function() {
                    expect(err).to.exist;
                    expect(vault.get).to.have.callCount(3);
                });
                done(e);
            });
        });
    });

    context('(expected successes)', function() {
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
            sinon.spy(_, 'extend');
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
                    expect(_.extend).to.have.been.called;
                    expect(_.extend.lastCall.args[1]).to.be.an('object').with.property('bar', 'baz');
                    expect(result).to.be.an('object').with.property('bar', 'baz');
                });
                done(e);
            });
        });

        it('should schedule a renewal if the secret includes a lease_duration greather than 0');
        it('should clear any existing renewal timeout');
    });
});

function tick(timeout, clock, time, cb) {
    timeout.call(global, function() {
        clock.tick(_.isNumber(time) ? time : ms(time));
        timeout.call(global, cb, 0);
    }, 0);
}
