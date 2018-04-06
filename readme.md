# loopback-amqp-backend
Module to process request received and response sent back through AMQP to Loopback.
This module also broadcasts every changes made to a Model instance to the AMQP exchange.

## Settings
Connectors settings through datasources.json:
```json
"sourcename": {
    "name": "sourcename",
    "connector": "amqp",
    "host": "127.0.0.1",
    "port": "5672",
    "login": "user",
    "password": "password",
    "exchange": "loopback",
    "binding" : "loopback",
    "queue": "loopack"
}
```
- `name` is the sourcename of the datasource, use this name in the `model-config.json` file.
- `connector` should be `"amqp"` as the node module is called `loopback-connector-amqp`
- `host` (default: `127.0.0.1`) and `port` (default: `5672`) of your AMQP server
- `login` and `password` to connect to your AMQP server (default is empty)
- `exchange` name of the AMQP exchange to use (default: `loopback`). If the exchange doesn't exist, it will be created.
- `queue` prefix to use to name the queue (default: `loopback`). Should create `<queue>-static` and `<queue>-instance`.
- `binding` prefix binding to use for registering the previous queues on. More about this in the [topics](#topics) section.

## Topics
Topics are used to receive request and broadcast changes.

### Requests Topics
The request are expected to come using the following topic format:
```
<binding>.request.<model>.<id|static>.<method>
```
where
- `<binding>` is the name of the binding prefix provided in the [settings](#Settings)
- `request` is hard coded for homogeneity with the [changes topics](#changes-topics)
- `<model>` is the name of the model concerned by the request
- `<id>` or `"static"` to specify a specific instance of the model or a static method.
- `<method>` name of the method called (also works with remote methods)

### Changes Topics
The changes are sent to the exchange using the following topic:
```
<binding>.changes.<model>.<id>.<type>
```
where
- `<binding>` is the name of the binding prefix provided in the [settings](#Settings)
- `changes` is hard coded for homogeneity with the [changes topics](#requests-topics)
- `<model>` is the name of the model concerned by the request
- `<id>` is the instance of the model concerned by the change
- `<type>` is the type of change in `['create','update','remove']`

## Request Emitter
To generate the request you can use a frontend loopback API server that uses the AMQP connector: https://github.com/Weaverize/loopback-connector-amqp.

# Example
On a simple loopback server that uses AMQP to provide requests this is an example on how to set the backend up in your `server/server.js`:
```js
'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var AMQP = require('loopback-amqp-backend');

var app = module.exports = loopback();
var amqp = null;

var amqpSettings = {
	'login': 'amqp-user',
	'password': 'amqp-password',
	'exchange': 'api',
	'queue': 'loopback',
	'binding': 'api'
};

app.start = function() {
  // start the web server
  return app.listen(function() {
	  amqp = new AMQP(app, amqpSettings, function() {
		  app.emit('started');
	  });
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
```

# Credit
Copyright (c) 2018, [Weaverize SAS](http://www.weaverize.com). All rights reserved. Contact: <dev@weaverize.com>.