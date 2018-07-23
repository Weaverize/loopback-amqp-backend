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

Topics are used to receive request and broadcast changes.

## Request
The following allows you to send queries.
### Payload
To make a request you have to send a JSON string as AMQP payload. Your request must be a single object containing the following fields:
- `model`: name of the model to use
- `id` : "static" or string instance id of the instance to use
- `method`: name of the model to apply on the model (if `id` == 'static') or instance of the model (otherwise)
- `args`: array of arguments to provide, must at least be an empty array if no args.
- `token` (optional): to make an authenticated request you must provide your access token here.

### Requests Topic
The request are expected to come using the following topic format. The value must match the payload's content.
```
<binding>.request.<model>.<id|static>.<method>
```
where
- `<binding>` is the name of the binding prefix provided in the [settings](#Settings)
- `request` is hard coded for homogeneity with the [changes topics](#changes-topics)
- `<model>` is the name of the model concerned by the request
- `<id>` or `"static"` to specify a specific instance of the model or a static method.
- `<method>` name of the method called (also works with remote methods)

### Request Emitter
To generate the request you can use a frontend loopback API server that uses the AMQP connector: https://github.com/Weaverize/loopback-connector-amqp.

## Response
### Request Parameters
In order to get a response you add properties to your request about how you want your response.
- `reply_to`: queue where to send the response to your query. It's a good thing to use a exclusive and non durable queue for this.
- `correlation_id`: this id allows you to match the response with the request. The response will have the same correlation id as your request. You can use any UUID generator to generate correlation ids.

### Response Payload
The response will be a JSON string containing an object. The object will have the following fields:
- `err`: null or object containing details about your error.
	- `err.message`: should contain a text message on what went wrong. Even an error stack if loopback is running in debug.
	- `err.statusCode`: should contain a number matching HTTP's error code. For example: 404
	- `err.failCode`: should contain a string of the name of the error (usually just two words). For example: Not Found
- `data`: object containing the response content. This could be null if an error occured.

## Changes
Changes are broadcasted on topics globabaly. The exchange will handle delivery of the message on the various queues.

### Changes Topics
The changes are sent to the exchange using the following topic structure:
```
<binding>.changes.<model>.<id>.<type>
```
where
- `<binding>` is the name of the binding prefix provided in the [settings](#Settings)
- `changes` is hard coded for homogeneity with the [changes topics](#requests-topics)
- `<model>` is the name of the model concerned by the request
- `<id>` is the instance of the model concerned by the change
- `<type>` is the type of change in `['create','update','remove']`

### Payload
The payload of a change is a JSON string of an object containing the following fields:
- `target`: id of the model's instance that was changed
- `type`: string of the change that was performed on the object should be either "create", "update" or "remove".
- `data` (optional): for "create" or "update", `data` is the object after the change.
- `where` (optional): for a "remove", is an object containing only the id of the removed object. For example: `{"id":"5b55f75f8314fb00050146df"}`

Here is a raw "create" payload example:
```json
{"target":"5b55f75f8314fb00050146df","type":"create","data":{"name":"test","id":"5b55f75f8314fb00050146df"}}
```
Here is a raw "update" payload example of the same object:
```json
{"target":"5b55f75f8314fb00050146df","type":"update","data":{"name":"renamed","id":"5b55f75f8314fb00050146df"}}
```
Here is a raw "remove" payload example of the same object:
```json
{"target":"5b55f75f8314fb00050146df","type":"remove","where":{"id":"5b55f75f8314fb00050146df"}}
```
Please be aware of the `where` field of this last payload.

### Binding
To receive changes you have to bind a queue to a topic. A good way to do this is to create an exclusive queue that is not durable.
To bind you have to ask the exchange to forward all the messages from a topic to your queue.

If you want to receive all the changes you can bind to `<binding>.changes.#`. `#` is a wildcard that replaces multiple words. If you want to bind to all the changes on the `User` model you can bind to `<binding>.changes.User.#`.

If you want to replace exactly one word, you can use the wildcard `*`. For example, if you want to send a mail to newly created user you can bind on `<binding>.changes.User.*.create`.

# Credit
Copyright (c) 2018, [Weaverize SAS](http://www.weaverize.com). All rights reserved. Contact: <dev@weaverize.com>.
