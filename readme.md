# loopback-amqp-backend
Module to process request received and response sent back through AMQP to Loopback.
This module also broadcasts every changes made to a Model instance to the AMQP exchange.

## Install
Just run npm
```
npm install --save loopback-amqp-backend
```

## Settings
To configure this loopback component edit your `component-config.json` file with an adapted version of the following:
Connectors settings through component-config.json:
```json
{
	"loopback-amqp-backend": {
		"host": "localhost",
		"port": "5672",
		"login": "",
		"password": "",
		"exchange": "loopback",
		"binding": "loopback",
		"queue": "loopback"
	}
}
```
- `host` (default: `127.0.0.1`) and `port` (default: `5672`) of your AMQP server
- `login` and `password` to connect to your AMQP server (default is empty)
- `exchange` name of the AMQP exchange to use (default: `loopback`). If the exchange doesn't exist, it will be created.
- `queue` prefix to use to name the queue (default: `loopback`).
- `binding` prefix binding to use for registering the previous queues on.

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

# Credit
Copyright (c) 2018, [Weaverize SAS](http://www.weaverize.com). All rights reserved. Contact: <dev@weaverize.com>.
