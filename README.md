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
Most applications require secrets (sensitive data like passwords, api keys, tokens, etc) to interact with other services, databases, and third party apis. Most applications resort to environment variables for storing this sensitive data, but environment variables can become hard to manage and update. [Vault](https://github.com/hashicorp/vault) has proven to be a very elegant tool for managing these secrets. This hook aims to abstract away the logic involved in fetching secrets and provide a simple and declarative api for specifying the required secrets that an app requires before starting.


## Process
This basic process performed by this hook is described below:
1. Request secret config from DynamoDB
2. Ensure we understand the config document
3. Contact vault for all secrets specified in the config document
4. Validate our secrets object after all requests have been fulfilled successfully
5. Make secrets available at `mycro.secrets()`


## General Usage
1. define a config table in DynamoDB with hash key of type `string` with name `id`
2. create an item containing the config for your app

```javascript
{
    "id": "my-app-name",
    "secrets": {
        "/cubbyhole/my-app-name": {
            "/bugsnag": "bugsnag",
            "/mongo": "mongo",
            "/redis": "redis"
        }
    },
    "vault": {
        "token": "<x-vault-token>",
        "test-token": "<x-vault-token>",
        "url": "https://www.example.com/api/vault/v1"
    }
}
```
3. define a hook config file

```javascript
// in config/secrets.js
module.exports = {
    attempts: 3,
    configId: 'my-app-name',
    interval: '30s',
    region: 'us-west-2',
    tableName: 'my-config-table',
    validate: function(joi) {
        return joi.object({
            bugsnag: joi.object({
                'api-key': joi.string().required()
            }).required(),
            mongo: joi.object({
                url: joi.string().required()
            }).required(),
            redis: joi.object({
                host: joi.string().required(),
                port: joi.number().integer().default(6379),
                db: joi.number().integer().default(0)
            }).required()
        }).required()
    }
}
```
4. use your secrets

```javascript
mycro.secrets();
// {
//      "bugsnag": {
//          "api-key": "SKHEOICH2390gvewohEIHCOEH"
//      },
//      "mongo": {
//          "url": "mongodb://admin:password@mongourl:27017/my-db"
//      },
//      "redis": {
//          "host": "redishost",
//          "port": 6379,
//          "db": 0
//      }
// }

mycro.secrets('bugsnag.api-key');
// SKHEOICH2390gvewohEIHCOEH
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
