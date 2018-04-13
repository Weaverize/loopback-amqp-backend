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
		this.amqp = new AMQP(settings, this.ready, this.onMessage);
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
			callback("couldn't process, " + name + " is " + typeof fun);
		}
	}

	checkAccess(model, token, modelId, methodName, ctx, callback)
	{
		var ctx = ctx || {};
		var method = {
			name: methodName,
			aliases: []
		};
		model.sharedClass._methods.forEach(function(m) {
			if (m.name == methodName && (modelId && !m.isStatic))
			{
				method = m;
			}
		});
		model.checkAccess(token, modelId, method, ctx, callback);
	}

	authHandler(model, tokenId, modelId, methodName, ctx, callback) {
		if (this.app.isAuthEnabled && this.app.models.ACL) {
			if (tokenId)
			{
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
			else
			{
				this.checkAccess(model, null, modelId, methodName, callback);
			}
		}
		else {
			callback(null, true);
		}
	}

	/**
	 * Unwrap the incoming message and prepare its execution in loopback
	 * @param {boolean} isStatic tells if the function is static
	 * @param {object[]} args message containing all arguments
	 * @param {function()} callback 
	 */
	onMessage(isStatic, args, callback) {
		var name = "app.models.";
		var model = args[0];
		var Model = this.app.models[model];
		console.log("onMessage", arguments);

		if (!isStatic) {
			var id = args[1];
			var method = args[2];
			name += model + "[" + id + "]." + method;
			args.splice(0, 3);
			args.push(callback);
			//TODO: call authHandler before doing this:
			Model.findById(id, function (err, instance) {
				if (err) {
					callback(err);
				}
				else {
					if (instance) {
						AMQPBackend.execute(name, instance, instance[method], args);
					}
					else {
						err = new Error({ statusCode: 404 });
						callback(err, instance);
					}
				}
			});
		}
		else {
			var method = args[1];
			var token = args[3] && args[3].accessToken;
			args.splice(0, 2);
			args.push(callback);
			name += model + '.' + method;
			this.authHandler(Model, token, null, method, null, function (err, allowed) {
				console.log(name, err, allowed);
				if (!err && allowed) {
					AMQPBackend.execute(name, Model, Model[method], args);
				}
				else {
					if (err) {
						var e = new Error();
						e.statusCode = 403;
						e.message = "Authentification token required";
						callback(e);
					} else {
						var e = new Error();
						e.message = "Access denied";
						e.statusCode = 401;
						callback(e);
					}
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
