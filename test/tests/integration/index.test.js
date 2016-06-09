'use strict';

const async = require('async');
const expect = require('chai').expect;

function Mycro() {
    this._config = {};
    this.log = function() {};
}

describe('integration tests', function() {
    it('test 1', function(done) {
        var getConfig = function(cb) {
            setTimeout(function() {
                return {
                    envs: {
                        production: {
                            auth: {
                                backend: 'userpass',
                                options: {
                                    username: 'test',
                                    password: 'password'
                                }
                            }
                        }
                    }
                };
            }, 0);
        };
        mycro._config.secrets - {
            config(mycro, cb) {

            }
        };
    });
});
