'use strict';

const ms = require('ms');
const _ = require('lodash');

module.exports = {
    tick(timeout, clock, time, cb) {
        timeout.call(global, function() {
            clock.tick(_.isNumber(time) ? time : ms(time));
            timeout.call(global, cb, 0);
        }, 0);
    }
};
