# mycro-secrets
a [vault](https://github.com/hashicorp/vault) hook for [mycro](https://github.com/cludden/mycro) apps.


## Install
Install the hook
```bash
npm install --save mycro-secrets
```

Add it to hook config before any other hooks
```javascript
// in config/hooks.js
module.exports = [
    'mycro-secrets',
    // ..
]
```


## Background
Most applications require secrets (sensitive data like credentials, api keys, tokens, etc) to interact with other services, databases, and third party apis. Most applications resort to environment variables for storing this sensitive data, but environment variables can become hard to manage and update. [Vault](https://github.com/hashicorp/vault) has proven to be a very elegant tool for managing these secrets. This hook aims to abstract away the logic involved in fetching and renewing secrets and provide a simple and declarative api for specifying the required secrets that an app requires before starting.


## Getting Started
1. define your hook config

    ```javascript
    // in config/secrets.js
    const joi = require('joi');

    module.exports = {
        // define a function for retrieving our 'secrets' config
        config(mycro, cb) {
            // fetch your secrets config here
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

2. define a secrets configuration somewhere (dynamo, s3, etc), and pass it to the hook

    ```json
    {
        "envs": {
            "production": {
                "auth": {
                    "backend": "userpass",
                    "options": {
                        "username": "my-app",
                        "password": "my-password"
                    },
                    "retry": {
                        "forever": true,
                        "factor": 2,
                        "minTimeout": 100,
                        "maxTimeout": 900000
                    }
                },
                "secrets": {
                    "/secrets/my-app/production": {
                        "/bugsnag": "bugsnag",
                        "/mongo": "mongo"
                    }
                }
            },
            "development": {
                "auth": {
                    "backend": "userpass",
                    "options": {
                        "username": "my-app_dev",
                        "password": "my-password_dev"
                    },
                    "retry": {
                        "forever": true,
                        "factor": 2,
                        "minTimeout": 100,
                        "maxTimeout": 900000
                    }
                },
                "secrets": {
                    "/secrets/my-app/dev": {
                        "/bugsnag": "bugsnag",
                        "/mongo": "mongo"
                    }
                },
            }
        },
        "vault": {
            "url": "http://vault:8200/v1"
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

    ```javascript
    console.log(mycro.secrets('mongo'))
    // {
    //     "host": "localhost",
    //     "username": "<username>",
    //     "password": "<password"
    // }
    ```

## API
#### DynamoDB
Secret configurations are stored in DynamoDB. The table definition must have a hash key with
name `id` and type `string`. The config items follow the schema outlined below:

```javascript
{
    // the id of the config object
    "id": "<config-id>",

    // a map of secret urls to request from vault
    // note: a multi level map will be flattened and
    // concatenated with the vault url specified below
    "secrets": {
        "/cubbhole": {
            "/common": "common",
            "/my-service": {
                "/bugsnag": "bugsnag"
            }
        }
    },

    "vault": {
        // OPTIONAL vault token to use in production
        // note: if a VAULT_TOKEN environment variable is found, it will be used instead
        "token": "<x-vault-token>",

        // OPTIONAL vault token to use during tests
        // note: if a VAULT_TOKEN_TEST environment variable is found, it will be used instead
        "test-token": "<x-vault-token>",

        // the vault server endpoint
        "url": "https://www.example.com/api/vault/v1"
    }
}
```

Using the config above, this hook will make the following requests from vault:
- `GET https://www.example.com/api/vault/v1/cubbyhole/common`
  - the returned secret will be available at `mycro.secrets('common')`
- `GET https://www.example.com/api/vault/v1/cubbyhole/my-service/bugsnag`
  - the returned secret will be available at `mycro.secrets('bugsnag')`

#### Hook Config
This hook can be configured by defining a configuration file at `config/secrets.js`. The structure of this file is outlined below:

```javascript
// in config/secrets.js
module.exports = {
    // the number of times to attempt to retreive each secret from vault.
    // if falsey, it will retry indefinitely (default)
    attempts: 3,

    // the id of the config object to request from DynamoDB
    configId: 'my-service',

    // how long to wait in between attempts
    interval: '30s', // can also be an integer representing milliseconds to wait

    // the dynamodb region to request from
    region: 'us-west-2',

    // the name of the dynamodb table holding config items`
    tableName: 'my-config-table',

    // a validation function that should return a joi schema that will be
    // used to validate the fetched secrets
    validate: function(joi) {
        return joi.object({
            // ...
        }).required()
    }
}
```

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
