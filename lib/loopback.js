// Copyright (c) 2018 Weaverize SAS <dev@weaverize.com>.
const AMQP = require('./amqp');

const changeType = {
	CREATE: 'create',
	UPDATE: 'update',
	DELETE: 'remove'
}

module.exports = function (loopbackApplication, options) {
	new AMQPBackend(loopbackApplication, options);
};

/**
 * Handles the bridge between AMQP and Loopback on the backend side
 */
class AMQPBackend {
	/**
	 * 
	 * @param {object} app Loopback application
	 * @param {object} settings 
	 * @param {function} callback call function when ready
	 */
	constructor(app, settings, callback) {

		this.onMessage = this.onMessage.bind(this);
		this.checkArgs = this.checkArgs.bind(this);
		this.ready = this.ready.bind(this);
		this.broadcastChange = this.broadcastChange.bind(this);

		/**
		 * AMQP broadcaster
		 */
		this.broadCaster = null;
		/**
		 * Function to callback when the module is ready
		 */
		this.readyCallback = callback;
		/**
		 * Loopback application
		 */
		this.app = app;
		/**
		 * Connection handler to AMQP
		 */
		this.amqp = new AMQP(settings, this.ready, this.checkArgs);
	}

	/**
	 * Binds listeners when AMQP is connected
	 * @param {*} broadcaster to send broadcast changes to AMQP
	 */
	ready(broadcaster) {
		this.broadCaster = broadcaster;
		console.log('should be connected to rabbitmq now');

		var that = this;
		this.app.models().forEach(function (model) {
			model.observe('after save', function (ctx, next) {
				that.broadcastChange(model.name, ctx.isNewInstance ? changeType.CREATE : changeType.UPDATE, ctx.instance);
				next();
			});
			model.observe('after delete', function (ctx, next) {
				that.broadcastChange(model.name, changeType.DELETE, ctx.where);
				next();
			});
		});
		this.readyCallback && this.readyCallback();
	}

	/**
	 * Calls a function with correct context and arguments
	 * @param {string} name name of the function (for messages)
	 * @param {object} model object defining the execution context
	 * @param {function} fun function to execute
	 * @param {object[]} args array of arguments to call the function with
	 */
	static execute(name, model, fun, args) {
		if (typeof fun == 'function') {
			fun.apply(model, args);
		}
		else {
			var callback = args[args.length - 1];
			if (typeof callback == 'function') {
				callback("couldn't process, " + name + " is " + typeof fun);
			}
			else {
				console.log("could not find callback function in request");
			}
		}
	}

	checkAccess(model, token, modelId, methodName, ctx, callback) {
		var ctx = ctx || {};
		var method = {
			name: methodName,
			aliases: []
		};
		model.sharedClass._methods.forEach(function (m) {
			if (m.name == methodName && (modelId && !m.isStatic)) {
				method = m;
			}
		});
		model.checkAccess(token, modelId, method, ctx, callback);
	}

	authHandler(model, tokenId, modelId, methodName, ctx, callback) {
		if (this.app.isAuthEnabled && this.app.models.ACL) {
			if (tokenId) {
				var AccessToken = this.app.registry.getModelByType('AccessToken');
				var that = this;
				AccessToken.findById(tokenId, function (err, token) {
					if (err) {
						callback(err, false);
					}
					else {
						that.checkAccess(model, token, modelId, methodName, callback);
					}
				});
			}
			else {
				this.checkAccess(model, null, modelId, methodName, callback);
			}
		}
		else {
			callback(null, true);
		}
	}

	checkArgs(payload, callback) {
		if (payload.model && payload.id && payload.method && payload.args) {
			if (payload.args instanceof Array) {
				this.onMessage(payload.model, payload.id, payload.method, payload.token, payload.args, callback);
			}
			else {
				callback({
					message: "args field should be an array",
					statusCode: 400,
					failCode: "Bad Request"
				});
			}
		}
		else {
			var message = "Missing fields in the payload: ";
			if (!payload.model)
				message += "model ";
			if (!payload.id)
				message += "id "
			if (!payload.method)
				message += "method ";
			if (!payload.args)
				message += "args ";
			callback({
				message: message,
				statusCode: 400,
				failCode: "Bad Request"
			});
		}
	}

	/**
	 * Unwrap the incoming message and prepare its execution in loopback
	 * @param {object[]} payload data concerning a request
	 * @param {function()} callback 
	 */
	onMessage(model, id, method, token, args, callback) {
		var name = "app.models.";
		args.push(callback);
		var id = (id != "static") ? id : null;
		var Model = this.app.models[model];

		if (!Model) {
			callback({
				message: "Model " + model + " is not defined",
				statusCode: 404,
				failCode: "Not Found"
			});
		}
		else {
			this.authHandler(Model, token, id, method, null, function (err, allowed) {
				if (!err && allowed) {
					if (id) {
						Model.findById(id, function (err, instance) {
							if (err) {
								callback(err);
							}
							else {
								if (instance) {
									name += model + "[" + id + "]." + method;
									if (instance[method]) {
										AMQPBackend.execute(name, instance, instance[method], args);
									}
									else {
										callback({
											message: "method " + method + " is not defined in " + model + " instance",
											statusCode: 404,
											failCode: "Not Found"
										});
									}
								}
								else {
									err = new Error();
									callback({ statusCode: 404 }, instance);
								}
							}
						});
					}
					else {
						name += model + '.' + method;
						if (Model[method]) {
							AMQPBackend.execute(name, Model, Model[method], args);
						}
						else {
							callback({
								message: "static method " + method + " is not defined in " + model,
								statusCode: 404,
								failCode: "Not Found"
							});
						}
					}
				}
				else {
					var e = new Error();
					if (err) {
						e.statusCode = 403;
						e.message = "Authentification token required";
					} else {
						e.statusCode = 401;
						e.message = "Access denied";
					}
					callback(e);
				}
			});
		}
	}

	/**
	 * Sends the changes to AMQP
	 * @param {string} model 
	 * @param {string} type 
	 * @param {object} instance 
	 */
	broadcastChange(model, type, instance) {
		var response = {
			target: instance.id,
			type: type
		}

		if (type == changeType.DELETE) {
			response.where = { id: instance.id };
		}
		else {
			response.data = instance;
		}
		this.broadCaster(model, response);
	}
};