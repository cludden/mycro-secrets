'use strict';

const expect = require('chai').expect;
const Secret = require('../../../lib/service');
const sinon = require('sinon');
const Vault = require('vault-client');
const _ = require('lodash');

describe('[service] fetchSecrets()', function() {
    context('(expected failures)', function() {

        it('should fail if the environment config contains no paths', function(done) {
            const vault = new Vault({ url: 'http://vault:8200/v1'});
            const secret = new Secret(vault, {
                hook: {
                    env: 'test'
                },
                secrets: {
                    secrets: {}
                }
            });
            secret.fetchSecrets(function(err) {
                const e = _.attempt(function() {
                    expect(err).to.be.an('error');
                });
                done(e);
            });
        });

        it('should fail if there is an error retrieving one or more secrets', function(done) {
            const vault = new Vault({ url: 'http://vault:8200/v1'});
            const secret = new Secret(vault, {
                hook: {
                    env: 'production'
                },
                secrets: {
                    secrets: {
                        '/secret/app': '.'
                    }
                }
            });
            sinon.stub(secret, 'fetchSecret').yieldsAsync({ status: 503 });
            secret.fetchSecrets(function(err) {
                const e = _.attempt(function() {
                    expect(err).to.exist;
                    expect(secret.fetchSecret).to.have.callCount(1);
                });
                secret.fetchSecret.restore();
                done(e);
            });
        });

        it('should fail if the retrieved secrets do not pass the validation function', function(done) {
            const vault = new Vault({ url: 'http://vault:8200/v1'});
            const validate = sinon.stub().throws(new Error());
            const secret = new Secret(vault, {
                hook: {
                    env: 'production',
                    validate
                },
                secrets: {
                    secrets: {
                        secrets: {
                            '/secret/app': '.'
                        }
                    }
                }
            });
            sinon.stub(vault, 'get').yieldsAsync(null, {
                lease_duration: 0,
                data: {
                    bar: 'baz'
                }
            });
            sinon.spy(secret, 'fetchSecret');
            secret.fetchSecrets(function(err) {
                const e = _.attempt(function() {
                    expect(err).to.exist;
                    expect(secret.fetchSecret).to.have.callCount(1);
                    expect(validate).to.have.been.called;
                });
                secret.fetchSecret.restore();
                vault.get.restore();
                done(e);
            });
        });
    });

    context('(expected successes)', function() {
        it('should make secrets available at Secret.get()', function(done) {
            const vault = new Vault({ url: 'http://vault:8200/v1'});
            const secret = new Secret(vault, {
                hook: {
                    env: 'production',
                    validate(secrets) {
                        if (secrets.bar !== 'baz') {
                            throw new Error('invalid secrets object');
                        }
                        return secrets;
                    }
                },
                secrets: {
                    secrets: {
                        secrets: {
                            '/secret/app': '.'
                        }
                    }
                }
            });
            sinon.stub(vault, 'get').yieldsAsync(null, {
                lease_duration: 0,
                data: {
                    bar: 'baz'
                }
            });
            sinon.spy(secret, 'fetchSecret');
            secret.fetchSecrets(function(err) {
                const e = _.attempt(function() {
                    expect(err).to.not.exist;
                    expect(secret.fetchSecret).to.have.callCount(1);
                    expect(secret.get()).to.be.an('object').with.property('bar', 'baz');
                });
                secret.fetchSecret.restore();
                vault.get.restore();
                done(e);
            });
        });

        it('should not allow secrets to be overridden', function(done) {
            const vault = new Vault({ url: 'http://vault:8200/v1'});
            const secret = new Secret(vault, {
                hook: {
                    env: 'production',
                    validate(secrets) {
                        if (secrets.bar !== 'baz') {
                            throw new Error('invalid secrets object');
                        }
                        return secrets;
                    }
                },
                secrets: {
                    secrets: {
                        secrets: {
                            '/secret/app': '.'
                        }
                    }
                }
            });
            sinon.stub(vault, 'get').yieldsAsync(null, {
                lease_duration: 0,
                data: {
                    bar: 'baz'
                }
            });
            sinon.spy(secret, 'fetchSecret');
            secret.fetchSecrets(function(err) {
                const e = _.attempt(function() {
                    expect(err).to.not.exist;
                    expect(secret.fetchSecret).to.have.callCount(1);
                    const secrets = secret.get();
                    _.extend(secrets, {bar: 'foo'});
                    expect(secret.get('bar')).to.equal('baz');
                });
                secret.fetchSecret.restore();
                vault.get.restore();
                done(e);
            });
        });
    });
});
