'use strict';

module.exports = function(grunt){
    grunt.initConfig({
        mocha_istanbul: {
            coverage: {
                src: ['test/index.test.js'],
                options: {
                    coverageFolder: 'coverage',
                    mask: '**/*.test.js',
                }
            },
            partial: {
                src: ['test/tests/bootstrap.test.js']
            }
        }
    });

    grunt.loadNpmTasks('grunt-mocha-istanbul');

    grunt.registerTask('coverage', ['mocha_istanbul:coverage']);
};
