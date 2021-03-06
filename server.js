'use strict';
const config = require('./config');
// create an API server
const Restify = require('restify');
const server = Restify.createServer({
	name: 'dhlbot'
});
const PORT = process.env.PORT || 3000;

// FBeamer
const FBeamer = require('./fbeamer');
const f = new FBeamer(config.FB);

server.use(Restify.jsonp());
server.use(Restify.bodyParser());
server.use((req, res, next) => f.verifySignature(req, res, next));

//seed db
var mongoose = require('mongoose');
// mongoose.connect("mongodb://localhost/dhlbot"); 
const {MONGO_URI} = require('./config');
mongoose.connect(`${MONGO_URI}`); 
const seedDB = require('./seedDB');
//seedDB();

//agenda
const agenda = require('./agenda')(f);

//session
const session = require('./session');

//WIT actions
const actions = require('./actions')(session, f, agenda);

// WIT.AI
const Wit = require('node-wit').Wit;
const wit = new Wit({
	accessToken: config.WIT_ACCESS_TOKEN,
	actions
});

// Register the webhooks
server.get('/', (req, res, next) => {
	f.registerHook(req, res);
	return next();
});

agenda.on('ready', () => {
	// Handle incoming
	server.post('/', (req, res, next) => {
		f.incoming(req, res, msg => {
			const {
				sender,
				postback,
				message
			} = msg;

			// if(postback) {
			// 	const {
			// 		schedule,
			// 		fbid,
			// 		id
			// 	} = JSON.parse(postback.payload);
			// 	agenda.now(schedule, {
			// 		fbid,
			// 		id
			// 	});
			// }

			if(message.text) {
				// Process the message here
				let sessionId = session.init(sender);
				let {context} = session.get(sessionId);
				//Run wit actions
				wit.runActions(sessionId, message.text, context)
					.then(ctx => {
						//Delete session if conversation is over
						ctx.jobDone ? session.delete(sessionId) : session.update(sessionId, ctx);			
					})
					.catch(error => console.log(`Error: ${error}`));
			}

		});

		return next();
	});

	agenda.start();
});


// Subscribe
f.subscribe();

server.listen(PORT, () => console.log(`DHLBot running on port ${PORT}`));

