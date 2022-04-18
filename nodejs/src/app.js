//Object data modelling library for mongo
const mongoose = require('mongoose');

//RabbitMQ
var amqp = require('amqplib/callback_api');

//Express web service library
const express = require('express')

const axios = require('axios');

//used to parse the server response from json to object.
const bodyParser = require('body-parser');

//instance of express and port to use for inbound connections.
const app = express()
const port = 3000

//connection string listing the mongo servers. This is an alternative to using a load balancer. THIS SHOULD BE DISCUSSED IN YOUR ASSIGNMENT.
const connectionString = 'mongodb://localmongo1:27017,localmongo2:27017,localmongo3:27017/notFLIX_DB?replicaSet=rs0';

//retrieve the hostname of a node
const os = require('os');
var hostname = os.hostname;
// identify whether a node is alive or the leader
var isAlive = false;
var isLeader = false;

var exchange;
var msg;
var messageQueueStarted = false;

//generate node id and find current time in seconds
var nodeId = Math.floor(Math.random() * (100 - 1 + 1) + 1);
var seconds = getTimeInSeconds();

//create a list of details about the nodes
var nodes = { id: nodeId, hostname: hostname, isAlive: isAlive, lastSeenAlive: seconds };
var messageList = [];
messageList.push(nodes);

//publisher
setInterval(function () {
  // connect to haproxy
  amqp.connect('amqp://user:bitnami@cloud-assignment_haproxy_1', function (error0, connection) {

    //if connection failed throw error
    if (error0) {
      throw error0;
    }
    //create a channel if connected and send hello world to the logs Q
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      exchange = 'nodes';
      seconds = getTimeInSeconds();
      isAlive = true;

      msg = `{"id": ${nodeId}, "hostname": "${hostname}", "isAlive": "${isAlive}", "lastSeenAlive": "${seconds}" }`;

      channel.assertExchange(exchange, 'fanout', {
        durable: false
      });
      channel.publish(exchange, '', Buffer.from(msg));
      //console.log("[x] Sent %s", msg);
    });
    //in 1/2 a second force close the connection
    setTimeout(function () {
      connection.close();
    }, 500);
  });
}, 3000);

//subscriber
// connect to ha proxy

amqp.connect('amqp://user:bitnami@cloud-assignment_haproxy_1', function (error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }
    exchange = 'nodes';

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
          //console.log("Received [x] %s", msg.content.toString());
          messageQueueStarted = true;

          var messageContent = JSON.parse(msg.content.toString());
          var newTime = getTimeInSeconds();

          if (messageList.some(message => message.hostname === messageContent.hostname) === false) {
            messageList.push(messageContent);
          } else {


          }
        }
      }, {
        noAck: true
      });
    });
  });
});

// every 3 seconds check for a new leader and select one based on the highest id value
setInterval(function () {
  if (messageQueueStarted) {
    var currentHighestNodeId = 0;
    messageList.forEach(message => {
      //for consistency across all nodes we need to find the current highest node id value
      if (message.hostname !== hostname && message.id > currentHighestNodeId) {
        currentHighestNodeId = message.id;
      }
    });

    //if this node has the highest id value set it to be the new leader
    if (nodeId >= currentHighestNodeId)
      isLeader = true;

  }
}, 3000);

setInterval(function () {
  if (isLeader) {
    messageList.forEach(message => {
      console.log("last seen time: ", Math.round(seconds - message.lastSeenAlive))
      if (Math.round(seconds - message.lastSeenAlive) > 10) {
        message.isAlive = false;
        console.log(`Node with ID: ${message.id} not seen for longer than 10 seconds`);
        createContainer();
      } else {
        message.isAlive = true;
      }
    });
    console.log("checked for dead message");
  }
}, 25000);

function getTimeInSeconds() {
  return Math.round(new Date().getTime() / 1000, 2);
}

async function createContainer() {
  var containerDetails = {
    Image: "cloud-assignment_node1",
    Hostname: `node_${messageList.length + 1}`,
    NetworkConfig: {
      EndpointsConfig: {
        "cloud-assignment_nodejs": {},
      },
    },
  };
  try {
    await axios.post(`http://host.docker.internal:2375/containers/create?name=nodeContainer_${messageList.length + 1}`, containerDetails).then(function (response) { console.log(response) });
    await axios.post(`http://host.docker.internal:2375/containers/nodeContainer_${messageList.length + 1}/start`);
  }
  catch (error) {
    console.log(error);
  }
}

//bind the express web service to the port specified
app.listen(port, () => {
  console.log(`Express Application listening at port ` + port)
})

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


