# mycro-secrets
a [vault](https://github.com/hashicorp/vault) hook for [mycro](https://github.com/cludden/mycro) apps.


## Install
Install the hook
```bash
npm install --save mycro-secrets
```

Add it to hook configuration
```javascript
// in config/hooks.js
module.exports = [
    // ..
    'mycro-secrets',
    // ..
]
```


## Background
Most applications require secrets (sensitive data like credentials, api keys, tokens, etc) to interact with other services, databases, and third party apis. Many resort to environment variables for storing this sensitive data, but environment variables can become hard to manage and update. [Vault](https://github.com/hashicorp/vault) has proven to be a very elegant tool for managing these secrets. This hook aims to abstract away the logic involved in fetching and renewing secrets and provide a simple and declarative api for specifying the secrets that an app requires before starting.

This hook will export a `secret` service at `mycro.services.secret` as well as define a convenience method (`mycro.getSecret(path)`) for retreiving secrets. The service uses a [vault-client](https://github.com/cludden/vault-client) in the background to handle vault authentication, token renewals, and secret renewals based on `lease_duration`'s received in vault response metadata.


## Getting Started
1. define a secrets configuration somewhere (dynamo, s3, inline, etc), and retrieve it via the `config` method defined in step 2.

    ```json
    {
        "auth": {
            "backend": "userpass",
            "options": {
                "username": "my-app",
                "password": "my-password"
            }
        },
        "secrets": {
            "/secret/my-app/production": {
                "/bugsnag": "bugsnag",
                "/mongo": "mongo"
            }
        },
        "vault": {
            "url": "http://vault:8200/v1"
        }
    }
    ```

2. define your hook config

    ```javascript
    // in config/secrets.js
    const joi = require('joi');

    module.exports = {
        // define a function for retrieving a 'secrets' configuration object
        config(mycro, cb) {
            // fetch your secrets config here.
            cb(null, config);
        },

        // define a validation function to ensure that the secrets we receive
        // from vault include everything we require
        validate(secrets, cb) {
            joi.validate(secrets, joi.object({
                bugsnag: joi.object({
                    apiKey: joi.string().required()
                }),
                mongo: joi.object({
                    host: joi.string().uri().required(),
                    username: joi.string().required(),
                    password: joi.string().required()
                }).required()
            }).required(), cb);
        }
    }
    ```

3. include this hook in your `hooks` config

    ```javascript
    // in config/hooks.js
    module.exports = [
        // ..
        'mycro-secrets',
        // ..
    ];
    ```

4. use your secrets

    - either via the service

    ```javascript
    mycro.services.secret.get('mongo')
    // {
    //     "host": "localhost",
    //     "username": "<username>",
    //     "password": "<password"
    // }
    ```

    - or using the shortcut method

    ```javascript
    mycro.getSecret('mongo')
    // {
    //     "host": "localhost",
    //     "username": "<username>",
    //     "password": "<password"
    // }
    ```

## API
#### Hook Configuration
This hook can be configured by defining a configuration file at `config/secrets.js`. The file should export a configuration object outlined below:
```javascript
module.exports = function(mycro) {
    return {
        /**
         * [REQUIRED] A method for retrieving the 'secrets' configuration object. This allows
         * for different secret configurations based on the current environment, user, etc.
         * @param  {Object} mycro - the mycro application
         * @param  {Function} [cb] - an optional callback. if no callback is provided,
         *                           the method should return a configuration object
         * @return {Object} [config] - see config docs below for more info
         */
        config(mycro, cb) {
            dynamo.get({
                TableName: 'my-config-table',
                Keys: {
                    id: 'my-service-name',
                    env: process.env.NODE_ENV
                }
            }, function(err, data) {
                if (err) {
                    return cb(err);
                }
                const config = data.Item.secrets;
                cb(null, config);
            });
        },


        /**
         * [REQUIRED] method for validating secrets returned by initial fetchSecrets() call
         * @param  {Object} secrets
         * @param  {Function} [cb] - asynchronous method callback, otherwise synchronous
         * @return {Object} validatedSecrets
         */
        validate(secrets, cb) {
            const schema = joi.object({
                foo: joi.object({
                    bar: joi.string().required()
                }).required()
            }).required();
            joi.validate(secrets, schema, cb);
        },


        /**
         * [OPTIONAL] axios request interceptor. See axios docs for more info
         * @param  {Object} config
         * @return {Object} config
         */
        interceptRequest(config) {
            mycro.log('info', `${config.method} ${config.url}`);
        },


        /**
         * [OPTIONAL] axios response interceptors. see axios docs for more info
         * @type {Function[]}
         */
        interceptResponse: [
            function success(res) {
                return res;
            },
            function failure(res) {
                mycro.log('error', `${res.config.method} ${res.config.url} ${res.status}`)
                Promise.reject(res);
            }
        ],


        /**
         * [OPTIONAL] a logging function for hook errors
         * @param  {*} ...args [description]
         */
        log(...args) {
            mycro.log.apply(mycro, ['error'].concat(args));
        },


        /**
         * [OPTIONAL] retry options for vault request failures. see node-retry docs for
         * more info.
         * @type {Object}
         */
        retry: {
            forever: true,
            minTimeout: ms('1s'),
            maxTimeout: ms('15m'),
            factor: 2
        },


        /**
         * [OPTIONAL] a vault-client instance. this can either be the instance itself
         * or a function that receives the mycro application as its sole argument and
         * returns a vault-client. If this attribute is not defined, a vault-client
         * instance will be created by the hook
         * @type {Object|Function}
         */
        vault: mycro.services.vault
    }
}
```

#### Secrets Configuration
A configuration object that instructs the `secret` service how to communicate with `vault` and what secrets it requires.

```js
{
    /**
     * [REQUIRED] Vault authentication config, see vault-client docs for more info.
     * @type {Object}
     */
    auth: {
        backend: 'userpass',
        options: {
            username: "<vault-userpass-username>",
            password: "<vault-userpass-password"
        }
    },

    /**
     * [REQUIRED] a map of vault paths to storage addresses. The following config object
     * would make 4 calls to vault.
     *
     *     "/secret/foo" -> { foo: "bar" }
     *     "/secret/my-service/bugsnag" -> { apiKey: "abc" }
     *     "/secret/my-service/jwt" -> { secret: "def" }
     *     "/secret/my-service/mongodb" -> { user: "bob", pwd: "ghi", host: "localhost" }
     *
     * the resulting secret store would be:
     *
     *     {
     *         bugsnag: {
     *             apiKey: "abc"
     *         },
     *         foo: "bar",
     *         jwt: {
     *             secret: "def"
     *         },
     *         mongo: {
     *             host: "localhost",
     *             pwd: "ghi",
     *             user: "bob"
     *         }
     *     }
     *     
     * @type {Object}
     */
    secrets: {
        '/secret': {
            '/foo': '.',
            '/my-service': {
                '/bugsnag': 'bugsnag',
                '/jwt': 'jwt',
                '/mongodb': 'mongo'
            }
        }
    },

    /**
     * The location of the vault server. If you provide your own vault-client in the
     * hook configuration, this can be excluded.
     * @type {Object}
     */
    vault: {
        url: 'https://vault.example.com/v1'
    }
}
```

#### Service API
This hook exports a `secret` service available at `mycro.services.secret`. The service will first authenticate with vault and then retrieve all secrets defined in the secrets configuration returned by the hook. Vault access tokens will be renewed periodically based on the lease_duration returned from the login call. Any secrets that have a lease_duration greater than 0 will be renewed periodically based on their lease_duration.

##### Service.fetchSecrets(cb)
Fetch all secrets defined in the secrets configuration.

##### Service.fetchSecret(path, address, [cb])
Fetch a single secret at the given `path` and set it on the secret store at the specified `address`. If address is equal to `.`, then the returned data will be merged directly with the secret store.

##### Service.get([path])
Retrieve a branch of the secret store. If path is omitted, the entire secret store is returned.


## Testing
Run the test suite:
```bash
npm test
```

Run coverage:
```bash
grunt coverage
```


## Contributing
1. [Fork it](https://github.com/cludden/mycro-secrets/fork)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request


## License
Copyright (c) 2016 Chris Ludden.
Licensed under the [MIT license](LICENSE.md).
