'use strict';

const async = require('async');
const Vault = require('vault-client');

before(function(done) {
    async.auto({
        vault: function initializeClient(fn) {
            const client = new Vault({
                url: 'http://vault:8200/v1'
            });
            global.client = client;
            fn(null, client);
        },

        ready: ['vault', function waitForVault(fn, r) {
            const vault = r.vault;
            let ready = false;
            async.doUntil(function(next) {
                vault.get('/sys/health?sealedcode=200', {
                    timeout: 1000,
                    validateStatus: function(status) {
                        return status === 200 || status === 500;
                    }
                }, function(err) {
                    if (err) {
                        return next(err);
                    }
                    ready = true;
                    next();
                });
            }, function() {
                return ready;
            }, fn);
        }],

        init: ['ready', function intializeVault(fn, r) {
            const vault = r.vault;
            vault.put('/sys/init', {
                secret_shares: 1,
                secret_threshold: 1
            }, fn);
        }],

        unseal: ['init', function unsealVault(fn, r) {
            const vault = r.vault;
            vault.put('/sys/unseal', {
                key: r.init.keys[0]
            }, fn);
        }],

        userpass: ['unseal', function mountUserpassBackend(fn, r) {
            const vault = r.vault;
            global.root_token = r.init.root_token;
            vault.post('/sys/auth/userpass', {
                type: 'userpass'
            }, {
                headers: { 'x-vault-token': root_token }
            }, fn);
        }],

        user: ['userpass', function createVaultUser(fn, r) {
            const vault = r.vault;
            vault.post('/auth/userpass/users/test', {
                username: 'test',
                password: 'password',
                policies: 'root',
                ttl: 1000 * 60 * 30,
                max_ttl: 1000 * 60 * 30
            }, {
                headers: { 'x-vault-token': root_token }
            }, fn);
        }]
    }, done);
});
