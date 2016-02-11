# mycro-secrets
a [vault](https://github.com/hashicorp/vault) hook for [mycro](https://github.com/cludden/mycro) apps.


## Install
```bash
npm install --save mycro-secrets
```


## Background
Most applications require secrets (sensitive data like passwords, api keys, tokens, etc) to interact with other services, databases, and third party apis. Most applications resort to environment variables for storing this sensitive data, but environment variables can become hard to manage and update. [Vault](https://github.com/hashicorp/vault) has proven to be a very elegant tool for managing these secrets. However, the use for environment variables in development and testing environments still seems reasonable. This hook aims to abstract away the logic involved in fetching secrets and provide a simple and declarative api for specifying the required secrets that an app requires before starting.


## Process
This basic process performed by this hook is described below:
1. Attempt to satisfy the secret requirements using environment variables
2. If the requirements can not be satisfied by environment variables alone, attempt to contact the vault server repeatedly (using linear, exponential, or no backoff between subsequent attempts)


## General Usage
Basic:

```javascript
console.log(mycro.secrets());
//  {
//      aws: {
//          accessKeyId: ***,
//          secretAccessKey: ***,
//          s3: {
//              bucket: ***,
//              region: ***
//          }
//      },
//      bugsnag: {
//          api-key: ***
//      },
//      mongo: {
//          database: ***,
//          host: ***,
//          password: ***,
//          port: ***,
//          username: ***
//      }
//  }
```

In configuration files:

```javascript
// in config/connections.js

module.exports = function(mycro) {
    mongo: {
        adapter: mongooseAdapter,
        config: mycro.secrets('mongo')
    }
};
```
In services:

```javascript
// in app/services/error.js

var bugsnag = require('bugsnag');

module.exports = function(mycro) {
    bugsnag.register(mycro.secrets('bugsnag.api-key'));
    return bugsnag;
};
```


## Getting Started
###### Prereqs
This hook assumes that you have access to a vault server/cluster. If you don't, take a look at the [vault](https://github.com/hashicorp/vault) docs and [this tutorial](https://gist.github.com/cludden/12ef62dad35aff69e5bb) for setting up a vault server on AWS.


In non production environments, environment variables can be used. These must be set prior to starting the application. In production environments, or environments that you wish to use vault, this hook requires a vault url and vault token with access to all of the secrets required by the application. By default, this hook will look for a `VAULT_URL` and `VAULT_TOKEN` environment variable. You can override this behavior by defining a `fetchVaultInfo` function in your config file. More on this later.

###### Outline
1. First things first, include this hook in your `hooks` config file

```javascript
// in config/hooks.js

module.exports [
    // ..
    'mycro-secrets',
    // ..
];
```

2. Next, define a `secrets` config file

```javascript
// in config/secrets.js

module.exports = {
 // ..
}
```


## Config API
Your `config/secrets.js` file must export a config object or function that returns a config object. The config object has the following API.



---
**backoff**  
`@type {object}`  

An object defining the interval settings for contacting vault. By default, the interval will increase at a rate of 2x. You can override this by defining a `step` key, which will be added to the interval after each failed attempt.

**Example**

```javascript
module.exports = {
    // ..
    backoff: {
        first: '30s', // (default) wait 30 seconds before contacting vault after the first failed attempt
        max: '10m', // (default) don't wait more than 10 minutes between attempts
        step: '30s' // add 30 seconds to the wait time after each failed attempt
    }
    // ..
};
```

---
**env**  
`@type {function|object}`

A `secrets` map that this hook will use to try and satisfy the secrets requirements using environment variables. Each key represents an environment variable, while each value represents the path to set on the `secrets` object. If the necessary environment variables are available, this hook will forego requesting any additional info from vault.


**Example**

```javascript
module.exports = {
    // ..
    env: {
        'AWS_ACCESS_KEY_ID': 'aws.accessKeyId',
        'AWS_SECRET_ACCESS_KEY': 'aws.secretAccessKey',
        'BUCKET': 'aws.s3.bucket',
        'BUGSNAG_API_KEY': 'bugsnag.api-key',
        'MONGO_DB': 'mongo.database',
        'MONGO_HOST': 'mongo.host',
        'MONGO_PASSWORD': 'mongo.password',
        'MONGO_PORT': 'mongo.port',
        'MONGO_URL': 'mongo.url',
        'MONGO_USERNAME': 'mongo.username',
        'NODE_ENV': 'env',
        'REGION': 'aws.s3.region'
    }
    // ..
};
```
**Note** The `env` key can also be defined as a function that returns a map object. This allows you to define custom environment variables based on runtime conditions.

---
**fetchVaultInfo**  
`@type {function}`

An asynchronous function that can be used in place of the `VAULT_URL` and `VAULT_TOKEN` environment variables. This function should return an object with a `url`, `token`, and optional `prefix` attribute.


**Example**

```javascript
module.exports = function(mycro) {
    return {
        // ..
        fetchVaultInfo: function(done) {
            if (['production', 'staging'].indexOf(process.env.NODE_ENV) === -1) {
                return done(null, {
                    token: process.env.VAULT_TOKEN
                    url: process.env.VAULT_URL,
                    headers: {
                        // optional additional headers to send with vault requests
                    }
                });
            }
            // do something asynchronous here to receive vault info
            done(null, info);
        }
        // ..
    };
};
```
---
**validate**  
`@type {array|function}`  *required*  

The `validate` key provides a function that returns a [Joi](https://github.com/hapijs/joi) schema and an optional validation options. This schema will be used to define the *secrets* requirements for the application. Secrets can be accessed via `mycro.secrets(<path/to/secret>)`.


**Example**


Let's say that your application requires a [bugsnag](https://bugsnag.com) api key, mongodb credentials, and an S3 bucket in all environments. The mongodb credentials must provide a `username` and `password` attribute, as well as a `host` attribute *or* an `url` attribute. If a `host` attribute is provided, it must be accompanied by a `database` attribute. A `port` attribute can be specified, otherwise it should default to 27017. Additionally, in `development` and `test` environments, AWS credentials are required. In production, they are optional, as we intent to use ec2 instance roles in lieu of hard credentials.


The above requirements could be specified via the following `validate` key:

```javascript
module.exports = {
    // ..
    validate: function(joi) {
        return joi.object({
            aws: joi.object({
                accessKeyId: joi.when('$env', {
                    is: joi.string().valid('development', 'test'),
                    then: joi.string().required(),
                    otherwise: joi.string()
                }),
                secretAccessKey: joi.when('$env', {
                    is: joi.string().valid('development', 'test'),
                    then: joi.string().required(),
                    otherwise: joi.string()
                }),
                s3: joi.object({
                    bucket: joi.string().required(),
                    region: joi.string().default('us-west-2')
                }).required()
            }).required(),
            bugsnag: joi.object({
                'api-key': joi.string().required()
            }).required(),
            mongo: joi.object({
                database: joi.string(),
                host: joi.string(),
                password: joi.string().required(),
                port: joi.number().integer().default(27017),
                url: joi.string(),
                username: joi.string().required()
            }).or('host', 'url').with('host', 'database').required()
        });
    }
    // ..
};
```
**Note** The `validate` key can also be defined as an array in the format of [validateFunction, validateOptions]

---
**vault**  
`@type {function|object|string}` *required*  
A `secrets` map that this hook will use to try and satisfy the secrets requirements using vault paths. Each key in the map represents a vault secret, and each value represents the path to set in the final `secrets` object. In the following example, the hook will issue GET requests for the following secrets from vault.

 - `{VAULT_URL}/[{VAULT_PREFIX}/]my-service/aws`
 - `{VAULT_URL}/[{VAULT_PREFIX}/]my-service/mongo}`
 - `{VAULT_URL}/{[{VAULT_PREFIX}/]my-service/s3`

If any of the requests fail, this hook will continue attempting to contact vault at increasing intervals until a successful response is received. The reason for this is because, in the event that the vault service is down, you can focus on bringing it back online, and not have to worry about restarting all dependent services afterwards.


**Example**

```javascript
module.exports = {
    // ..
    vault: {
        '/my-service/aws': 'aws',
        '/my-service/bugsnag': 'bugnsag',
        '/my-service/mongo': 'mongo',
        '/my-service/s3': 'aws.s3'
    }
    // ..
};
```
**Note** The `env` key can also be defined as a function that returns a map object. This allows you to define custom environment variables based on runtime conditions.


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
