// Copyright (c) 2018 Weaverize SAS <dev@weaverize.com>.
const amqp = require('amqplib/callback_api');

module.exports = class AMQP {
	/**
	 * Connects to AMQP servers and create exchange if needed
	 * @param {function()} callback
	 */
	constructor(settings, callback, onmessage) {
		AMQP.defaults(settings);
		this.channel = null;
		this.exchange = null;
		this.binding = settings.binding;
		this.msgCallback = onmessage;

		this.responseFactory = this.responseFactory.bind(this);
		this.requestHandler = this.requestHandler.bind(this);
		this.broadcast = this.broadcast.bind(this);

		var that = this;
		amqp.connect(settings.url, function (err, conn) {
			if (!err) {
				conn.createChannel(function (err, ch) {
					that.channel = ch;
					that.channel.assertExchange(settings.exchange, 'topic', { durable: true });
					that.exchange = settings.exchange;
					that.channel.assertQueue(settings.queue, { exclusive: false }, function (err, queue) {
						that.channel.bindQueue(queue.queue, settings.exchange, settings.binding + '.request.#', {});
						that.channel.consume(queue.queue, that.requestHandler);
					});
					callback(that.broadcast);
				});
			} else {
				console.log(err);
				console.log("is the port corresponding to the server's 5672 port ?");
			}
		});
	}

	/**
	 * Check the parameters and add default value if needed
	 * @param {Object} settings
	 */
	static defaults(settings) {
		settings.login = settings.login || '';
		settings.password = settings.password || '';
		settings.host = settings.host || '127.0.0.1';
		settings.port = settings.port || 5672;
		settings.exchange = settings.exchange || 'loopback';
		settings.binding = settings.binding || 'loopback';
		settings.queue = settings.queue || 'loopback';
		var login = '';
		if (settings.password)
			settings.login += ':' + settings.password;
		if (settings.login)
			login += settings.login + '@';
		settings.url = settings.url || 'amqp://' + login + settings.host + ':' + settings.port;
	}

	/**
	 * Wraps the callback with request parameters
	 * @param {object} request request received from AMQP
	 */
	responseFactory(request) {
		var req = request;
		var that = this;
		return function (err, data) {
			var res = JSON.stringify({ err: err, data: data });
			that.channel.sendToQueue(req.properties.replyTo, new Buffer(res), {
				correlationId: req.properties.correlationId
			});
			that.channel.ack(req);
		};
	}

	/**
	 * Handler for loopback requests
	 * @param {object} req request received from AMQP
	 */
	requestHandler(req) {
		var callback = this.responseFactory(req);
		try {
			var content = JSON.parse(req.content.toString())
		}
		catch(e) {
			callback({
				message : e.message,
				statusCode : 400,
				failCode : "Bad Request"
			});
		}
		this.msgCallback(content, callback);
	}

	/**
	 * Sends a message to AMQP through the exchange
	 * @param {object} message 
	 */
	broadcast(model, message) {
		var topic = [this.binding, 'changes', model, message.target, message.type].join('.');
		console.log(topic);
		this.channel.publish(this.exchange, topic, new Buffer(JSON.stringify(message)));
	}
}
