//Object data modelling library for mongo
const mongoose = require('mongoose');

//RabbitMQ
var amqp = require('amqplib/callback_api');

//Express web service library
const express = require('express')

//used to parse the server response from json to object.
const bodyParser = require('body-parser');

//instance of express and port to use for inbound connections.
const app = express()
const port = 3000

//connection string listing the mongo servers. This is an alternative to using a load balancer. THIS SHOULD BE DISCUSSED IN YOUR ASSIGNMENT.
const connectionString = 'mongodb://localmongo1:27017,localmongo2:27017,localmongo3:27017/notFLIX_DB?replicaSet=rs0';

//retrieve the hostname of a node
const os = require('os');
var nodeHost = os.hostname;

// identify whether a node is alive or the leader
var isNodeAlive = false;
var isNodeTheLeader = false;

var exchange;
var msg;

//generate node id and find current time in seconds
var nodeId = Math.floor(Math.random() * (100 - 1 + 1) + 1);
var currentTime = new Date().getTime / 1000;

//create a list of details about the nodes
var nodes = { nodeId: nodeId, hostname: nodeHost, isNodeAlive: isNodeAlive, lastMessageReceived: currentTime };
var nodesList = [];
nodesList.push(nodes);

setInterval(function () {
  // connect to haproxy
  amqp.connect('amqp://test:test@cloud-assignment_haproxy_1', function (error0, connection) {

    //if connection failed throw error
    if (error0) {
      throw error0;
    }
    //create a channel if connected and send hello world to the logs Q
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }
      exchange = 'NODE ALIVE';
      currentTime = new Date().getTime / 1000;
      isNodeAlive = true;

      msg = `{"nodeId": ${nodeId}, "hostname":${nodeHost}, "isNodeAlive": ${isNodeAlive}, "lastMessageReceived": ${currentTime}}`;

      channel.assertExchange(exchange, 'fanout', {
        durable: false
      });
      channel.publish(exchange, '', Buffer.from(msg));
      console.log(" [x] Sent %s", msg);
    });
    //in 1/2 a second force close the connection
    setTimeout(function () {
      connection.close();
    }, 500);
  });

}, 3000);


//bind the express web service to the port specified
app.listen(port, () => {
  console.log(`Express Application listening at port ` + port)
})
// connect to ha proxy
amqp.connect('amqp://test:test@cloud-assignment_haproxy_1', function (error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }
    exchange = 'NODE ALIVE';

    channel.assertExchange(exchange, 'fanout', {
      durable: false
    });

    channel.assertQueue('', {
      exclusive: true
    }, function (error2, q) {
      if (error2) {
        throw error2;
      }
      console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", q.queue);
      channel.bindQueue(q.queue, exchange, '');

      channel.consume(q.queue, function (msg) {


        if (msg.content) {
          console.log(" [x] %s", msg.content.toString());
          //TODO: identify current node in here
          //TODO: check if node exists in a list, if not create it
        }


      }, {
        noAck: true
      });
    });
  });
});

//tell express to use the body parser. Note - This function was built into express but then moved to a seperate package.
app.use(bodyParser.json());

//connect to the cluster
mongoose.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });


var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

var Schema = mongoose.Schema;

//setting up the database
var analyticsSchema = new Schema({
  _id: Number,
  accountId: Number,
  username: String,
  titleId: Number,
  userAction: String,
  dateAndTime: String,
  pointOfInteraction: String,
  typeOfInteraction: String
});

var analyticsModel = mongoose.model('Analytics', analyticsSchema, 'analytics');


app.get('/', (req, res) => {
  analyticsModel.find({}, 'username title_id user_action', (err, analytics) => {
    if (err) return handleError(err);
    res.send(JSON.stringify(analytics))
  })
})

app.post('/', (req, res) => {
  var new_analytics_instance = new analyticsModel(req.body);
  new_analytics_instance.save(function (err) {
    if (err) res.send('Error');
    res.send(JSON.stringify(req.body))
  });
})

app.put('/', (req, res) => {
  res.send('Got a PUT request at /')
})

app.delete('/', (req, res) => {
  res.send('Got a DELETE request at /')
})


