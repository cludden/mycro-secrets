'use strict';

const async = require('async');
const expect = require('chai').expect;
const

describe('[service] fetchSecrets()', function() {
    context('(expected failures)', function() {
        it('should fail if no config is found for the specified environment');
        it('should fail if there is an error retrieving one or more secrets');
        it('should fail if the retrieved secrets do not pass the validation function');
    });

    context('(expected successes)', function() {
        it('should make secrets available at Secret.get()');
        it('should not allow secrets to be overridden');
        it('should schedule renewal for all secrets that include a lease_duration');
    });
});
