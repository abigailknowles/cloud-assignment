//Object data modelling library for mongo
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const express = require('express')
const app = express()
const port = 3000

//connection string listing the mongo servers. This is an alternative to using a load balancer. THIS SHOULD BE DISCUSSED IN YOUR ASSIGNMENT.
const connectionString = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/notFLIX_DB?replicaSet=rs0';

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


/**
 * 
 * message processing
 * 
 */
//RabbitMQ
const axios = require('axios');
const os = require('os');

var amqp = require('amqplib/callback_api');
const { Console } = require('console');
var hostname = os.hostname;
var exchange = 'nodes';
var isAlive = false;
var isLeader = false;
var msg;
var messageQueueStarted = false;
var nodeId = Math.floor(Math.random() * (100 - 1 + 1) + 1);
var seconds = getTimeInSeconds();
var messageList = [];
var scaledOut = false;
var deadLetterQueue = [];
//config variables for scaling up and down times - change these values if you want to test the auto-scailing
var containerScaleUpTime = 15;
var containerScaleDownTime = 17;

function main() {

  setInterval(publishMessages, 5000);

  processMessages();

  setInterval(selectNewLeader, 2000);

  setInterval(createDeadLetterQueue, 2000);

  setInterval(processDeadLetterQueue, 3000);

  setInterval(scaleOut, 5000);

  setInterval(scaleIn, 5000);
}

function publishMessages() {
  amqp.connect('amqp://user:bitnami@cloud_haproxy_1', function (error0, connection) {

    //if connection failed throw error
    if (error0) {
      throw error0;
    }

    //create a channel if connected and send hello world to the logs Q
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      seconds = getTimeInSeconds();
      if (!isLeader) {
        seconds = seconds + 2
      } else {
        seconds = seconds - 2
      }

      isAlive = true;

      msg = `{"id": ${nodeId}, "hostname": "${hostname}", "isAlive": "${isAlive}", "lastSeenAlive": "${seconds}" }`;

      channel.assertExchange(exchange, 'fanout', {
        durable: false
      });

      channel.publish(exchange, '', Buffer.from(msg));

      //in 1/2 a second force close the connection
      setTimeout(function () {
        connection.close();
      }, 500);
    });
  });
}

function processMessages() {
  amqp.connect('amqp://user:bitnami@cloud_haproxy_1', function (error0, connection) {
    if (error0) {
      throw error0;
    }

    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      channel.assertExchange(exchange, 'fanout', { durable: false });

      channel.assertQueue('', { exclusive: true }, function (error2, q) {
        if (error2) {
          throw error2;
        }

        console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", q.queue);
        channel.bindQueue(q.queue, exchange, '');

        channel.consume(q.queue, function (msg) {
          processMessage(msg);
        }, {
          noAck: true
        });
      });
    });
  });
}

function processMessage(msg) {
  if (msg.content) {
    if (isLeader) {
      console.log("PROCESSING MESSAGE: ", msg.content.toString())
    }

    messageQueueStarted = true;

    var messageContent = JSON.parse(msg.content.toString());

    if (messageList.some(message => message.hostname === messageContent.hostname) === false) {
      messageList.push(messageContent);
    } else {
      var message = messageList.find(message => message.hostname === messageContent.hostname);

      if (message.id !== messageContent.nodeId)
        message.id = messageContent.nodeId;

      message.seconds = seconds;
    }
  }
}

function getTimeInSeconds() {
  return Math.round(new Date().getTime() / 1000, 2);
}

function selectNewLeader() {
  if (messageQueueStarted) {
    var currentHighestNodeId = 0;
    messageList.forEach(message => {
      //for consistency across all nodes we need to find the current highest node id value
      if (message.hostname !== hostname && message.id > currentHighestNodeId) {
        currentHighestNodeId = message.id;
      }
    });

    //if this node has the highest id value set it to be the new leader
    if (nodeId > currentHighestNodeId) {
      isLeader = true;
      console.log("I am the leader: " + nodeId)
    } else {
      // setting this incase a new node is selected leader, with a higher ID than mine
      isLeader = false;
    }
  }
}

function createDeadLetterQueue() {
  Object.entries(messageList).forEach(([index, message]) => {
    if (Math.round(seconds - message.lastSeenAlive) > 20) {
      message.isAlive = false;
      deadLetterQueue.push({ "id": index, "message": message });
    } else {
      message.isAlive = true;
    }
  });
}

function processDeadLetterQueue() {
  for (let i = 0; i < deadLetterQueue.length; i++) {
    if (isLeader) {
      console.log(`STARTING NODE: ${deadLetterQueue[i].message.hostname}`);
      startContainer(getConfig());
    }

    stopContainer(deadLetterQueue[i].message.hostname);
    messageList.splice(deadLetterQueue[i].id);
  }
}

function getConfig() {
  return {
    Image: "cloud_node1",
    Hostname: "container" + getRandomIntInclusive(100, 999),
    NetworkingConfig: {
      EndpointsConfig: {
        "cloud_nodejs": {},
      }
    }
  }
}

// Purpose is to add a random number to the end of a container name
function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

// TODO: Fix bug around containers not always starting up
async function startContainer(details) {
  try {
    await axios.post(`http://host.docker.internal:2375/containers/create?name=${details.Hostname}`, details);
    await axios.post(`http://host.docker.internal:2375/containers/${details.Hostname}/start`);
  } catch (error) {
    if (error.response.statusText === "Conflict") {
      console.log("already scaled out, action not required");
    } else {
      console.log(error);
    }

  }
}

async function stopContainer(hostname) {
  try {
    await axios.post(`http://host.docker.internal:2375/containers/${hostname}/kill`);
    await axios.delete(`http://host.docker.internal:2375/containers/${hostname}`);
  } catch (error) {
    if (error.response.statusText === "Conflict") {
      console.log("already scaled in, action not required");
    } else {
      console.log(error);
    }
  }
}

function scaleOut() {
  if (!scaledOut && isLeader) {
    var currentHour = new Date().getHours();
    console.log("CURRENT HOUR: ", currentHour);
    //accounting for daylight saving
    if (currentHour >= containerScaleUpTime && currentHour < containerScaleDownTime) {

      startContainer(getConfig());
      startContainer(getConfig());

      scaledOut = true;
    }
  }
}

function scaleIn() {
  if (scaledOut && isLeader) {
    var currentHour = new Date().getHours();
    //accounting for daylight saving
    if (currentHour < containerScaleUpTime && currentHour >= containerScaleDownTime) {
      //removing item out of list at index 0 
      //grabbing a random node each time to avoid getting and stopping the same node each time
      var containers = messageList.slice(2);
      var container1 = containers[0];
      var container2 = containers[1];

      stopContainer(container1.Hostname);
      stopContainer(container2.Hostname);

      scaledOut = false;
    }
  }
}

main();