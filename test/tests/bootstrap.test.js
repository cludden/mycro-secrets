'use strict';

var chai = require('chai'),
    sinonchai = require('sinon-chai');

chai.use(sinonchai);

let originalCwd;

before(function() {
    // change dir into dummy app
    originalCwd = process.cwd();
    process.chdir(__dirname + '/../app');
});

after(function() {
    process.chdir(originalCwd);
});
